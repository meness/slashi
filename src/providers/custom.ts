import * as vscode from 'vscode';
import { get, isFeatureEnabled, updateGlobal } from '../config';
import { NAME_PATTERN, PACK_ID_PATTERN, validateCommands, type CustomCommandDef, type PackDef, type StepDef } from '../core/commandSchema';
import { pickIcon } from '../core/icons';
import { runCustomCommand, usesArgs, type CommandSource } from '../services/macro';
import type { Services } from '../services/services';
import type { SlashItem, SlashProvider } from '../types';
import { itemFactory } from './util';

const make = itemFactory('custom', 'My Commands');
const TEAM_FILE = '.vscode/slashi.json';

/** Commands registered by other extensions through Slashi's API. */
export interface RegisteredCommand extends Omit<CustomCommandDef, 'steps'> {
  extensionId: string;
  run: (args: string) => unknown;
}

/** Your commands (settings), team commands (.vscode/slashi.json), installed packs and extension-registered commands. */
export class CustomProvider implements SlashProvider {
  readonly id = 'custom' as const;
  readonly title = 'My Commands';
  readonly description = 'Your own, your team’s, installed pack and extension-provided slash commands.';
  readonly icon = 'user-gear';
  readonly prefix = 'my';
  readonly placeholder = 'Run one of your commands…';
  readonly features = [
    { id: 'user', title: 'My commands', description: 'Defined in “slashi.customCommands” (user settings).' },
    { id: 'team', title: 'Team commands', description: 'Defined in .vscode/slashi.json and shared through the repository.' },
    { id: 'packs', title: 'Installed packs', description: 'Commands from action packs installed via /market.' },
    { id: 'extensions', title: 'From extensions', description: 'Commands other extensions register through the Slashi API.' },
  ];

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private readonly registered = new Map<string, RegisteredCommand>();
  private readonly watcher = vscode.workspace.createFileSystemWatcher(`**/${TEAM_FILE}`);
  private readonly subs: vscode.Disposable[];
  private warned = new Set<string>();

