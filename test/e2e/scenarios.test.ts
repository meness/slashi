// End-to-end scenarios in a real VS Code, run against the throwaway Git repo that run.ts creates.
// A test can't answer Slashi's dialogs (each extension gets its own `vscode` API object), so these scenarios avoid
// them with settings; the smoke test covers the paths behind dialogs with a mocked API.
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

interface SlashiApi {
  run(slash: string): Promise<boolean>;
  registerProvider(provider: {
    extensionId: string;
    id: string;
    title: string;
    prefix: string;
    items(): { id: string; title: string; name?: string; args?: string; run(args: string): unknown }[];
  }): vscode.Disposable;
}

interface GitRepository {
  inputBox: { value: string };
  status(): Promise<void>;
}

const ws = vscode.workspace.workspaceFolders![0].uri.fsPath;
const marker = path.join(ws, 'format-ran.txt');
const git = (...args: string[]) => execFileSync('git', args, { cwd: ws, encoding: 'utf8' }).trim();
const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const log = (text: string) => console.log(`      → ${text}`);

async function waitFor<T>(probe: () => T | Promise<T>, label: string, ms = 30_000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${label}`);
    await sleep(250);
  }
}

const readMarker = () => fs.existsSync(marker) && fs.readFileSync(marker, 'utf8');

async function open(file: string): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument(path.join(ws, file));
  await vscode.window.showTextDocument(doc);
  return doc;
}

async function repository(): Promise<GitRepository> {
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: GitRepository[] } }>('vscode.git')!;
  const api = (await ext.activate()).getAPI(1);
  return waitFor(() => api.repositories[0], 'the Git repository');
}

suite('Slashi end to end', () => {
  let api: SlashiApi;
  const events: string[] = [];

  suiteSetup(async () => {
    api = await vscode.extensions.getExtension<SlashiApi>('meness.slashi')!.activate();
    // What reached the terminal, for the log when a terminal scenario fails.
    vscode.window.onDidStartTerminalShellExecution((e) => events.push(`ran: ${e.execution.commandLine.value}`));
    vscode.window.onDidEndTerminalShellExecution((e) => events.push(`exit code: ${e.exitCode}`));
  });

  teardown(function () {
    if (this.currentTest?.state === 'failed' && events.length) log(`terminal: ${events.join(' | ')}`);
    events.length = 0;
  });

  test('/format runs Format Document, not the package script of the same name', async () => {
    const doc = await open('app.ts');
    // The TypeScript formatter needs its language server, which starts on demand.
    await waitFor(
      async () => {
        await api.run('/format');
        await sleep(1000);
        return doc.getText() === 'export const value = 1\n';
      },
      'the document to be formatted',
      60_000,
    );
    await sleep(2000);
    assert.equal(readMarker(), false, 'the format script must not run');
  });

  test('/format --check passes the arguments to the script', async () => {
    assert.equal(await api.run('/format --check'), true);
    assert.equal(await waitFor(readMarker, 'the script to run', 60_000), 'args:--check');
  });

  test('/again repeats the last command with its arguments', async () => {
    fs.rmSync(marker, { force: true });
    assert.equal(await api.run('/again'), true);
    assert.equal(await waitFor(readMarker, 'the script to run again', 60_000), 'args:--check');
    fs.rmSync(marker, { force: true });
  });

  test('team files with comments and trailing commas load, and `languages` follows the editor', async () => {
    await open('app.ts');
    assert.equal(await api.run('/hello'), true, '/hello from .vscode/slashi.json');
    assert.equal(await api.run('/ts-only'), true, 'shown in a TypeScript file');
    await open('notes.txt');
    assert.equal(await api.run('/ts-only'), false, 'hidden in a plain-text file');
  });

  test('a terminal step waits for its command, leaves background ones running, and a failure stops the command', async () => {
    const write = (file: string, js: string) => `node -e "require('fs').writeFileSync('${file}', ${js})"`;
    const exists = (file: string) => fs.existsSync(path.join(ws, file));
    const slashi = vscode.workspace.getConfiguration('slashi');
    await slashi.update(
      'customCommands',
      [
        {
          name: 'chain-ok',
          steps: [
            { terminal: `node -e "setTimeout(() => require('fs').writeFileSync('chain-1.txt', ''), 1500)"` },
            { open: 'chain-1.txt' },
          ],
        },
        {
          name: 'chain-bg',
          steps: [
            { terminal: `node -e "setTimeout(() => require('fs').writeFileSync('chain-bg.txt', ''), 8000)"`, background: true },
            { terminal: 'node -e ""' },
            { notify: 'done' },
          ],
        },
        { name: 'chain-fail', steps: [{ terminal: 'node -e "process.exit(3)"' }, { terminal: write('chain-3.txt', "''") }] },
      ],
      vscode.ConfigurationTarget.Global,
    );
    try {
      assert.equal(await api.run('/chain-ok'), true);
      const opened = await waitFor(
        () => vscode.window.activeTextEditor?.document.uri.fsPath.endsWith('chain-1.txt'),
        'chain-1.txt to open',
      );
      assert.ok(opened, 'the open step waited for the terminal step');
      assert.equal(await api.run('/chain-bg'), true);
      assert.equal(exists('chain-bg.txt'), false, 'the waited step ran in a new terminal, not queued behind the background one');
      await waitFor(() => exists('chain-bg.txt'), 'the background step to finish, not interrupted by the next step', 15_000);
      assert.equal(await api.run('/chain-fail'), true);
      await sleep(3000);
      assert.equal(exists('chain-3.txt'), false, 'a non-zero exit stops the command');
    } finally {
      await slashi.update('customCommands', undefined, vscode.ConfigurationTarget.Global);
      for (const f of ['chain-1.txt', 'chain-bg.txt', 'chain-3.txt']) fs.rmSync(path.join(ws, f), { force: true });
    }
  });

  test('a provider registered by another extension runs, turns off in settings, and goes away when disposed', async () => {
    let ran = '';
    const provider = api.registerProvider({
      extensionId: 'acme.e2e',
      id: 'tickets',
      title: 'Tickets',
      prefix: 'tickets',
      items: () => [{ id: 'T-1', title: 'First ticket', name: 't-1', args: 'note', run: (args) => (ran = args) }],
    });
    assert.equal(await api.run('/t-1 hello'), true);
    assert.equal(ran, 'hello');
    const slashi = vscode.workspace.getConfiguration('slashi');
    await slashi.update('disabledProviders', ['ext:acme.e2e/tickets'], vscode.ConfigurationTarget.Global);
    assert.equal(await api.run('/t-1'), false, 'hidden while turned off');
    await slashi.update('disabledProviders', undefined, vscode.ConfigurationTarget.Global);
    assert.equal(await api.run('/t-1 again'), true);
    provider.dispose();
    assert.equal(await api.run('/t-1'), false, 'gone after dispose');
  });

  test('/commit with nothing staged commits everything through the real Git API', async () => {
    // Smart commit skips VS Code's "commit all?" question, which a test can't answer.
    await vscode.workspace.getConfiguration('git').update('enableSmartCommit', true, vscode.ConfigurationTarget.Workspace);
    const repo = await repository();
    fs.appendFileSync(path.join(ws, 'notes.txt'), 'more\n');
    fs.writeFileSync(path.join(ws, 'new-file.txt'), 'untracked\n');
    await repo.status();
    await open('notes.txt');
    assert.equal(await api.run('/commit e2e commit'), true);
    assert.equal(git('log', '-1', '--format=%s'), 'e2e commit');
    const files = git('show', '--name-only', '--format=', 'HEAD').split('\n');
    for (const file of ['notes.txt', 'new-file.txt']) assert.ok(files.includes(file), `${file} is committed`);
  });

  test('AI: /commit-msg and /review-changes through the Claude Code CLI (SLASHI_E2E_AI=1)', async function () {
    if (!process.env.SLASHI_E2E_AI) this.skip();
    await vscode.workspace.getConfiguration('slashi').update('ai.provider', 'claudeCode', vscode.ConfigurationTarget.Global);
    const repo = await repository();
    fs.appendFileSync(path.join(ws, 'notes.txt'), 'TODO: remove the debug flag before release\n');
    await repo.status();
    repo.inputBox.value = '';
    await open('notes.txt');
    await api.run('/commit-msg');
    const message = await waitFor(() => repo.inputBox.value, 'a commit message', 120_000);
    assert.ok(message.trim(), 'the Source Control box has a message');
    log(`commit message: ${message.split('\n')[0]}`);
    await api.run('/review-changes');
    const panel = await waitFor(
      () => vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.label === 'Slashi AI')),
      'the AI answer panel',
      30_000,
    );
    assert.ok(panel);
  });
});
