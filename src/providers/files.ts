import * as path from 'node:path';
import * as vscode from 'vscode';
import { get, isFeatureEnabled } from '../config';
import type { ActionView } from '../core/protocol';
import type { Services } from '../services/services';
import { workspaceRoot } from '../services/terminal';
import type { RunContext, SlashItem, SlashProvider } from '../types';
import { ensureArgs, itemFactory } from './util';

const make = itemFactory('files', 'Files');

const EXT_ICONS: Record<string, string> = {
  ts: 'file-ts',
  mts: 'file-ts',
  cts: 'file-ts',
  tsx: 'file-tsx',
  js: 'file-js',
  mjs: 'file-js',
  cjs: 'file-js',
  jsx: 'file-jsx',
  py: 'file-py',
  rs: 'file-rs',
  md: 'file-md',
  mdx: 'file-md',
  css: 'file-css',
  scss: 'file-css',
  less: 'file-css',
  html: 'file-html',
  vue: 'file-vue',
  sql: 'file-sql',
  svg: 'file-svg',
  png: 'file-png',
  jpg: 'file-jpg',
  jpeg: 'file-jpg',
  gif: 'file-image',
  webp: 'file-image',
  c: 'file-c',
  h: 'file-c',
  cpp: 'file-cpp',
  hpp: 'file-cpp',
  cc: 'file-cpp',
  cs: 'file-c-sharp',
  csv: 'file-csv',
  pdf: 'file-pdf',
  zip: 'file-zip',
  gz: 'file-zip',
  txt: 'file-txt',
  json: 'brackets-curly',
  jsonc: 'brackets-curly',
  yml: 'file-code',
  yaml: 'file-code',
  toml: 'file-ini',
  ini: 'file-ini',
  env: 'lock-key',
  lock: 'file-lock',
  go: 'file-code',
  java: 'file-code',
  kt: 'file-code',
  rb: 'file-code',
  php: 'file-code',
  swift: 'file-code',
  sh: 'terminal-window',
  ps1: 'terminal-window',
  doc: 'file-doc',
  docx: 'file-doc',
  xls: 'file-xls',
  xlsx: 'file-xls',
  ppt: 'file-ppt',
  mp4: 'file-video',
  mov: 'file-video',
  mp3: 'file-audio',
  wav: 'file-audio',
};

function fileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower === 'dockerfile' || lower.startsWith('docker-compose')) return 'cube';
  if (lower === 'package.json') return 'package';
  if (lower.startsWith('readme')) return 'book-open';
  if (lower === '.gitignore' || lower === '.gitattributes') return 'git-branch';
  const ext = lower.includes('.') ? lower.split('.').pop()! : '';
  return EXT_ICONS[ext] ?? 'file-text';
}

