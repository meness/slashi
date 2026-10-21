// A small in-memory stand-in for the `vscode` module, good enough to activate Slashi in plain Node
// and drive its real code paths (providers, registry, Spotlight messaging) against a real folder.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = process.env.SLASHI_SMOKE_ROOT || process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
const calls = { commands: [], terminals: [], messages: [], posted: [], panels: [] };
const settings = {};
// Values from .vscode/settings.json; they win over user settings, like in VS Code.
const workspaceSettings = {};

class EventEmitter {
  constructor() {
    this.listeners = new Set();
    this.event = (fn) => {
      this.listeners.add(fn);
      return new Disposable(() => this.listeners.delete(fn));
    };
  }
  fire(e) {
    for (const fn of Array.from(this.listeners)) fn(e);
  }
  dispose() {
    this.listeners.clear();
  }
}
class Disposable {
  constructor(fn) {
    this.fn = fn;
  }
  static from(...d) {
    return new Disposable(() => d.forEach((x) => x.dispose()));
  }
  dispose() {
    this.fn?.();
  }
}
const event = () => new EventEmitter().event;

class Uri {
  constructor(scheme, p) {
    this.scheme = scheme;
    this.path = p;
    this.fsPath = p;
  }
  static file(p) {
    return new Uri('file', path.resolve(p));
  }
  static parse(s) {
    return s.startsWith('file://') ? Uri.file(decodeURIComponent(s.slice(7))) : Object.assign(new Uri(s.split(':')[0], s), { fsPath: s });
  }
  static joinPath(base, ...parts) {
    return new Uri(base.scheme, path.join(base.path, ...parts));
  }
  toString() {
    return this.scheme === 'file' ? `file://${this.path}` : this.path;
  }
  with(change = {}) {
    return new Uri(change.scheme ?? this.scheme, change.path ?? this.path);
  }
}

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
  isEqual(o) {
    return o.line === this.line && o.character === this.character;
  }
}
class Range {
  constructor(a, b, c, d) {
    if (typeof a === 'number') {
      this.start = new Position(a, b);
      this.end = new Position(c, d);
    } else {
      this.start = a;
      this.end = b;
    }
  }
  get isEmpty() {
    return this.start.isEqual(this.end);
  }
  intersection() {
    return this;
  }
  isEqual(o) {
    return this.start.isEqual(o.start) && this.end.isEqual(o.end);
  }
}
class Selection extends Range {
  get active() {
    return this.end;
  }
}

function defaults() {
  const out = {};
  for (const section of pkg.contributes.configuration) for (const [k, v] of Object.entries(section.properties)) out[k] = v.default;
  return out;
}
const defaultSettings = defaults();

function configuration(section) {
  const full = (key) => (section ? `${section}.${key}` : key);
  return {
    get(key, fallback) {
      const k = full(key);
      if (k in workspaceSettings) return workspaceSettings[k];
      if (k in settings) return settings[k];
      if (k in defaultSettings) return defaultSettings[k];
      return fallback;
    },
    async update(key, value, target) {
      const store = target === 2 ? workspaceSettings : settings;
      if (value === undefined) delete store[full(key)];
      else store[full(key)] = value;
      configEmitter.fire({ affectsConfiguration: (s) => full(key).startsWith(s) });
    },
    inspect(key) {
      const k = full(key);
      return { key: k, defaultValue: defaultSettings[k], globalValue: settings[k], workspaceValue: workspaceSettings[k] };
    },
  };
}
const configEmitter = new EventEmitter();

function walk(dir, out, max) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (out.length >= max) return;
    if (['node_modules', '.git', 'dist', 'out', '.vscode-test'].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out, max);
    else out.push(Uri.file(p));
  }
}

function makeWebview() {
  const emitter = new EventEmitter();
  return {
    html: '',
    cspSource: 'vscode-resource:',
    asWebviewUri: (u) => u,
    onDidReceiveMessage: emitter.event,
    postMessage: async (m) => {
      calls.posted.push(m);
      return true;
    },
    _receive: (m) => emitter.fire(m),
  };
}

