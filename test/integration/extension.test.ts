// Runs inside a real VS Code instance: npm run test:integration
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Slashi in VS Code', () => {
  let api: { version: number; run(slash: string): Promise<boolean>; registerCommand(c: unknown): vscode.Disposable };

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('meness.slashi');
    assert.ok(ext, 'extension is installed');
    api = await ext.activate();
  });

  test('exposes the public API', () => {
    assert.equal(api.version, 1);
  });

  test('registers its commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'slashi.open',
      'slashi.openNative',
      'slashi.run',
      'slashi.welcome',
      'slashi.studio',
      'slashi.doWithAI',
      'slashi.newCommand',
    ]) {
      assert.ok(commands.includes(id), `${id} is registered`);
    }
  });

  test('text tools edit the active editor', async () => {
    const doc = await vscode.workspace.openTextDocument({ content: 'hello world' });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    assert.equal(await api.run('/upper'), true);
    assert.equal(doc.getText(), 'HELLO WORLD');
    editor.selection = new vscode.Selection(0, 0, 0, 11);
    assert.equal(await api.run('/camel'), true);
    assert.equal(doc.getText(), 'helloWorld');
  });

  test('/run sends the command to a Slashi terminal', async () => {
    await vscode.commands.executeCommand('slashi.run', '/run echo slashi');
    assert.ok(vscode.window.terminals.some((t) => t.name.startsWith('Slashi')));
  });

  test('extension-registered commands run with arguments', async () => {
    let received = '';
    const disposable = api.registerCommand({ extensionId: 'test.ext', name: 'echo-test', run: (args: string) => (received = args) });
    assert.equal(await api.run('/echo-test hi there'), true);
    assert.equal(received, 'hi there');
    disposable.dispose();
  });

  test('the Spotlight opens and toggles closed', async () => {
    await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('slashi.open')));
    await new Promise((r) => {
      setTimeout(r, 500);
    });
    await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('slashi.open')));
  });
});
