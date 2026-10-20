import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ClaudeStreamParser, type ClaudeStreamUpdate } from '../core/claudeStream';
import { AiNotConfiguredError, BACKEND_LABELS, type Backend, type BackendId, type ChatRequest, type ModelInfo } from './types';

type CliId = Extract<BackendId, 'claudeCode' | 'codex'>;

/** Agent CLIs that reuse the user's own sign-in (Claude subscription, ChatGPT plan) — no API key. */
export class CliBackend implements Backend {
  constructor(readonly id: CliId) {}

  /** Bundled binary of the installed VS Code extension first, then PATH. */
  binary(): string | undefined {
    const exe = process.platform === 'win32' ? '.exe' : '';
    if (this.id === 'claudeCode') {
      const ext = vscode.extensions.getExtension('anthropic.claude-code');
      const bundled = ext && path.join(ext.extensionPath, 'resources', 'native-binary', `claude${exe}`);
      if (bundled && fs.existsSync(bundled)) return bundled;
    }
    // shortcut: Windows npm shims (.cmd) need a shell and are not found here; add shell spawning if users ask.
    const name = `${this.id === 'claudeCode' ? 'claude' : 'codex'}${exe}`;
    const dirs = [...(process.env.PATH ?? '').split(path.delimiter), path.join(os.homedir(), '.local', 'bin')];
    return dirs.map((d) => path.join(d, name)).find(isFile);
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.binary()
      ? [{ backend: this.id, id: '', label: BACKEND_LABELS[this.id], detail: 'Uses your CLI sign-in · no API key' }]
      : [];
  }

  stream(model: string, request: ChatRequest, onText: (text: string) => void, token: vscode.CancellationToken): Promise<string> {
    const bin = this.binary();
    if (!bin) throw new AiNotConfiguredError(`${BACKEND_LABELS[this.id]} is not installed.`);
    const transcript =
      request.messages.length === 1
        ? request.messages[0].content
        : request.messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
    const args =
      this.id === 'claudeCode'
        ? // No tools, settings, hooks or MCP: plain text completion only.
          [
            '-p',
            '--output-format',
            'stream-json',
            '--verbose',
            '--include-partial-messages',
            '--tools',
            '',
            '--setting-sources',
            '',
            '--strict-mcp-config',
            '--no-session-persistence',
            '--system-prompt',
            request.system,
            ...(model ? ['--model', model] : []),
          ]
        : ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '--color', 'never', ...(model ? ['-m', model] : []), '-'];
    const input = this.id === 'claudeCode' ? transcript : `${request.system}\n\n---\n\n${transcript}`;

    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
      const cancel = token.onCancellationRequested(() => child.kill());
      const parser = new ClaudeStreamParser();
      let full = '';
      let result = '';
      let stderr = '';
      let error = '';
      const apply = (update: ClaudeStreamUpdate) => {
        if (update.text) {
          full += update.text;
          onText(update.text);
        }
        if (update.result) result = update.result;
        if (update.error) error = update.error;
      };
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        if (this.id === 'codex') {
          // codex prints only the final message on stdout (progress goes to stderr).
          full += chunk;
          return onText(chunk);
        }
        apply(parser.push(chunk));
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr = (stderr + chunk).slice(-2000)));
      child.on('error', (err) => {
        cancel.dispose();
        reject(err);
      });
      child.on('close', (code) => {
        cancel.dispose();
        if (token.isCancellationRequested) return resolve(full);
        apply(parser.flush());
        if (error || code) return reject(new Error(error || lastLine(stderr) || `${BACKEND_LABELS[this.id]} exited with code ${code}.`));
        if (!full && result) apply({ text: result });
        if (!full.trim())
          return reject(new Error(`${BACKEND_LABELS[this.id]} returned no text.${lastLine(stderr) ? ` ${lastLine(stderr)}` : ''}`));
        resolve(this.id === 'codex' ? full.trim() : full);
      });
      // EPIPE when the CLI exits before reading stdin; 'close' reports the real error.
      child.stdin.on('error', () => undefined);
      child.stdin.end(input);
    });
  }
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function lastLine(text: string): string {
  return text.trim().split('\n').pop()?.trim() ?? '';
}