const self = {
  id: 'meness.slashi',
  packageJSON: pkg,
  extensionUri: Uri.file(path.join(__dirname, '../..')),
  isActive: true,
};

const registered = new Map();

const vscode = {
  version: '1.95.0',
  EventEmitter,
  Disposable,
  Uri,
  Position,
  Range,
  Selection,
  ThemeIcon: class {
    constructor(id) {
      this.id = id;
    }
  },
  MarkdownString: class {
    constructor(v) {
      this.value = v;
    }
  },
  RelativePattern: class {
    constructor(base, pattern) {
      this.base = base;
      this.pattern = pattern;
    }
  },
  CancellationTokenSource: class {
    constructor() {
      this.token = { isCancellationRequested: false, onCancellationRequested: event() };
    }
    cancel() {
      this.token.isCancellationRequested = true;
    }
    dispose() {}
  },
  CancellationError: class extends Error {},
  WorkspaceEdit: class {
    constructor() {
      this.ops = [];
    }
    createFile(u) {
      this.ops.push(['create', u]);
    }
    renameFile(a, b) {
      this.ops.push(['rename', a, b]);
    }
    replace(u, r, t) {
      this.ops.push(['replace', u, r, t]);
    }
    deleteFile(u) {
      this.ops.push(['delete', u]);
    }
  },
  CompletionItem: class {
    constructor(label, kind) {
      this.label = label;
      this.kind = kind;
    }
  },
  CompletionItemKind: { Function: 2, Event: 22 },
  SnippetString: class {
    constructor(v) {
      this.value = v;
    }
  },
  TabInputText: class {},
  TabInputTextDiff: class {},
  LanguageModelChatMessage: { User: (c) => ({ role: 'user', c }), Assistant: (c) => ({ role: 'assistant', c }) },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { Active: -1, Beside: -2, One: 1 },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  FileType: { File: 1, Directory: 2 },
  TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
  TaskGroup: { Build: { id: 'build' }, Test: { id: 'test' } },
  SymbolKind: new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? k.length : 0) }),
  env: {
    shell: '/bin/bash',
    appName: 'Visual Studio Code',
    clipboard: {
      readText: async () => '',
      writeText: async (t) => {
        calls.clipboard = t;
      },
    },
    openExternal: async (u) => {
      calls.opened = u.toString();
      return true;
    },
  },
  window: {
    activeTextEditor: undefined,
    visibleTextEditors: [],
    tabGroups: { all: [], close: async () => true },
    onDidChangeActiveTextEditor: event(),
    onDidCloseTerminal: event(),
    createOutputChannel: () => ({
      info() {},
      warn: (...a) => calls.messages.push(['warn', ...a]),
      error: (...a) => calls.messages.push(['error', ...a]),
      debug() {},
      show() {},
      dispose() {},
    }),
    createStatusBarItem: () => ({
      show() {
        this.visible = true;
      },
      hide() {
        this.visible = false;
      },
      dispose() {},
    }),
    createTerminal: (opts) => {
      const t = { name: opts.name, exitStatus: undefined, show() {}, sendText: (text) => calls.terminals.push({ cwd: opts.cwd, text }) };
      return t;
    },
    createWebviewPanel: (viewType, title) => {
      const disposeEmitter = new EventEmitter();
      const panel = {
        viewType,
        title,
        active: true,
        webview: makeWebview(),
        onDidDispose: disposeEmitter.event,
        onDidChangeViewState: event(),
        reveal() {},
        dispose() {
          if (!this.disposed) {
            this.disposed = true;
            disposeEmitter.fire();
          }
        },
      };
      calls.panels.push(panel);
      return panel;
    },
    showInformationMessage: async (...a) => {
      calls.messages.push(['info', ...a]);
      return undefined;
    },
    showWarningMessage: async (...a) => {
      calls.messages.push(['warning', ...a]);
      return undefined;
    },
    showErrorMessage: async (...a) => {
      calls.messages.push(['error', ...a]);
      return undefined;
    },
    setStatusBarMessage: (m) => {
      calls.messages.push(['status', m]);
      return new Disposable();
    },
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    withProgress: async (_o, task) => task({ report() {} }, new vscode.CancellationTokenSource().token),
    showTextDocument: async (doc) => {
      calls.shown = doc;
      return {
        document: doc,
        selections: [],
        selection: new Selection(0, 0, 0, 0),
        edit: async (cb) => {
          cb({
            insert: (_p, text) => {
              doc.inserted = text;
            },
          });
          return true;
        },
      };
    },
    createQuickPick: () => ({
      show() {},
      dispose() {},
      onDidChangeValue: event(),
      onDidAccept: event(),
      onDidHide: event(),
      onDidTriggerItemButton: event(),
    }),
  },
  workspace: {
    workspaceFolders: [{ uri: Uri.file(root), name: path.basename(root), index: 0 }],
    isTrusted: true,
    getConfiguration: configuration,
    onDidChangeConfiguration: configEmitter.event,
    onDidChangeWorkspaceFolders: event(),
    onDidGrantWorkspaceTrust: event(),
    onDidSaveTextDocument: event(),
    createFileSystemWatcher: () => ({ onDidCreate: event(), onDidDelete: event(), onDidChange: event(), dispose() {} }),
    getWorkspaceFolder: () => vscode.workspace.workspaceFolders[0],
    asRelativePath: (u) =>
      path
        .relative(root, typeof u === 'string' ? u : u.fsPath)
        .split(path.sep)
        .join('/'),
    findFiles: async (glob, _exclude, max = 20000) => {
      const out = [];
      walk(root, out, max);
      if (typeof glob === 'object' && glob.pattern?.includes('{')) {
        const names = glob.pattern.slice(glob.pattern.indexOf('{') + 1, glob.pattern.lastIndexOf('}')).split(',');
        return out.filter((u) => names.some((n) => (n.startsWith('*') ? u.fsPath.endsWith(n.slice(1)) : path.basename(u.fsPath) === n)));
      }
      return out;
    },
    fs: {
      readDirectory: async (u) => fs.readdirSync(u.fsPath, { withFileTypes: true }).map((e) => [e.name, e.isDirectory() ? 2 : 1]),
      readFile: async (u) => fs.readFileSync(u.fsPath),
      stat: async (u) => fs.statSync(u.fsPath),
      createDirectory: async () => {},
      writeFile: async (u, bytes) => {
        (calls.written ??= []).push(u.fsPath);
        (calls.writtenText ??= {})[u.fsPath] = Buffer.from(bytes ?? []).toString('utf8');
      },
      copy: async () => {},
      delete: async () => {},
    },
    openTextDocument: async (u) => ({
      uri: u,
      version: 1,
      languageId: 'plaintext',
      isUntitled: false,
      // A slice of VS Code's settings schema, which the settings provider reads for every core setting.
      getText: () =>
        String(u) === 'vscode://schemas/settings/default'
          ? JSON.stringify({
              properties: {
                'editor.fontSize': { $ref: '#/$defs/_1' },
                'editor.cursorWidth': { type: 'number', description: 'Cursor width.', scope: 6 },
              },
              $defs: { _1: { type: 'number', description: 'Font size.', scope: 6 } },
            })
          : '',
    }),
    applyEdit: async () => true,
  },
  extensions: {
    all: [self],
    onDidChange: event(),
    getExtension: (id) => (id === self.id ? self : undefined),
  },
  commands: {
    registerCommand: (id, fn) => {
      registered.set(id, fn);
      return new Disposable(() => registered.delete(id));
    },
    executeCommand: async (id, ...args) => {
      calls.commands.push([id, ...args]);
      if (registered.has(id)) return registered.get(id)(...args);
      if (id === 'setContext') return undefined;
      return undefined;
    },
    getCommands: async () => [...registered.keys()],
  },
  languages: {
    registerCompletionItemProvider: (_s, provider) => {
      calls.completion = provider;
      return new Disposable();
    },
    getDiagnostics: (u) => (u ? [] : []),
  },
  lm: { selectChatModels: async () => [], onDidChangeChatModels: event() },
  tasks: { fetchTasks: async () => [], executeTask: async () => undefined },
  _calls: calls,
  _settings: settings,
};

module.exports = vscode;