  constructor(private readonly services: Services) {
    const fire = () => this.emitter.fire();
    this.subs = [
      this.watcher,
      this.watcher.onDidChange(fire),
      this.watcher.onDidCreate(fire),
      this.watcher.onDidDelete(fire),
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('slashi.customCommands') && fire()),
      vscode.workspace.onDidGrantWorkspaceTrust(fire),
      services.packs.onDidChange(fire),
    ];
  }

  dispose(): void {
    this.subs.forEach((s) => s.dispose());
    this.emitter.dispose();
  }

  register(command: RegisteredCommand): vscode.Disposable {
    if (!NAME_PATTERN.test(command.name)) throw new Error(`Invalid Slashi command name “${command.name}”.`);
    const key = `${command.extensionId}:${command.name}`;
    this.registered.set(key, command);
    this.emitter.fire();
    return new vscode.Disposable(() => {
      this.registered.delete(key);
      this.emitter.fire();
    });
  }

  async items(): Promise<SlashItem[]> {
    const items: SlashItem[] = [...this.builtins()];
    const add = (def: CustomCommandDef, source: CommandSource, origin: string, feature: string) => {
      if (def.languages?.length) {
        const lang = this.services.snapshot?.document.languageId;
        if (lang && !def.languages.includes(lang)) return;
      }
      items.push(
        make({
          id: `custom:${source}:${origin}:${def.name}`,
          name: def.name,
          title: def.title ?? def.name,
          description: def.description ?? `${def.steps.length} step${def.steps.length === 1 ? '' : 's'}`,
          badge: source === 'user' ? undefined : source === 'team' ? 'team' : origin,
          icon: def.icon ?? pickIcon(`${def.name} ${def.title ?? ''} ${def.description ?? ''}`, 'lightning-a'),
          category: source === 'team' ? 'Team Commands' : source === 'pack' ? `Pack · ${origin}` : 'My Commands',
          feature,
          args: def.args || usesArgs(def) ? { placeholder: def.args ?? 'arguments' } : undefined,
          boost: 5,
          aiKind: 'custom command',
          run: (ctx) => runCustomCommand(def, ctx, source),
        }),
      );
    };

    if (isFeatureEnabled('custom', 'user')) {
      const { commands, errors } = validateCommands(get('customCommands', []), 'slashi.customCommands');
      this.warn('settings', errors);
      commands.forEach((c) => add(c, 'user', 'settings', 'user'));
    }
    if (isFeatureEnabled('custom', 'team') && vscode.workspace.isTrusted) {
      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const uri = vscode.Uri.joinPath(folder.uri, TEAM_FILE);
        let text: string;
        try {
          text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
        } catch {
          continue;
        }
        try {
          const json = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
          const { commands, errors } = validateCommands(Array.isArray(json) ? json : json.commands, `${folder.name}/${TEAM_FILE}`);
          this.warn(uri.toString(), errors);
          commands.forEach((c) => add(c, 'team', folder.name, 'team'));
        } catch (err) {
          this.warn(uri.toString(), [`${folder.name}/${TEAM_FILE}: ${(err as Error).message}`]);
        }
      }
    }
    if (isFeatureEnabled('custom', 'packs')) {
      for (const pack of this.services.packs.list()) pack.commands.forEach((c) => add(c, 'pack', pack.id, 'packs'));
    }
    if (isFeatureEnabled('custom', 'extensions')) {
      for (const cmd of this.registered.values()) {
        items.push(
          make({
            id: `custom:extension:${cmd.extensionId}:${cmd.name}`,
            name: cmd.name,
            title: cmd.title ?? cmd.name,
            description: cmd.description ?? cmd.extensionId,
            badge: cmd.extensionId.split('.').pop(),
            icon: cmd.icon ?? 'puzzle-piece',
            category: 'From Extensions',
            feature: 'extensions',
            args: cmd.args ? { placeholder: cmd.args } : undefined,
            run: (ctx) => cmd.run(ctx.args),
          }),
        );
      }
    }
    return items;
  }

  private warn(key: string, errors: string[]): void {
    if (!errors.length) return;
    errors.forEach((e) => this.services.log.warn(e));
    if (this.warned.has(key)) return;
    this.warned.add(key);
    void vscode.window.showWarningMessage(`Slashi: ${errors.length} problem(s) in your custom commands. ${errors[0]}`, 'Show Log').then((c) => c && this.services.log.show());
  }

  private builtins(): SlashItem[] {
    return [
      make({ id: 'custom:new', name: 'new-command', title: 'Create Custom Command', description: 'A guided wizard — no JSON needed', icon: 'plus-circle', feature: 'user', boost: 4, keywords: ['macro', 'alias', 'automation'], run: () => vscode.commands.executeCommand('slashi.newCommand') }),
      make({ id: 'custom:edit', name: 'edit-commands', title: 'Edit My Commands (settings.json)', icon: 'brackets-curly', feature: 'user', run: () => vscode.commands.executeCommand('workbench.action.openSettingsJson', { revealSetting: { key: 'slashi.customCommands' } }) }),
      make({ id: 'custom:team', name: 'team-commands', title: 'Edit Team Commands (.vscode/slashi.json)', icon: 'users-three', feature: 'team', run: () => vscode.commands.executeCommand('slashi.editTeamCommands') }),
      make({ id: 'custom:export', name: 'export-pack', title: 'Export My Commands as an Action Pack', icon: 'export', feature: 'user', run: () => vscode.commands.executeCommand('slashi.exportPack') }),
    ];
  }
}

const STEP_TYPES: { type: keyof StepDefMap; label: string; detail: string }[] = [
  { type: 'slash', label: '$(terminal-cmd) Run a slash command', detail: 'Any Slashi command, e.g. /format or /run npm test' },
  { type: 'command', label: '$(symbol-event) Run a VS Code command', detail: 'Any command ID, e.g. workbench.action.files.saveAll' },
  { type: 'terminal', label: '$(terminal) Run in terminal', detail: 'Shell command; ${args}, ${file}, ${q:selection} are expanded' },
  { type: 'setting', label: '$(settings-gear) Change a setting', detail: 'Set any setting to a value' },
  { type: 'insert', label: '$(insert) Insert text', detail: 'Insert text at the cursor (supports ${date}, ${clipboard}…)' },
  { type: 'open', label: '$(link-external) Open a URL or file', detail: 'https://… or a workspace-relative path' },
  { type: 'ai', label: '$(sparkle) Ask AI', detail: 'Prompt with ${selection}, show the answer or replace the selection' },
  { type: 'notify', label: '$(bell) Show a message', detail: 'Notification text' },
];

