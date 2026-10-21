import * as path from 'node:path';
import * as vscode from 'vscode';
import { detectProject, MANIFESTS, type DirectoryScan, type ProjectCommand } from '../core/detect';
import { expandTemplate, shellQuote, templateVariables } from '../core/template';
import { variableResolver } from '../services/macro';
import type { Services } from '../services/services';
import { shellKind } from '../services/terminal';
import type { SlashItem, SlashProvider } from '../types';
import { ensureArgs, itemFactory } from './util';

const make = itemFactory('project', 'Project');
// Files that only mark a stack (read by name, not content) still need a scan and a refresh when they change.
const MARKERS = [
  '*.csproj',
  '*.fsproj',
  '*.sln',
  'Dockerfile',
  'compose.yaml',
  'compose.yml',
  'docker-compose.yml',
  'docker-compose.yaml',
  '*.tf',
  'CMakeLists.txt',
  'Package.swift',
  'eas.json',
  'firebase.json',
  'wrangler.toml',
  'wrangler.json',
  'wrangler.jsonc',
  'alembic.ini',
  '.golangci.*',
  'l10n.yaml',
  'melos.yaml',
  '.fvmrc',
];
const MANIFEST_GLOB = `**/{${[...MANIFESTS, ...MARKERS].join(',')}}`;
const MAX_DIRS = 40;

/** Detects the repository's stack and offers matching commands (scripts, package manager, tools). */
export class ProjectProvider implements SlashProvider {
  readonly id = 'project' as const;
  readonly title = 'Project';
  readonly description = 'Commands for your stack: package scripts, package manager, frameworks and tools.';
  readonly icon = 'stack';
  readonly prefix = 'p';
  readonly placeholder = 'Run a script or project tool…';
  readonly features = [
    { id: 'scripts', title: 'Scripts', description: 'package.json scripts, Makefile targets, just recipes, deno tasks, composer scripts.' },
    {
      id: 'packageManager',
      title: 'Package manager',
      description: 'install, add, remove, update, audit… for npm, pnpm, yarn, bun, uv, Poetry, pip, Composer.',
    },
    {
      id: 'tools',
      title: 'Frameworks & tools',
      description:
        'Next.js, Vite, Vitest, ESLint, Prisma, Expo, Flutter, FastAPI, NestJS, Firebase, Supabase, Docker, Cargo, Go, .NET, Gradle…',
    },
  ];
  readonly scopes = [{ prefix: 'npm', title: 'Scripts', icon: 'package', placeholder: 'Run a package script…', feature: 'scripts' }];

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private readonly watcher = vscode.workspace.createFileSystemWatcher(MANIFEST_GLOB);
  private timer?: NodeJS.Timeout;

  constructor(private readonly services: Services) {
    const changed = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.emitter.fire(), 600);
    };
    this.watcher.onDidChange(changed);
    this.watcher.onDidCreate(changed);
    this.watcher.onDidDelete(changed);
    vscode.workspace.onDidChangeWorkspaceFolders(changed);
  }

  dispose(): void {
    this.watcher.dispose();
    this.emitter.dispose();
  }

  async items(): Promise<SlashItem[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const items: SlashItem[] = [];
    const techs = new Set<string>();
    for (const folder of folders) {
      const scans = await this.scan(folder);
      const result = detectProject(scans);
      result.techs.forEach((t) => techs.add(t));
      const prefix = folders.length > 1 ? `${folder.name} · ` : '';
      for (const command of result.commands) items.push(this.toItem(command, folder, prefix));
    }
    this.services.stack = Array.from(techs);
    if (techs.size) {
      items.push(
        make({
          id: 'project:stack',
          name: 'stack',
          title: 'Detected Stack',
          description: Array.from(techs).join(' · '),
          icon: 'stack',
          feature: 'tools',
          run: () => vscode.window.showInformationMessage(`Slashi detected: ${Array.from(techs).join(', ')}`),
        }),
      );
    }
    return items;
  }

  private toItem(command: ProjectCommand, folder: vscode.WorkspaceFolder, prefix: string): SlashItem {
    return make({
      id: `${command.id}@${folder.uri.toString()}`,
      name: command.name,
      title: `${prefix}${command.title}`,
      description: command.description,
      icon: command.icon,
      category: command.group === 'scripts' ? 'Scripts' : command.tech,
      feature: command.group,
      keywords: [command.tech, command.command],
      args:
        command.args || templateVariables(command.command).includes('args')
          ? // Scripts run on Enter; arguments are only used when typed (`/test --watch`).
            { placeholder: command.args ?? 'arguments', required: command.group === 'scripts' ? false : undefined }
          : undefined,
      boost: command.group === 'scripts' ? 6 : 0,
      aiKind: 'shell command',
      aiHint: command.command,
      run: async (ctx) => {
        let args = ctx.args;
        const vars = templateVariables(command.command);
        if (vars.includes('args') && !args && command.args && !/optional|default/.test(command.args)) {
          const value = await ensureArgs('', command.args, { title: command.title });
          if (value === undefined) return;
          args = value;
        }
        const editor = vars.some((v) => v !== 'args') ? await ctx.editor() : undefined;
        const resolve = await variableResolver(editor, args, {});
        const shell = shellKind();
        let line = expandTemplate(command.command, resolve, (v) => shellQuote(v, shell)).replace(/\s+$/, '');
        // `npm run x --` with nothing after it.
        if (!args) line = line.replace(/\s+--$/, '');
        ctx.services.terminal.run(line, { cwd: path.join(folder.uri.fsPath, command.cwd) });
      },
    });
  }

  /** Root of the folder plus every directory containing a known manifest (monorepos), ignoring dependencies. */
  private async scan(folder: vscode.WorkspaceFolder): Promise<DirectoryScan[]> {
    const dirs = new Set<string>(['']);
    try {
      const found = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, MANIFEST_GLOB),
        '{**/node_modules/**,**/.git/**,**/vendor/**,**/target/**,**/dist/**,**/build/**,**/.venv/**,**/venv/**,**/Pods/**,**/.dart_tool/**}',
        400,
      );
      for (const uri of found) {
        const rel = path.posix.dirname(vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/'));
        dirs.add(rel === '.' ? '' : rel);
        if (dirs.size >= MAX_DIRS) break;
      }
    } catch (err) {
      this.services.log.warn('Project scan failed', err);
    }
    const scans: DirectoryScan[] = [];
    for (const dir of dirs) {
      const uri = dir ? vscode.Uri.joinPath(folder.uri, dir) : folder.uri;
      let entries: [string, vscode.FileType][] = [];
      try {
        entries = await vscode.workspace.fs.readDirectory(uri);
      } catch {
        continue;
      }
      const files = entries.filter(([, type]) => type !== vscode.FileType.Directory).map(([name]) => name);
      const subdirs = entries.filter(([, type]) => type === vscode.FileType.Directory).map(([name]) => name);
      const read: Record<string, string> = {};
      for (const name of files) {
        if (!(MANIFESTS as readonly string[]).includes(name)) continue;
        try {
          const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(uri, name));
          if (bytes.byteLength < 512_000) read[name] = new TextDecoder().decode(bytes);
        } catch {
          // Unreadable manifests are skipped.
        }
      }
      scans.push({ dir, files, dirs: subdirs, read });
    }
    return scans;
  }
}
