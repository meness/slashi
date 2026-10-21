import * as path from 'node:path';
import * as vscode from 'vscode';
import { get } from '../config';

/** Runs shell commands in reusable `Slashi` terminals, one per working directory. */
export class TerminalRunner implements vscode.Disposable {
  /** Where to run when no editor is active, e.g. the file the popup opened over. */
  constructor(private readonly fallback: () => vscode.Uri | undefined = () => undefined) {}

  private readonly terminals = new Map<string, vscode.Terminal>();
  /** Terminals running a command, as far as shell integration reports. */
  private readonly busy = new Set<vscode.Terminal>();
  private readonly subs = [
    vscode.window.onDidCloseTerminal((t) => {
      this.busy.delete(t);
      for (const [key, value] of this.terminals) if (value === t) this.terminals.delete(key);
    }),
    vscode.window.onDidStartTerminalShellExecution((e) => this.busy.add(e.terminal)),
    vscode.window.onDidEndTerminalShellExecution((e) => this.busy.delete(e.terminal)),
  ];

  run(command: string, options: RunOptions = {}): vscode.Terminal {
    const { terminal } = this.terminal(options, false);
    terminal.sendText(command, true);
    // Busy until shell integration reports the end, which can come before it reports the start.
    // shortcut: without shell integration it stays busy, so waited steps open a new terminal; fine for a rare setup.
    this.busy.add(terminal);
    return terminal;
  }

  /**
   * Runs `command` and resolves with its exit code when it ends: undefined when the shell didn't report one
   * or the terminal closed first. Resolves right away with undefined (after sending the text) when the shell
   * has no shell integration, so there is nothing to wait for.
   */
  async runAndWait(command: string, options: RunOptions = {}): Promise<{ exitCode: number | undefined } | undefined> {
    const { terminal, created } = this.terminal(options, true);
    const integration = terminal.shellIntegration ?? (created ? await shellIntegration(terminal) : undefined);
    if (!integration) {
      terminal.sendText(command, true);
      return undefined;
    }
    // Throws only for task terminals, which Slashi never creates. Events arrive later, so subscribing after is safe.
    const execution = integration.executeCommand(command);
    return new Promise((resolve) => {
      const done = (exitCode: number | undefined) => {
        end.dispose();
        close.dispose();
        resolve({ exitCode });
      };
      const end = vscode.window.onDidEndTerminalShellExecution((e) => {
        if (e.execution === execution) done(e.exitCode);
      });
      const close = vscode.window.onDidCloseTerminal((t) => {
        if (t === terminal) done(undefined);
      });
    });
  }

  /** Waited commands never reuse a busy terminal: executeCommand sends ^C to a running command (a dev server, say). */
  private terminal(options: RunOptions, waiting: boolean): { terminal: vscode.Terminal; created: boolean } {
    const root = workspaceRoot(this.fallback());
    const cwd = options.cwd ?? root;
    const reuse = options.reuse ?? get('terminal.reuse', true);
    const key = `${options.name ?? ''}|${cwd ?? ''}`;
    const existing = reuse ? this.terminals.get(key) : undefined;
    if (existing && !existing.exitStatus && !(waiting && this.busy.has(existing))) {
      existing.show(false);
      return { terminal: existing, created: false };
    }
    const label = options.name ?? (cwd && cwd !== root ? `Slashi · ${path.basename(cwd)}` : 'Slashi');
    const terminal = vscode.window.createTerminal({ name: label, cwd, iconPath: new vscode.ThemeIcon('terminal-cmd') });
    if (reuse) this.terminals.set(key, terminal);
    terminal.show(false);
    return { terminal, created: true };
  }

  dispose(): void {
    for (const s of this.subs) s.dispose();
  }
}

interface RunOptions {
  cwd?: string;
  name?: string;
  reuse?: boolean;
}

/** Waits up to `timeoutMs` for a new terminal's shell integration; undefined if it never activates. */
function shellIntegration(terminal: vscode.Terminal, timeoutMs = 3000): Promise<vscode.TerminalShellIntegration | undefined> {
  return new Promise((resolve) => {
    const done = (value: vscode.TerminalShellIntegration | undefined) => {
      clearTimeout(timer);
      sub.dispose();
      resolve(value);
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    const sub = vscode.window.onDidChangeTerminalShellIntegration((e) => {
      if (e.terminal === terminal) done(e.shellIntegration);
    });
  });
}

/** The workspace folder of the active editor (or of `fallback`), else the first folder. */
export function workspaceRoot(fallback?: vscode.Uri): string | undefined {
  const editorUri = vscode.window.activeTextEditor?.document.uri ?? fallback;
  const folder = (editorUri && vscode.workspace.getWorkspaceFolder(editorUri)) ?? vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath;
}

export function shellKind(): 'posix' | 'powershell' | 'cmd' {
  const shell = (vscode.env.shell || '').toLowerCase();
  if (shell.includes('pwsh') || shell.includes('powershell')) return 'powershell';
  if (shell.endsWith('cmd.exe')) return 'cmd';
  return 'posix';
}