type StepDefMap = { slash: 1; command: 1; terminal: 1; setting: 1; insert: 1; open: 1; ai: 1; notify: 1 };

/** Guided creation of a custom command, saved to user settings or the team file. */
export async function newCommandWizard(services: Services): Promise<void> {
  const name = await vscode.window.showInputBox({
    title: 'New Slashi command (1/3): name',
    prompt: 'The slash name you will type, e.g. “ship” for /ship',
    validateInput: (v) => (NAME_PATTERN.test(v) ? undefined : 'Use lower-case letters, digits and dashes'),
    ignoreFocusOut: true,
  });
  if (!name) return;
  const title = await vscode.window.showInputBox({ title: 'New Slashi command (2/3): title', prompt: 'Shown in the popup', value: name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), ignoreFocusOut: true });
  if (title === undefined) return;

  const steps: StepDef[] = [];
  for (;;) {
    const pick = await vscode.window.showQuickPick(
      [...STEP_TYPES, ...(steps.length ? [{ type: 'done' as const, label: `$(check) Done — save /${name} with ${steps.length} step(s)`, detail: '' }] : [])],
      { title: `New Slashi command (3/3): step ${steps.length + 1}`, placeHolder: 'What should this step do?', ignoreFocusOut: true },
    );
    if (!pick) return;
    if (pick.type === 'done') break;
    const step = await askStep(pick.type, services);
    if (step) steps.push(step);
  }

  const def: CustomCommandDef = { name, title: title || undefined, steps };
  const where = await vscode.window.showQuickPick(
    [
      { label: '$(account) My commands', description: 'User settings — available everywhere', value: 'user' as const },
      { label: '$(organization) Team commands', description: `${TEAM_FILE} — shared with everyone on this repo`, value: 'team' as const },
    ],
    { title: `Save /${name} to…`, ignoreFocusOut: true },
  );
  if (!where) return;
  if (where.value === 'user') {
    const existing = (get<CustomCommandDef[]>('customCommands', []) ?? []).filter((c) => c?.name !== name);
    await updateGlobal('customCommands', [...existing, def]);
  } else {
    await writeTeamCommand(def);
  }
  const choice = await vscode.window.showInformationMessage(`/${name} is ready. Type /${name} in Slashi to run it.`, 'Run Now', 'Edit JSON');
  if (choice === 'Run Now') await services.runSlash(`/${name}`);
  if (choice === 'Edit JSON') {
    if (where.value === 'user') await vscode.commands.executeCommand('workbench.action.openSettingsJson', { revealSetting: { key: 'slashi.customCommands' } });
    else await editTeamCommands();
  }
}

async function askStep(type: keyof StepDefMap, services: Services): Promise<StepDef | undefined> {
  const input = (prompt: string, placeHolder?: string) => vscode.window.showInputBox({ prompt, placeHolder, ignoreFocusOut: true });
  switch (type) {
    case 'slash': {
      const items = (await services.registry.localItems()).filter((i) => i.name && i.providerId !== 'custom');
      const pick = await vscode.window.showQuickPick(
        items.map((i) => ({ label: `/${i.name}`, description: i.title, detail: i.args ? `accepts: ${i.args.placeholder}` : undefined, item: i })),
        { placeHolder: 'Pick a slash command', matchOnDescription: true },
      );
      if (!pick) return undefined;
      const args = pick.item.args ? await input(`Arguments for /${pick.item.name} (optional, supports \${args})`, pick.item.args.placeholder) : '';
      return { slash: `/${pick.item.name}${args ? ` ${args}` : ''}` };
    }
    case 'command': {
      const all = await vscode.commands.getCommands(true);
      const pick = await vscode.window.showQuickPick(all.sort(), { placeHolder: 'Command ID' });
      return pick ? { command: pick } : undefined;
    }
    case 'terminal': {
      const cmd = await input('Shell command', 'npm test && git push');
      return cmd ? { terminal: cmd } : undefined;
    }
    case 'setting': {
      const key = await input('Setting ID', 'editor.fontSize');
      if (!key) return undefined;
      const raw = await input(`Value for ${key} (JSON, e.g. 16, true, "on")`);
      if (raw === undefined) return undefined;
      let value: unknown = raw;
      try {
        value = JSON.parse(raw);
      } catch {
        // Plain strings don't need quotes.
      }
      return { setting: key, value };
    }
    case 'insert': {
      const text = await input('Text to insert', 'Signed-off-by: ${env:USER} on ${date}');
      return text ? { insert: text } : undefined;
    }
    case 'open': {
      const target = await input('URL or workspace-relative path', 'https://github.com/…');
      return target ? { open: target } : undefined;
    }
    case 'ai': {
      const prompt = await input('Prompt (use ${selection}, ${file}, ${args})', 'Translate to Spanish: ${selection}');
      if (!prompt) return undefined;
      const output = await vscode.window.showQuickPick(
        [
          { label: 'Show answer in panel', value: 'panel' as const },
          { label: 'Replace the selection', value: 'replace' as const },
          { label: 'Insert at cursor', value: 'insert' as const },
        ],
        { placeHolder: 'What to do with the answer?' },
      );
      return output ? { ai: prompt, output: output.value } : undefined;
    }
    case 'notify': {
      const text = await input('Message');
      return text ? { notify: text } : undefined;
    }
  }
}