/** Workspace files & folders with full CRUD. */
export class FilesProvider implements SlashProvider {
  readonly id = 'files' as const;
  readonly title = 'Files & Folders';
  readonly description = 'Search, create, open, rename, move, duplicate and delete files and folders.';
  readonly icon = 'folder-open';
  readonly prefix = 'f';
  readonly placeholder = 'Search files and folders…';
  readonly features = [
    { id: 'search', title: 'Search files & folders', description: 'Find any file or folder in the workspace.' },
    { id: 'create', title: 'Create', description: '/new and /mkdir.' },
    { id: 'rename', title: 'Rename & move', description: '/rename, /move and rename/move actions.' },
    { id: 'duplicate', title: 'Duplicate', description: '/dup and the duplicate action.' },
    { id: 'delete', title: 'Delete', description: '/delete and the delete action (moves to trash).' },
    { id: 'clipboard', title: 'Copy paths', description: 'Copy absolute/relative paths and names.' },
    { id: 'reveal', title: 'Reveal', description: 'Reveal in Explorer and in the OS file manager.' },
  ];

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private uris?: Promise<vscode.Uri[]>;
  private readonly watcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);
  private timer?: NodeJS.Timeout;

  constructor(private readonly services: Services) {
    const changed = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.uris = undefined;
        this.emitter.fire();
      }, 800);
    };
    this.watcher.onDidCreate(changed);
    this.watcher.onDidDelete(changed);
    vscode.workspace.onDidChangeWorkspaceFolders(changed);
  }

  dispose(): void {
    this.watcher.dispose();
    this.emitter.dispose();
  }

  private listFiles(): Promise<vscode.Uri[]> {
    if (!this.uris) {
      const excludes = new Set(['**/node_modules/**', '**/.git/**']);
      for (const section of ['files.exclude', 'search.exclude']) {
        const map = vscode.workspace.getConfiguration().get<Record<string, unknown>>(section) ?? {};
        for (const [glob, on] of Object.entries(map)) if (on === true) excludes.add(glob);
      }
      const max = get('files.maxIndexed', 20000);
      this.uris = Promise.resolve(vscode.workspace.findFiles('**/*', `{${Array.from(excludes).join(',')}}`, max)).then(
        (uris) => uris,
        (err) => {
          this.services.log.error('Indexing files failed', err);
          return [];
        },
      );
    }
    return this.uris;
  }

  async items(): Promise<SlashItem[]> {
    const items = this.commandItems();
    if (!isFeatureEnabled('files', 'search')) return items;
    const uris = await this.listFiles();
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const folders = new Map<string, vscode.Uri>();
    const fileActions = this.actions('file');
    for (const uri of uris) {
      const rel = vscode.workspace.asRelativePath(uri, multiRoot);
      const name = path.posix.basename(rel);
      const dir = path.posix.dirname(rel);
      items.push(
        make({
          id: `file:${uri.toString()}`,
          title: name,
          description: dir === '.' ? '' : dir,
          icon: fileIcon(name),
          feature: 'search',
          keywords: [rel],
          remote: true,
          actions: fileActions,
          aiKind: 'file',
          run: (ctx) => this.fileAction(uri, ctx),
        }),
      );
      // Register every ancestor folder inside the workspace folder.
      let parent = vscode.Uri.joinPath(uri, '..');
      let parentRel = dir;
      while (parentRel && parentRel !== '.' && !folders.has(parentRel)) {
        folders.set(parentRel, parent);
        parent = vscode.Uri.joinPath(parent, '..');
        parentRel = path.posix.dirname(parentRel);
      }
    }
    const folderActions = this.actions('folder');
    for (const [rel, uri] of folders) {
      const parent = path.posix.dirname(rel);
      items.push(
        make({
          id: `folder:${uri.toString()}`,
          title: `${path.posix.basename(rel)}/`,
          description: parent === '.' ? '' : parent,
          icon: 'folder',
          feature: 'search',
          keywords: [`${rel}/`],
          remote: true,
          actions: folderActions,
          aiKind: 'folder',
          run: (ctx) => this.folderAction(uri, ctx),
        }),
      );
    }
    return items;
  }

  private actions(kind: 'file' | 'folder'): ActionView[] {
    const on = (f: string) => isFeatureEnabled('files', f);
    const list: (ActionView | false)[] = [
      kind === 'file' && { id: 'openSide', title: 'Open to the side', icon: 'columns', hint: '⌥↵' },
      kind === 'folder' && on('create') && { id: 'newFile', title: 'New file here…', icon: 'file-plus' },
      kind === 'folder' && on('create') && { id: 'newFolder', title: 'New folder here…', icon: 'folder-plus' },
      on('rename') && { id: 'rename', title: 'Rename…', icon: 'pencil-simple-line' },
      on('rename') && { id: 'move', title: 'Move to folder…', icon: 'arrows-out-cardinal' },
      kind === 'file' && on('duplicate') && { id: 'duplicate', title: 'Duplicate…', icon: 'copy-simple' },
      on('clipboard') && { id: 'copyPath', title: 'Copy path', icon: 'copy' },
      on('clipboard') && { id: 'copyRelative', title: 'Copy relative path', icon: 'copy' },
      on('reveal') && { id: 'reveal', title: 'Reveal in Explorer', icon: 'tree-view' },
      on('reveal') && { id: 'revealOs', title: 'Reveal in OS file manager', icon: 'arrow-square-out' },
      kind === 'folder' && { id: 'terminal', title: 'Open terminal here', icon: 'terminal-window' },
      kind === 'folder' && { id: 'findIn', title: 'Find in folder…', icon: 'magnifying-glass' },
      on('delete') && { id: 'delete', title: 'Delete (move to trash)', icon: 'trash', danger: true },
    ];
    return list.filter((a): a is ActionView => !!a);
  }

  private async fileAction(uri: vscode.Uri, ctx: RunContext): Promise<void> {
    switch (ctx.action) {
      case undefined:
      case 'open':
        await vscode.window.showTextDocument(uri, { preview: false });
        return;
      case 'openSide':
        await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside, preview: false });
        return;
      case 'duplicate':
        await duplicate(uri, ctx.args);
        return;
      default:
        await this.commonAction(uri, ctx);
    }
  }

  private async folderAction(uri: vscode.Uri, ctx: RunContext): Promise<void> {
    switch (ctx.action) {
      case undefined:
      case 'reveal':
        await vscode.commands.executeCommand('revealInExplorer', uri);
        await vscode.commands.executeCommand('list.expand');
        return;
      case 'newFile': {
        const name = await ensureArgs(ctx.args, 'File name (use / for sub-folders)', {
          title: `New file in ${vscode.workspace.asRelativePath(uri)}`,
        });
        if (name) await createPath(vscode.Uri.joinPath(uri, name), false);
        return;
      }
      case 'newFolder': {
        const name = await ensureArgs(ctx.args, 'Folder name', { title: `New folder in ${vscode.workspace.asRelativePath(uri)}` });
        if (name) await createPath(vscode.Uri.joinPath(uri, name), true);
        return;
      }
      case 'terminal':
        vscode.window.createTerminal({ cwd: uri.fsPath, name: path.basename(uri.fsPath) }).show();
        return;
      case 'findIn':
        await vscode.commands.executeCommand('workbench.action.findInFiles', {
          filesToInclude: vscode.workspace.asRelativePath(uri),
          query: ctx.args || undefined,
        });
        return;
      default:
        await this.commonAction(uri, ctx);
    }
  }

  private async commonAction(uri: vscode.Uri, ctx: RunContext): Promise<void> {
    switch (ctx.action) {
      case 'rename':
        await rename(uri, ctx.args);
        return;
      case 'move':
        await move(uri, ctx.args, this);
        return;
      case 'delete':
        await remove(uri);
        return;
      case 'copyPath':
        await copy(uri.fsPath);
        return;
      case 'copyRelative':
        await copy(vscode.workspace.asRelativePath(uri, false));
        return;
      case 'reveal':
        await vscode.commands.executeCommand('revealInExplorer', uri);
        return;
      case 'revealOs':
        await vscode.commands.executeCommand('revealFileInOS', uri);
        return;
    }
  }

  /** Folder list for the move picker. */
  async folderUris(): Promise<vscode.Uri[]> {
    const uris = await this.listFiles();
    const set = new Map<string, vscode.Uri>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) set.set(folder.uri.toString(), folder.uri);
    for (const uri of uris) {
      const parent = vscode.Uri.joinPath(uri, '..');
      set.set(parent.toString(), parent);
    }
    return Array.from(set.values()).sort((a, b) => a.path.localeCompare(b.path));
  }

  private commandItems(): SlashItem[] {
    const current = async (ctx: RunContext) => {
      const uri = (await ctx.editor())?.document.uri;
      if (!uri || uri.scheme === 'untitled') throw new Error('Open a saved file first.');
      return uri;
    };
    return [
      make({
        id: 'files:new',
        name: 'new',
        title: 'New File',
        description: 'Create a file (paths create folders; ./ is relative to the current file)',
        icon: 'file-plus',
        feature: 'create',
        args: { placeholder: 'path/to/file.ts' },
        boost: 8,
        keywords: ['create', 'touch', 'add file'],
        run: async (ctx) => {
          const input = await ensureArgs(ctx.args, 'New file path (relative to the workspace, ./ for the current folder)', {
            value: relativeBase(),
          });
          if (input) await createPath(resolveInput(input), input.endsWith('/'));
        },
      }),
      make({
        id: 'files:mkdir',
        name: 'mkdir',
        title: 'New Folder',
        description: 'Create a folder (with parents)',
        icon: 'folder-plus',
        feature: 'create',
        args: { placeholder: 'path/to/folder' },
        keywords: ['create directory'],
        run: async (ctx) => {
          const input = await ensureArgs(ctx.args, 'New folder path', { value: relativeBase() });
          if (input) await createPath(resolveInput(input), true);
        },
      }),
      make({
        id: 'files:rename',
        name: 'rename',
        title: 'Rename Current File',
        description: 'Rename the active file (imports are updated by language extensions)',
        icon: 'pencil-simple-line',
        feature: 'rename',
        args: { placeholder: 'new-name.ts' },
        boost: 4,
        needsEditor: true,
        run: async (ctx) => rename(await current(ctx), ctx.args),
      }),
      make({
        id: 'files:move',
        name: 'move',
        title: 'Move Current File',
        description: 'Move the active file to another folder',
        icon: 'arrows-out-cardinal',
        feature: 'rename',
        args: { placeholder: 'destination folder' },
        needsEditor: true,
        run: async (ctx) => move(await current(ctx), ctx.args, this),
      }),
      make({
        id: 'files:dup',
        name: 'dup',
        title: 'Duplicate Current File',
        description: 'Copy the active file next to itself',
        icon: 'copy-simple',
        feature: 'duplicate',
        args: { placeholder: 'new name (optional)' },
        needsEditor: true,
        run: async (ctx) => duplicate(await current(ctx), ctx.args),
      }),
      make({
        id: 'files:delete',
        name: 'delete',
        title: 'Delete Current File',
        description: 'Move the active file to the trash',
        icon: 'trash',
        feature: 'delete',
        needsEditor: true,
        run: async (ctx) => remove(await current(ctx)),
      }),
      make({
        id: 'files:copy-path',
        name: 'copy-path',
        title: 'Copy Path of Current File',
        icon: 'copy',
        feature: 'clipboard',
        needsEditor: true,
        run: async (ctx) => copy((await current(ctx)).fsPath),
      }),
      make({
        id: 'files:copy-rel',
        name: 'copy-rel',
        title: 'Copy Relative Path of Current File',
        icon: 'copy',
        feature: 'clipboard',
        needsEditor: true,
        run: async (ctx) => copy(vscode.workspace.asRelativePath(await current(ctx), false)),
      }),
      make({
        id: 'files:copy-name',
        name: 'copy-name',
        title: 'Copy File Name',
        icon: 'copy',
        feature: 'clipboard',
        needsEditor: true,
        run: async (ctx) => copy(path.basename((await current(ctx)).fsPath)),
      }),
      make({
        id: 'files:reveal',
        name: 'reveal',
        title: 'Reveal Current File in Explorer',
        icon: 'tree-view',
        feature: 'reveal',
        needsEditor: true,
        run: async (ctx) => vscode.commands.executeCommand('revealInExplorer', await current(ctx)),
      }),
      make({
        id: 'files:reveal-os',
        name: 'reveal-os',
        title: 'Reveal Current File in OS',
        icon: 'arrow-square-out',
        feature: 'reveal',
        needsEditor: true,
        run: async (ctx) => vscode.commands.executeCommand('revealFileInOS', await current(ctx)),
      }),
    ];
  }
}

