// Smoke test: activates the bundled extension against a mocked `vscode` module and drives the real
// Spotlight protocol (init → live file search → run) on this repository. Run: npm run test:smoke
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const mock = require('./vscode-mock.cjs');
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  return request === 'vscode' ? mock : originalLoad.call(this, request, ...rest);
};

const memento = () => {
  const data = new Map();
  return { get: (k, d) => (data.has(k) ? data.get(k) : d), update: async (k, v) => void data.set(k, v), keys: () => [...data.keys()] };
};
const secrets = new Map();
const context = {
  subscriptions: [],
  extensionUri: mock.Uri.file(path.join(__dirname, '../..')),
  globalState: memento(),
  workspaceState: memento(),
  secrets: { get: async (k) => secrets.get(k), store: async (k, v) => void secrets.set(k, v), delete: async (k) => void secrets.delete(k), onDidChange: () => ({ dispose() {} }) },
};

const waitFor = async (predicate, label, timeout = 5000) => {
  const start = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

(async () => {
  const started = Date.now();
  const extension = require('../../dist/extension.js');
  const api = extension.activate(context);
  console.log(`Activated in ${Date.now() - started} ms`);
  const calls = mock._calls;

  check('returns the public API', () => {
    assert.equal(api.version, 1);
    assert.equal(typeof api.registerCommand, 'function');
  });

  // Third-party extensions can add commands through the API.
  let apiRan = '';
  api.registerCommand({ extensionId: 'acme.tools', name: 'acme-hello', title: 'Acme Hello', args: 'name', run: (a) => (apiRan = a) });

  // Open Spotlight and complete the handshake.
  await mock.commands.executeCommand('slashi.open');
  const panel = calls.panels.at(-1);
  check('creates the Spotlight webview with a nonce CSP', () => {
    assert.equal(panel.viewType, 'slashi.spotlight');
    assert.match(panel.webview.html, /Content-Security-Policy/);
    assert.match(panel.webview.html, /script-src 'nonce-/);
  });
  panel.webview._receive({ type: 'ready' });
  const init = (await waitFor(() => calls.posted.find((m) => m.type === 'init'), 'init')).data;
  const names = new Set(init.items.map((i) => i.name).filter(Boolean));
  const providers = new Set(init.items.map((i) => i.providerId));

  check(`posts ${init.items.length} local items from ${providers.size} providers`, () => {
    assert.ok(init.items.length > 300, `only ${init.items.length} items`);
    for (const p of ['commands', 'settings', 'transforms', 'ai', 'naturalLanguage', 'project', 'git', 'terminal', 'web', 'custom', 'marketplace', 'system', 'files', 'navigation']) {
      assert.ok(providers.has(p), `missing provider ${p}`);
    }
  });
  check('detects this repo’s npm scripts and tools', () => {
    for (const n of ['build', 'test', 'typecheck', 'npm-install', 'npm-add', 'vitest', 'tsc', 'stack']) assert.ok(names.has(n), `missing /${n}`);
  });
  check('has core commands, text tools and file CRUD', () => {
    for (const n of ['format', 'split', 'zen', 'upper', 'camel', 'json', 'uuid', 'new', 'mkdir', 'rename', 'dup', 'delete', 'run', 'ask', 'do', 'commit', 'market', 'acme-hello']) {
      assert.ok(names.has(n), `missing /${n}`);
    }
  });
  check('never posts remote (file) items in bulk', () => {
    assert.ok(!init.items.some((i) => i.id.startsWith('file:')));
    assert.ok(init.scopes.find((s) => s.prefix === 'f').remote);
  });
  check('every item is serializable (no functions)', () => {
    assert.doesNotThrow(() => JSON.stringify(init));
    assert.ok(!/"run":/.test(JSON.stringify(init)));
  });

  // Live file search round-trip.
  panel.webview._receive({ type: 'query', seq: 7, query: '/f package' });
  const live = await waitFor(() => calls.posted.find((m) => m.type === 'live' && m.seq === 7), 'live results');
  check('ranks workspace files in the host', () => {
    assert.equal(live.items[0].title, 'package.json');
    assert.ok(live.items[0].actions.some((a) => a.id === 'rename'));
    assert.ok(live.items[0].actions.some((a) => a.id === 'delete'));
  });
  panel.webview._receive({ type: 'query', seq: 8, query: 'spotlight' });
  const global = await waitFor(() => calls.posted.find((m) => m.type === 'live' && m.seq === 8), 'global live results');
  check('includes files in unscoped searches', () => assert.ok(global.items.some((i) => i.title === 'spotlight.ts')));

  // Running a project script sends it to a terminal in the right folder.
  const testItem = init.items.find((i) => i.name === 'test' && i.providerId === 'project');
  panel.webview._receive({ type: 'run', id: testItem.id, args: '' });
  await waitFor(() => calls.terminals.length, 'terminal');
  check('runs package scripts with the detected package manager', () => {
    assert.equal(calls.terminals[0].text, 'npm run test');
    assert.equal(calls.terminals[0].cwd, path.resolve(__dirname, '../..'));
    assert.ok(panel.disposed, 'popup closes before running');
  });

  // Slash commands with arguments, through the API.
  assert.equal(await api.run('/run echo hi'), true);
  check('runs “/run <cmd>” through the API', () => assert.equal(calls.terminals.at(-1).text, 'echo hi'));
  assert.equal(await api.run('/acme-hello world'), true);
  check('runs API-registered commands with arguments', () => assert.equal(apiRan, 'world'));
  assert.equal(await api.run('/definitely-not-a-command'), false);

  // Core command items execute the VS Code command.
  await api.run('/save-all');
  check('executes core VS Code commands', () => assert.ok(calls.commands.some(([id]) => id === 'workbench.action.files.saveAll')));

  // Settings can be toggled.
  await api.run('/zen');
  const settingItem = init.items.find((i) => i.id === 'set:slashi.statusBar.enabled');
  check('lists extension settings with current values', () => assert.equal(settingItem.badge, 'on'));

  // AI without any model configured explains how to set it up.
  await mock.commands.executeCommand('slashi.open');
  const panel2 = calls.panels.at(-1);
  panel2.webview._receive({ type: 'ai', text: 'make the font bigger' });
  await waitFor(() => calls.messages.some((m) => m[0] === 'warning' && /Connect a model/.test(m[1])), 'AI setup hint');
  check('guides users to connect a model when AI is not configured', () => assert.ok(true));

  // Inline “/” completions in Markdown.
  const doc = { languageId: 'markdown', lineAt: () => ({ text: '/up' }) };
  const completions = await calls.completion.provideCompletionItems(doc, new mock.Position(0, 3));
  check('offers inline completions after “/” at line start', () => {
    assert.ok(completions.length > 50);
    assert.ok(completions.some((c) => c.label.label === '/upper'));
  });
  const none = await calls.completion.provideCompletionItems({ languageId: 'typescript', lineAt: () => ({ text: '//' }) }, new mock.Position(0, 2));
  check('stays quiet in code files by default', () => assert.equal(none, undefined));

  // Feature toggles hide items without disabling the provider.
  await mock.workspace.getConfiguration('slashi').update('disabledFeatures', ['extensions.installed', 'transforms.case']);
  await mock.commands.executeCommand('slashi.open');
  const panel3 = calls.panels.at(-1);
  panel3.webview._receive({ type: 'ready' });
  const init3 = (await waitFor(() => calls.posted.filter((m) => m.type === 'init')[1], 'second init')).data;
  const names3 = new Set(init3.items.map((i) => i.name));
  check('per-feature toggles remove only that feature', () => {
    assert.ok(!names3.has('upper'), 'case tools should be hidden');
    assert.ok(names3.has('json'), 'other text tools stay');
    assert.ok(names3.has('ext-search'), 'marketplace search stays');
  });

  // Studio renders the real provider/feature state.
  await mock.commands.executeCommand('slashi.studio');
  const studio = calls.panels.at(-1);
  studio.webview._receive({ type: 'ready' });
  const state = await waitFor(() => calls.posted.find((m) => m.type === 'state' && m.state.providers.length), 'studio state');
  check('Studio lists providers with their features', () => {
    assert.ok(state.state.providers.length >= 15);
    const ext = state.state.providers.find((p) => p.id === 'extensions');
    assert.equal(ext.features.find((f) => f.id === 'installed').enabled, false);
    assert.equal(ext.features.find((f) => f.id === 'marketplace').enabled, true);
  });

  // Artifacts used by scripts/screenshots.mjs
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'init.json'), JSON.stringify({ ...init, live: { '/f package': live.items, spotlight: global.items } }));
  fs.writeFileSync(path.join(out, 'studio.json'), JSON.stringify(state.state));
  const errors = calls.messages.filter((m) => m[0] === 'error');
  check('logged no errors', () => assert.deepEqual(errors, []));
  console.log(`\n${passed} smoke checks passed.`);
  context.subscriptions.forEach((d) => d.dispose?.());
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