async function teamFileUri(): Promise<vscode.Uri> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('Open a folder to use team commands.');
  return vscode.Uri.joinPath(folder.uri, TEAM_FILE);
}

async function readTeamFile(uri: vscode.Uri): Promise<{ $schema?: string; commands: CustomCommandDef[] }> {
  try {
    const json = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)));
    return Array.isArray(json) ? { commands: json } : { ...json, commands: json.commands ?? [] };
  } catch {
    return { $schema: SCHEMA_URL, commands: [] };
  }
}

const SCHEMA_URL = 'https://raw.githubusercontent.com/meness/slashi/main/schemas/slashi.schema.json';

async function writeTeamCommand(def: CustomCommandDef): Promise<void> {
  const uri = await teamFileUri();
  const file = await readTeamFile(uri);
  file.commands = [...file.commands.filter((c) => c.name !== def.name), def];
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(`${JSON.stringify(file, null, 2)}\n`));
}

export async function editTeamCommands(): Promise<void> {
  const uri = await teamFileUri();
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    const starter = {
      $schema: SCHEMA_URL,
      commands: [
        { name: 'check', title: 'Run All Checks', description: 'Lint, type-check and test', icon: 'check-circle', steps: [{ command: 'workbench.action.files.saveAll' }, { terminal: 'npm run lint && npm test' }] },
      ],
    };
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(`${JSON.stringify(starter, null, 2)}\n`));
  }
  await vscode.window.showTextDocument(uri);
}

/** Bundles the user's commands into a shareable pack document. */
export async function exportPack(): Promise<void> {
  const { commands } = validateCommands(get('customCommands', []));
  if (!commands.length) {
    const choice = await vscode.window.showInformationMessage('You have no custom commands yet.', 'Create One');
    if (choice) await vscode.commands.executeCommand('slashi.newCommand');
    return;
  }
  const picks = await vscode.window.showQuickPick(
    commands.map((c) => ({ label: `/${c.name}`, description: c.title, picked: true, command: c })),
    { canPickMany: true, title: 'Commands to include in the pack' },
  );
  if (!picks?.length) return;
  const id = await vscode.window.showInputBox({ prompt: 'Pack ID (lower-case, dashes)', validateInput: (v) => (PACK_ID_PATTERN.test(v) ? undefined : 'Use 2–50 lower-case letters, digits or dashes'), ignoreFocusOut: true });
  if (!id) return;
  const pack: PackDef = {
    $schema: SCHEMA_URL,
    id,
    name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    version: '1.0.0',
    description: 'Describe what this pack is for.',
    author: process.env.USER || process.env.USERNAME || 'you',
    tags: [],
    commands: picks.map((p) => p.command),
  };
  const doc = await vscode.workspace.openTextDocument({ language: 'json', content: `${JSON.stringify(pack, null, 2)}\n` });
  await vscode.window.showTextDocument(doc);
  void vscode.window.showInformationMessage(`Save it as ${id}.slashi-pack.json. Share the file, install it with “Slashi: Install Action Pack”, or publish it to the marketplace (see docs/BUILDING_ACTIONS.md).`);
}
