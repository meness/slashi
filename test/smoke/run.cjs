// Smoke test: activates the bundled extension against a mocked `vscode` module and drives the real
// Spotlight protocol (init → live file search → run) on this repository. Run: npm run test:smoke
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

process.env.SLASHI_SKIP_ONBOARDING = '';
// Hide locally installed claude/codex CLIs so "no AI configured" holds on dev machines too.
process.env.PATH = path.dirname(process.execPath);
process.env.HOME = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'slashi-smoke-'));
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
  secrets: {
    get: async (k) => secrets.get(k),
    store: async (k, v) => void secrets.set(k, v),
    delete: async (k) => void secrets.delete(k),
    onDidChange: () => ({ dispose() {} }),
  },
};

const waitFor = async (predicate, label, timeout = 5000) => {
  const start = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => {
      setTimeout(r, 20);
    });
  }
};

// Removes expected errors (each is both logged and shown) so the final “no errors” check stays meaningful.
const takeErrors = (messages, pattern) => {
  let taken = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i][0] === 'error' && pattern.test(messages[i][1])) {
      messages.splice(i, 1);
      taken++;
    }
  }
  return taken;
};

let passed = 0;
// A step awaiting something that never happens empties the event loop, and Node would exit 0 as if all passed.
process.on('beforeExit', () => {
  console.error(`Smoke test stopped early after ${passed} checks (a step never finished).`);
  process.exit(1);
});
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
    for (const p of [
      'commands',
      'settings',
      'transforms',
      'ai',
      'naturalLanguage',
      'project',
      'git',
      'terminal',
      'web',
      'custom',
      'marketplace',
      'system',
      'files',
      'navigation',
    ]) {
      assert.ok(providers.has(p), `missing provider ${p}`);
    }
  });
  check('detects this repo’s npm scripts and tools', () => {
    for (const n of ['build', 'test', 'typecheck', 'npm-install', 'npm-add', 'vitest', 'tsc', 'stack'])
      assert.ok(names.has(n), `missing /${n}`);
  });
  check('has core commands, text tools and file CRUD', () => {
    for (const n of [
      'format',
      'split',
      'zen',
      'upper',
      'camel',
      'json',
      'uuid',
      'new',
      'mkdir',
      'rename',
      'dup',
      'delete',
      'run',
      'ask',
      'do',
      'commit',
      'market',
      'acme-hello',
    ]) {
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

  // A hand-edited, unknown ai.provider falls back to auto instead of crashing on a missing backend.
  await mock.workspace.getConfiguration('slashi').update('ai.provider', 'bogus');
  const hints = calls.messages.filter((m) => m[0] === 'warning' && /Connect a model/.test(m[1])).length;
  panel2.webview._receive({ type: 'ai', text: 'make the font bigger' });
  await waitFor(
    () => calls.messages.filter((m) => m[0] === 'warning' && /Connect a model/.test(m[1])).length > hints,
    'AI setup hint for an unknown provider',
  );
  check('treats an unknown ai.provider as auto', () => assert.ok(true));
  await mock.workspace.getConfiguration('slashi').update('ai.provider', 'auto');

  // Inline “/” completions in Markdown.
  const doc = { languageId: 'markdown', lineAt: () => ({ text: '/up' }) };
  const completions = await calls.completion.provideCompletionItems(doc, new mock.Position(0, 3));
  check('offers inline completions after “/” at line start', () => {
    assert.ok(completions.length > 50);
    assert.ok(completions.some((c) => c.label.label === '/upper'));
  });
  const none = await calls.completion.provideCompletionItems(
    { languageId: 'typescript', lineAt: () => ({ text: '//' }) },
    new mock.Position(0, 2),
  );
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

  // Onboarding opens on first run and renders real state.
  await waitFor(() => calls.panels.find((p) => p.viewType === 'slashi.welcome'), 'onboarding panel', 3000);
  const welcome = calls.panels.find((p) => p.viewType === 'slashi.welcome');
  welcome.webview._receive({ type: 'ready' });
  const onboardingState = await waitFor(() => calls.posted.find((m) => m.type === 'state' && m.state.examples), 'onboarding state');
  welcome.webview._receive({ type: 'step', step: 'shortcut' });
  welcome.active = true;
  const posted = calls.posted.length;
  await mock.commands.executeCommand('slashi.open');
  check('onboarding opens on first run and celebrates the shortcut', () => {
    assert.ok(onboardingState.state.examples.some((e) => e.name === 'build'));
    assert.ok(calls.posted.slice(posted).some((m) => m.type === 'shortcutPressed'));
  });
  welcome.webview._receive({ type: 'finish' });
  await waitFor(() => context.globalState.get('slashi.onboarded'), 'onboarded flag');

  // Editing team commands with no team file opens an unsaved starter instead of writing to the repo.
  await mock.commands.executeCommand('slashi.editTeamCommands');
  check('opens an unsaved team commands starter without writing files', () => {
    assert.equal(calls.shown.uri.scheme, 'untitled');
    assert.ok(calls.shown.uri.path.endsWith(path.join('.vscode', 'slashi.json')));
    assert.match(calls.shown.inserted, /"tidy"/);
    assert.ok(!(calls.written ?? []).some((p) => p.endsWith('slashi.json')));
  });

  // Team commands: a file with // comments is read, and the wizard never wipes it.
  const teamPath = path.join(mock.workspace.workspaceFolders[0].uri.fsPath, '.vscode', 'slashi.json');
  let teamText = '// shared with the team\n{"commands": [{"name": "ship", "steps": [{"terminal": "echo ship"}]}]}';
  const readFile = mock.workspace.fs.readFile;
  mock.workspace.fs.readFile = async (u) => (u.fsPath === teamPath ? Buffer.from(teamText) : readFile(u));
  const reloadTeam = () => mock.workspace.getConfiguration('slashi').update('customCommands', []);
  await reloadTeam();

  // Scripted answers for the input boxes and pickers the next command asks.
  const script = (answers) => {
    const { showInputBox, showQuickPick } = mock.window;
    const next = async () => answers.shift();
    mock.window.showInputBox = next;
    mock.window.showQuickPick = async (items) => {
      const pick = answers.shift();
      return typeof pick === 'function' ? (await items).find(pick) : pick;
    };
    return () => Object.assign(mock.window, { showInputBox, showQuickPick });
  };
  const wizard = () => ['deploy', 'Deploy', (i) => i.type === 'notify', 'hi', (i) => i.type === 'done', (i) => i.value === 'team'];
  let restore = script(wizard());
  await mock.commands.executeCommand('slashi.newCommand');
  restore();
  check('the wizard adds to a team file with comments instead of replacing it', () => {
    assert.match(calls.writtenText[teamPath], /^\/\/ shared with the team/, 'comments survive');
    const saved = JSON.parse(calls.writtenText[teamPath].replace(/^\/\/.*$/m, ''));
    assert.deepEqual(
      saved.commands.map((c) => c.name),
      ['ship', 'deploy'],
    );
  });
  teamText = '{"commands": [{"name": "ship", "steps": []}';
  delete calls.writtenText[teamPath];
  restore = script(wizard());
  await mock.commands.executeCommand('slashi.newCommand');
  restore();
  const brokenErrors = takeErrors(calls.messages, /Fix \.vscode\/slashi\.json first/);
  check('the wizard refuses to rewrite a team file it cannot parse', () => {
    assert.equal(brokenErrors, 2, 'expected the error to be logged and shown');
    assert.equal(calls.writtenText[teamPath], undefined);
  });

  // Team commands that reach a shell ask first; "Always Allow" lasts until the steps change.
  teamText = '// shared with the team\n{"commands": [{"name": "ship", "steps": [{"terminal": "echo ship"}]}]}';
  await reloadTeam();
  const showWarning = mock.window.showWarningMessage;
  let prompts = 0;
  let approval;
  mock.window.showWarningMessage = async (message, ...rest) => {
    if (message.startsWith('/ship comes from')) {
      prompts++;
      return approval;
    }
    return showWarning(message, ...rest);
  };
  const ran = () => calls.terminals.filter((t) => t.text.startsWith('echo ship')).length;
  await api.run('/ship');
  check('a team command does not run when its prompt is dismissed', () => assert.deepEqual([prompts, ran()], [1, 0]));
  approval = 'Always Allow';
  await api.run('/ship');
  await api.run('/ship');
  check('“Always Allow” runs it and skips the prompt next time', () => assert.deepEqual([prompts, ran()], [2, 2]));
  teamText = teamText.replace('echo ship', 'echo ship --force');
  await reloadTeam();
  approval = undefined;
  await api.run('/ship');
  check('changed steps ask again', () => assert.deepEqual([prompts, ran()], [3, 2]));
  mock.window.showWarningMessage = showWarning;
  mock.workspace.fs.readFile = readFile;
  await reloadTeam();

  // Commands in .vscode/settings.json come from the repo too: they ask first, and saving your own never copies them.
  const slashiConfig = mock.workspace.getConfiguration('slashi');
  await slashiConfig.update('customCommands', [{ name: 'mine', steps: [{ notify: 'mine' }] }]);
  await slashiConfig.update('customCommands', [{ name: 'repo-cmd', steps: [{ terminal: 'echo repo' }] }], 2);
  let repoPrompts = 0;
  mock.window.showWarningMessage = async (message, ...rest) => {
    if (!message.startsWith('/repo-cmd comes from')) return showWarning(message, ...rest);
    repoPrompts++;
  };
  await api.run('/repo-cmd');
  mock.window.showWarningMessage = showWarning;
  check('workspace-settings commands ask before reaching a shell', () => {
    assert.equal(repoPrompts, 1);
    assert.ok(!calls.terminals.some((t) => t.text === 'echo repo'));
  });
  restore = script(['added', 'Added', (i) => i.type === 'notify', 'hi', (i) => i.type === 'done', (i) => i.value === 'user']);
  await mock.commands.executeCommand('slashi.newCommand');
  restore();
  check('the wizard keeps your own commands and never copies the repo’s', () =>
    assert.deepEqual(
      mock._settings['slashi.customCommands'].map((c) => c.name),
      ['mine', 'added'],
    ),
  );
  await slashiConfig.update('customCommands', undefined, 2);
  await slashiConfig.update('customCommands', []);

  // `languages` limits a command to editors in those languages, checked when you search or run, not when cached.
  await slashiConfig.update('customCommands', [{ name: 'py-only', languages: ['python'], steps: [{ notify: 'py' }] }]);
  const editorIn = (languageId) => {
    const sel = new mock.Selection(0, 0, 0, 0);
    const document = { uri: mock.Uri.file(path.join(__dirname, `x.${languageId}`)), languageId, isUntitled: false, isClosed: false };
    return { document, selection: sel, selections: [sel], viewColumn: 1 };
  };
  mock.window.activeTextEditor = editorIn('typescript');
  const inTs = await api.run('/py-only');
  mock.window.activeTextEditor = editorIn('python');
  const inPy = await api.run('/py-only');
  mock.window.activeTextEditor = undefined;
  check('a command limited to Python only runs in Python files', () => assert.deepEqual([inTs, inPy], [false, true]));
  await slashiConfig.update('customCommands', []);

  // A name shared by a core command and a package script runs what the popup ranks first; arguments go to the script.
  await api.run('/format');
  check('“/format” runs Format Document, not this repo’s format script', () => {
    assert.equal(calls.commands.at(-1)[0], 'editor.action.formatDocument');
    assert.ok(!calls.terminals.some((t) => t.text.startsWith('npm run format')));
  });
  await api.run('/format --check');
  check('“/format --check” passes the arguments to the script', () =>
    assert.equal(calls.terminals.at(-1).text, 'npm run format -- --check'),
  );
  const before = calls.terminals.length;
  await api.run('/again');
  check('“/again” repeats the last command with its arguments', () => {
    assert.equal(calls.terminals.length, before + 1);
    assert.equal(calls.terminals.at(-1).text, 'npm run format -- --check');
  });

  // /fix on a file too large to send whole refuses instead of offering an Apply that would cut the file.
  const big = 'x'.repeat(70_000);
  const bigDoc = {
    uri: mock.Uri.file(path.join(__dirname, 'big.ts')),
    languageId: 'typescript',
    isUntitled: false,
    isClosed: false,
    lineCount: 1,
    version: 1,
    getText: () => big,
  };
  const bigSel = new mock.Selection(0, 0, 0, 0);
  mock.window.activeTextEditor = { document: bigDoc, selection: bigSel, selections: [bigSel], viewColumn: 1 };
  const answersBefore = calls.panels.filter((p) => p.viewType === 'slashi.answer').length;
  await api.run('/fix');
  mock.window.activeTextEditor = undefined;
  const tooLarge = takeErrors(calls.messages, /too large to edit/);
  check('AI edits refuse code that was cut to fit the model', () => {
    assert.equal(tooLarge, 2, 'expected a “too large” error');
    assert.equal(calls.panels.filter((p) => p.viewType === 'slashi.answer').length, answersBefore);
  });

  // A fake VS Code language model drives the AI flows below.
  const requests = [];
  let reply = () => [];
  mock.lm.selectChatModels = async () => [
    {
      id: 'fake',
      name: 'Fake',
      family: 'fake',
      vendor: 'test',
      sendRequest: async (messages) => {
        requests.push(messages);
        const parts = reply(requests.length);
        return {
          text: (async function* () {
            for (const p of parts) yield await p;
          })(),
        };
      },
    },
  ];

  // Do with AI: an item that runs a shell command is confirmed even with confirmation turned off.
  await mock.workspace.getConfiguration('slashi').update('ai.confirmBeforeRun', false);
  reply = () => ['{"reply": "ok", "steps": [{"type": "item", "id": "term:run", "args": "echo pwned"}]}'];
  await api.run('/do make the font bigger');
  check('Do with AI confirms shell-running items when confirmation is off', () => {
    assert.ok(calls.messages.some((m) => m[0] === 'info' && m[2]?.modal && /echo pwned/.test(m[2].detail)));
    assert.ok(!calls.terminals.some((t) => t.text === 'echo pwned'));
  });
  const modals = calls.messages.filter((m) => m[2]?.modal).length;
  reply = () => ['{"reply": "ok", "steps": [{"type": "setting", "key": "editor.fontSize", "value": 20}]}'];
  await api.run('/do make the font bigger');
  check('…and still runs editor-only plans without asking', () => {
    assert.equal(mock._settings['editor.fontSize'], 20);
    assert.equal(calls.messages.filter((m) => m[2]?.modal).length, modals);
  });
  await mock.workspace.getConfiguration('slashi').update('ai.confirmBeforeRun', true);

  // A second question while the first still streams: the old stream must not leak into the new conversation.
  let releaseFirst;
  const firstHeld = new Promise((r) => {
    releaseFirst = r;
  });
  reply = (n) => (n === 3 ? ['old-', firstHeld.then(() => 'tail')] : ['new']); // request 3 is “/ask one”
  const firstAsk = api.run('/ask one');
  const answerPanel = await waitFor(() => calls.panels.find((p) => p.viewType === 'slashi.answer'), 'answer panel');
  answerPanel.webview._receive({ type: 'ready' });
  await waitFor(() => calls.posted.some((m) => m.type === 'delta' && m.text === 'old-'), 'first delta');
  const mark = calls.posted.length;
  await api.run('/ask two');
  releaseFirst();
  await firstAsk;
  const after = calls.posted.slice(mark);
  check('a replaced AI answer posts nothing more', () => {
    assert.ok(!after.some((m) => m.type === 'delta' && m.text === 'tail'));
    assert.equal(after.filter((m) => m.type === 'done').length, 1);
  });
  answerPanel.webview._receive({ type: 'followup', text: 'more' });
  await waitFor(() => requests.length === 5, 'follow-up request');
  check('…and its text never joins the next conversation', () => {
    const history = requests[4].map((m) => m.c);
    assert.equal(history.length, 3);
    assert.ok(!history.some((c) => /old-/.test(c)), JSON.stringify(history));
    assert.equal(history[1], 'new');
  });
  mock.lm.selectChatModels = async () => [];

  // Help & Support: links open only by key, and diagnostics never include secrets.
  await api.run('/help-center');
  check('/help-center opens the Studio Help & Support tab', () =>
    assert.ok(calls.posted.some((m) => m.type === 'tab' && m.tab === 'help')),
  );
  await api.run('/support');
  check('/support opens the donation page', () => assert.equal(calls.opened, 'https://github.com/meness/slashi/blob/main/DONATE.md'));
  studio.webview._receive({ type: 'openLink', link: 'bug' });
  await waitFor(() => calls.opened?.includes('bug_report.yml'), 'bug link');
  calls.opened = undefined;
  studio.webview._receive({ type: 'openLink', link: 'toString' });
  studio.webview._receive({ type: 'openLink', link: 'https://evil.dev' });
  await waitFor(() => calls.messages.filter((m) => m[0] === 'error' && /Unknown link/.test(m[1])).length === 2, 'rejected links');
  check('Studio opens only known help links', () => {
    assert.equal(calls.opened, undefined);
    assert.equal(takeErrors(calls.messages, /Unknown link/), 2);
  });
  secrets.set('slashi.apiKey.anthropic', 'sk-ant-SMOKE-SECRET');
  await mock.workspace.getConfiguration('slashi').update('ai.baseUrl', 'https://private.example.internal/v1');
  await api.run('/diagnostics');
  check('/diagnostics copies versions and setup without secrets', () => {
    assert.match(calls.clipboard, /^Slashi: \d+\.\d+\.\d+\nEditor: Visual Studio Code /);
    assert.match(calls.clipboard, /^AI: .+ \(setting: auto\)$/m);
    assert.match(calls.clipboard, /Features off: extensions\.installed, transforms\.case/);
    assert.ok(!/SMOKE-SECRET|private\.example|sk-ant/.test(calls.clipboard), calls.clipboard);
    assert.ok(!calls.clipboard.includes(path.resolve(__dirname, '../..')), 'no workspace paths');
  });
  secrets.delete('slashi.apiKey.anthropic');
  await mock.workspace.getConfiguration('slashi').update('ai.baseUrl', '');

  // Marketplace: packs from the official registry are verified, and a download must match its listing.
  const OFFICIAL = 'https://raw.githubusercontent.com/meness/slashi/main/marketplace/index.json';
  const OTHER = 'https://example.com/index.json';
  const market = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../marketplace/index.json'), 'utf8'));
  const listed = (id) => market.packs.find((p) => p.id === id);
  const official = {
    ...market,
    packs: [
      listed('focus-mode'),
      { ...listed('git-power'), sha256: '0'.repeat(64) },
      { ...listed('focus-mode'), id: 'renamed', name: 'Renamed' },
      { ...listed('web-dev'), author: 'Jane' },
    ],
  };
  const other = { version: 1, packs: [{ ...listed('snippets'), url: 'https://example.com/snippets.json' }] };
  const realFetchMarket = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const file = url.startsWith('https://example.com/') ? url.replace('https://example.com/', 'packs/') : url.split('/marketplace/')[1];
    const body =
      url === OFFICIAL
        ? JSON.stringify(official)
        : url === OTHER
          ? JSON.stringify(other)
          : fs.readFileSync(path.resolve(__dirname, '../../marketplace', file), 'utf8');
    return { ok: true, status: 200, text: async () => body };
  };
  await mock.workspace.getConfiguration('slashi').update('marketplace.registries', [OFFICIAL, OTHER]);
  await mock.commands.executeCommand('slashi.refresh');
  const marketItems = async () => {
    const inits = calls.posted.filter((m) => m.type === 'init').length;
    // An open popup is reused without a new init, so start from a closed one.
    for (const open of calls.panels.filter((x) => x.viewType === 'slashi.spotlight' && !x.disposed)) open.dispose();
    await mock.commands.executeCommand('slashi.open');
    const p = calls.panels.at(-1);
    p.webview._receive({ type: 'ready' });
    const data = (await waitFor(() => calls.posted.filter((m) => m.type === 'init')[inits], 'marketplace init')).data;
    return { panel: p, items: data.items.filter((i) => i.providerId === 'marketplace' && i.category === 'Action Packs') };
  };
  const { items: packItems } = await marketItems();
  const byTitle = (title) => packItems.find((i) => i.title === title);
  check('marks only official-registry packs as verified', () => {
    assert.equal(byTitle('Focus & Present').verified, true);
    assert.ok(!byTitle('Handy Inserts').verified);
    assert.match(byTitle('Handy Inserts').description, /by Slashi \(unverified\)$/);
    assert.match(byTitle('Focus & Present').description, /by Slashi$/);
    const community = packItems.find((i) => i.description.endsWith('by Jane'));
    assert.ok(community && !community.verified, 'community packs in the official registry are not verified');
  });
  const { showInformationMessage } = mock.window;
  let prompt;
  mock.window.showInformationMessage = async (...a) => {
    if (a[1]?.modal) {
      prompt = a;
      return a[2];
    }
    return showInformationMessage(...a);
  };
  const installRun = async (title) => {
    const { panel: p, items } = await marketItems();
    p.webview._receive({ type: 'run', id: items.find((i) => i.title === title).id, args: '' });
  };
  const installed = () => (context.globalState.get('slashi.packs') ?? []).map((pk) => pk.id);
  await installRun('Focus & Present');
  await waitFor(() => installed().includes('focus-mode'), 'verified pack install');
  check('installs a verified pack and says so before installing', () => {
    assert.equal(prompt[0], 'Install Focus & Present v1.0.0 by Slashi?');
    assert.match(prompt[1].detail, /^✓ Verified: published by Slashi/);
  });
  prompt = undefined;
  await installRun('Git Power Moves');
  await waitFor(() => takeErrors(calls.messages, /doesn’t match its registry listing, so nothing was installed/), 'digest mismatch error');
  await installRun('Renamed');
  await waitFor(
    () => takeErrors(calls.messages, /The registry lists “renamed”, but the file is the pack “focus-mode”/),
    'id mismatch error',
  );
  check('refuses a pack that differs from its listing, without asking', () => {
    assert.ok(!installed().includes('git-power'));
    assert.equal(prompt, undefined);
  });
  await installRun('Handy Inserts');
  await waitFor(() => installed().includes('snippets'), 'unverified pack install');
  check('labels a pack that only claims to be Slashi’s as unverified', () => {
    assert.equal(prompt[0], 'Install Handy Inserts v1.0.0 by Slashi (unverified)?');
    assert.doesNotMatch(prompt[1].detail, /Verified/);
  });
  mock.window.showInformationMessage = showInformationMessage;
  globalThis.fetch = realFetchMarket;
  await context.globalState.update('slashi.packs', []);
  await mock.workspace.getConfiguration('slashi').update('marketplace.registries', undefined);

  // Artifacts used by scripts/screenshots.mjs
  // The Anthropic SDK ships as dist/anthropic-sdk.js and loads on first use: listing models must reach the API.
  secrets.set('slashi.apiKey.anthropic', 'sk-test');
  const realFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (input) => {
    fetched.push(String(input?.url ?? input));
    throw new Error('offline');
  };
  await mock.commands.executeCommand('slashi.selectModel');
  globalThis.fetch = realFetch;
  secrets.delete('slashi.apiKey.anthropic');
  check('loads the Anthropic SDK on first use', () => assert.ok(fetched.some((u) => u.startsWith('https://api.anthropic.com/'))));

  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'init.json'), JSON.stringify({ ...init, live: { '/f package': live.items, spotlight: global.items } }));
  fs.writeFileSync(path.join(out, 'studio.json'), JSON.stringify(state.state));
  fs.writeFileSync(path.join(out, 'onboarding.json'), JSON.stringify(onboardingState.state));
  const errors = calls.messages.filter((m) => m[0] === 'error');
  check('logged no errors', () => assert.deepEqual(errors, []));
  console.log(`\n${passed} smoke checks passed.`);
  context.subscriptions.forEach((d) => d.dispose?.());
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