function relativeBase(): string {
  const doc = vscode.window.activeTextEditor?.document;
  if (!doc || doc.isUntitled) return '';
  const dir = path.posix.dirname(vscode.workspace.asRelativePath(doc.uri, false));
  return dir === '.' ? '' : `${dir}/`;
}

/** `./x` and `../x` are relative to the active file; everything else to the workspace root. */
function resolveInput(input: string): vscode.Uri {
  const clean = input.trim().replace(/\\/g, '/');
  if (path.isAbsolute(clean)) return vscode.Uri.file(clean);
  const doc = vscode.window.activeTextEditor?.document;
  if ((clean.startsWith('./') || clean.startsWith('../')) && doc && !doc.isUntitled) {
    return vscode.Uri.joinPath(doc.uri, '..', clean);
  }
  const root = vscode.workspace.workspaceFolders?.[0]?.uri ?? (workspaceRoot() ? vscode.Uri.file(workspaceRoot()!) : undefined);
  if (!root) throw new Error('Open a folder first.');
  return vscode.Uri.joinPath(root, clean);
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export async function createPath(uri: vscode.Uri, folder: boolean): Promise<void> {
  if (folder) {
    await vscode.workspace.fs.createDirectory(uri);
    await vscode.commands.executeCommand('revealInExplorer', uri);
    void vscode.window.setStatusBarMessage(`$(new-folder) Created ${vscode.workspace.asRelativePath(uri)}`, 3000);
    return;
  }
  if (!(await exists(uri))) {
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(uri, { ignoreIfExists: true });
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    await vscode.workspace.applyEdit(edit);
  }
  await vscode.window.showTextDocument(uri, { preview: false });
}

async function rename(uri: vscode.Uri, args: string): Promise<void> {
  const current = path.basename(uri.fsPath);
  const name = await ensureArgs(args, `Rename “${current}” to`, { value: current });
  if (!name || name === current) return;
  const target = vscode.Uri.joinPath(uri, '..', name);
  if (await exists(target)) throw new Error(`${vscode.workspace.asRelativePath(target)} already exists.`);
  const edit = new vscode.WorkspaceEdit();
  edit.renameFile(uri, target, { overwrite: false });
  if (!(await vscode.workspace.applyEdit(edit))) throw new Error('Rename was rejected.');
}

async function move(uri: vscode.Uri, args: string, provider: FilesProvider): Promise<void> {
  let destination: vscode.Uri | undefined;
  if (args) destination = resolveInput(args);
  else {
    const folders = await provider.folderUris();
    const pick = await vscode.window.showQuickPick(
      folders.map((f) => ({ label: `$(folder) ${vscode.workspace.asRelativePath(f, true) || '/'}`, uri: f })),
      { placeHolder: `Move ${path.basename(uri.fsPath)} to…`, matchOnDescription: true },
    );
    destination = pick?.uri;
  }
  if (!destination) return;
  await vscode.workspace.fs.createDirectory(destination);
  const target = vscode.Uri.joinPath(destination, path.basename(uri.fsPath));
  const edit = new vscode.WorkspaceEdit();
  edit.renameFile(uri, target, { overwrite: false });
  if (!(await vscode.workspace.applyEdit(edit))) throw new Error('Move was rejected.');
}

async function duplicate(uri: vscode.Uri, args: string): Promise<void> {
  const ext = path.extname(uri.fsPath);
  const base = path.basename(uri.fsPath, ext);
  const suggestion = `${base}.copy${ext}`;
  const name = await ensureArgs(args, 'Name of the copy', { value: suggestion });
  if (!name) return;
  const target = vscode.Uri.joinPath(uri, '..', name);
  await vscode.workspace.fs.copy(uri, target, { overwrite: false });
  await vscode.window.showTextDocument(target, { preview: false });
}

async function remove(uri: vscode.Uri): Promise<void> {
  const rel = vscode.workspace.asRelativePath(uri, false);
  if (get('files.confirmDelete', true)) {
    const choice = await vscode.window.showWarningMessage(
      `Delete “${rel}”?`,
      { modal: true, detail: 'It will be moved to the trash when possible.' },
      'Delete',
    );
    if (choice !== 'Delete') return;
  }
  try {
    await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
  } catch {
    const choice = await vscode.window.showWarningMessage(
      `The trash isn't available here. Permanently delete “${rel}”?`,
      { modal: true },
      'Delete Permanently',
    );
    if (choice !== 'Delete Permanently') return;
    await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: false });
  }
  void vscode.window.setStatusBarMessage(`$(trash) Deleted ${rel}`, 3000);
}

async function copy(text: string): Promise<void> {
  await vscode.env.clipboard.writeText(text);
  void vscode.window.setStatusBarMessage(`$(copy) Copied ${text}`, 2500);
}
