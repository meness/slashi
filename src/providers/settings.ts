import * as vscode from 'vscode';
import { isFeatureEnabled } from '../config';
import { pickIcon } from '../core/icons';
import { coreSettingsFromSchema, type SettingProperty } from '../core/settingsSchema';
import { CORE_SETTINGS, type SettingMeta } from '../data/coreSettings';
import type { RunContext, SlashItem, SlashProvider } from '../types';
import { formatValue, itemFactory, plainMarkdown, settingTitle, truncate } from './util';

const make = itemFactory('settings', 'Settings');

const POPULAR = new Set(CORE_SETTINGS.map((s) => s.key));
/** Every core setting, from VS Code's own schema once it has loaded. */
let schemaSettings: SettingMeta[] | undefined;

/** VS Code serves its settings schema only once the workbench is ready, so this can fail early on. */
async function loadSchemaSettings(): Promise<boolean> {
  if (schemaSettings) return true;
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse('vscode://schemas/settings/default'));
    const props = Object.entries(coreSettingsFromSchema(doc.getText()));
    if (props.length) schemaSettings = props.map(([key, prop]) => toMeta(key, prop));
  } catch {
    // Retried by the caller.
  }
  return !!schemaSettings;
}

function coreSettings(): SettingMeta[] {
  return schemaSettings ?? CORE_SETTINGS;
}

/** Every setting we know about: all core settings + all extension-contributed settings. */
export function collectSettings(includeCore: boolean, includeExtensions: boolean): SettingMeta[] {
  const out = new Map<string, SettingMeta>();
  if (includeCore) for (const s of coreSettings()) out.set(s.key, s);
  if (includeExtensions) {
    for (const ext of vscode.extensions.all) {
      const config = ext.packageJSON?.contributes?.configuration;
      const sections: { properties?: Record<string, SettingProperty> }[] = Array.isArray(config) ? config : config ? [config] : [];
      for (const section of sections) {
        for (const [key, prop] of Object.entries(section?.properties ?? {})) {
          if (!prop || out.has(key) || prop.deprecationMessage || prop.markdownDeprecationMessage) continue;
          out.set(key, toMeta(key, prop));
        }
      }
    }
  }
  return Array.from(out.values());
}

function toMeta(key: string, prop: SettingProperty): SettingMeta {
  const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
  const description = plainMarkdown(prop.markdownDescription ?? prop.description ?? '');
  const languageOverridable = prop.scope === 6 || prop.scope === 'language-overridable' || undefined;
  // `null` means "unset" (e.g. editor.defaultFormatter); offer the real values.
  const values = prop.enum?.filter((v) => v !== null);
  if (values?.length && values.every((v) => typeof v === 'string')) {
    return {
      key,
      type: 'enum',
      description,
      enum: values,
      enumDescriptions: (prop.markdownEnumDescriptions ?? prop.enumDescriptions)
        ?.filter((_, i) => prop.enum![i] !== null)
        .map(plainMarkdown),
      languageOverridable,
    };
  }
  const known = ['boolean', 'number', 'string', 'array', 'object'] as const;
  const mapped =
    type === 'integer' ? 'number' : (known as readonly string[]).includes(type ?? '') ? (type as SettingMeta['type']) : 'object';
  return { key, type: mapped, description, languageOverridable };
}

/** Search, toggle and edit any setting. */
export class SettingsProvider implements SlashProvider {
  readonly id = 'settings' as const;
  readonly title = 'Settings';
  readonly description = 'Search, toggle and change any VS Code or extension setting.';
  readonly icon = 'gear-six';
  readonly prefix = 'set';
  readonly placeholder = 'Search settings — Enter toggles or edits…';
  readonly features = [
    { id: 'core', title: 'VS Code settings', description: 'Every built-in VS Code setting (font, format on save, auto save, minimap…).' },
    {
      id: 'extensionSettings',
      title: 'Extension settings',
      description: 'Every setting contributed by installed extensions, including built-ins like Git and TypeScript.',
    },
  ];

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private readonly subs = [
    vscode.extensions.onDidChange(() => this.emitter.fire()),
    vscode.workspace.onDidChangeConfiguration(() => this.emitter.fire()),
  ];
  private retry?: NodeJS.Timeout;

  constructor() {
    void this.loadSchema(0);
  }

  /** Swaps the curated list for the full schema as soon as VS Code serves it. */
  private async loadSchema(attempt: number): Promise<void> {
    if (await loadSchemaSettings()) this.emitter.fire();
    else if (attempt < 6) {
      this.retry = setTimeout(() => void this.loadSchema(attempt + 1), 1000 * 2 ** attempt);
      this.retry.unref?.();
    }
  }

  dispose(): void {
    clearTimeout(this.retry);
    this.subs.forEach((s) => s.dispose());
    this.emitter.dispose();
  }

  items(): SlashItem[] {
    const coreKeys = new Set(coreSettings().map((s) => s.key));
    const metas = collectSettings(isFeatureEnabled('settings', 'core'), isFeatureEnabled('settings', 'extensionSettings'));
    const config = vscode.workspace.getConfiguration();
    const items: SlashItem[] = [
      make({
        id: 'settings:ui',
        name: 'settings',
        title: 'Open Settings',
        description: 'Settings editor',
        icon: 'gear-six',
        feature: 'core',
        boost: 4,
        args: { placeholder: 'search (optional)' },
        run: (ctx) => vscode.commands.executeCommand('workbench.action.openSettings', ctx.args || undefined),
      }),
      make({
        id: 'settings:json',
        name: 'settings-json',
        title: 'Open User Settings (JSON)',
        icon: 'brackets-curly',
        feature: 'core',
        run: () => vscode.commands.executeCommand('workbench.action.openSettingsJson'),
      }),
      make({
        id: 'settings:workspace',
        name: 'workspace-settings',
        title: 'Open Workspace Settings',
        icon: 'folder-simple-user',
        feature: 'core',
        run: () => vscode.commands.executeCommand('workbench.action.openWorkspaceSettings'),
      }),
      make({
        id: 'settings:profiles',
        name: 'profiles',
        title: 'Switch Profile…',
        icon: 'user-switch',
        feature: 'core',
        run: () => vscode.commands.executeCommand('workbench.profiles.actions.switchProfile'),
      }),
    ];
    for (const meta of metas) {
      const value = config.get(meta.key);
      const isCore = coreKeys.has(meta.key);
      items.push(
        make({
          id: `set:${meta.key}`,
          title: settingTitle(meta.key),
          description: truncate(meta.description, 140),
          badge: formatValue(value),
          icon: meta.type === 'boolean' ? (value ? 'toggle-right' : 'toggle-left') : pickIcon(meta.key, 'sliders-horizontal'),
          category: isCore ? 'Settings' : 'Extension Settings',
          feature: isCore ? 'core' : 'extensionSettings',
          keywords: [meta.key],
          boost: POPULAR.has(meta.key) ? 1 : 0,
          actions: [
            { id: 'ui', title: 'Open in Settings editor', icon: 'gear-six' },
            { id: 'workspace', title: 'Set for this workspace only…', icon: 'folder-simple-user' },
            ...(meta.languageOverridable ? [{ id: 'language', title: 'Set for the current language…', icon: 'code' }] : []),
            { id: 'reset', title: 'Reset to default', icon: 'arrow-counter-clockwise' },
            { id: 'copyKey', title: 'Copy setting ID', icon: 'copy' },
          ],
          aiKind: 'setting',
          aiHint: meta.type === 'enum' ? `one of ${meta.enum!.join(' | ')}` : meta.type,
          run: (ctx) => editSetting(meta, ctx),
        }),
      );
    }
    return items;
  }
}

async function editSetting(meta: SettingMeta, ctx: RunContext): Promise<void> {
  let config = vscode.workspace.getConfiguration();
  let target = vscode.ConfigurationTarget.Global;
  let languageId: string | undefined;
  switch (ctx.action) {
    case 'ui':
      await vscode.commands.executeCommand('workbench.action.openSettings', meta.key);
      return;
    case 'reset':
      await config.update(meta.key, undefined, vscode.ConfigurationTarget.Global);
      void vscode.window.setStatusBarMessage(`$(discard) ${settingTitle(meta.key)} reset`, 3000);
      return;
    case 'copyKey':
      await vscode.env.clipboard.writeText(meta.key);
      return;
    case 'workspace':
      if (!vscode.workspace.workspaceFolders?.length) throw new Error('Open a folder to use workspace settings.');
      target = vscode.ConfigurationTarget.Workspace;
      break;
    case 'language':
      languageId = (await ctx.editor())?.document.languageId;
      if (!languageId) throw new Error('Open a file to set a value for its language.');
      config = vscode.workspace.getConfiguration(undefined, { languageId });
      break;
    default:
      break;
  }

  const current = config.get(meta.key);
  let next: unknown;
  if (meta.type === 'boolean') {
    next = !current;
  } else if (meta.type === 'enum') {
    const picked = await vscode.window.showQuickPick(
      meta.enum!.map((v, i) => ({ label: v === current ? `$(check) ${v}` : v, value: v, description: meta.enumDescriptions?.[i] })),
      { title: settingTitle(meta.key), placeHolder: meta.description },
    );
    if (!picked) return;
    next = picked.value;
  } else if (meta.type === 'number' || meta.type === 'string') {
    const input =
      ctx.args ||
      (await vscode.window.showInputBox({
        title: settingTitle(meta.key),
        prompt: meta.description,
        // Show a malformed value as JSON so the user can see and fix it.
        value: typeof current === 'string' ? current : (JSON.stringify(current) ?? ''),
        ignoreFocusOut: true,
      }));
    if (input === undefined) return;
    if (meta.type === 'number') {
      const num = Number(input);
      if (!Number.isFinite(num)) throw new Error(`“${input}” is not a number.`);
      next = num;
    } else {
      next = input;
    }
  } else {
    await vscode.commands.executeCommand('workbench.action.openSettings', meta.key);
    return;
  }
  await config.update(meta.key, next, target, languageId ? true : undefined);
  const scope = languageId ? ` [${languageId}]` : '';
  void vscode.window.setStatusBarMessage(`$(check) ${settingTitle(meta.key)}${scope} → ${formatValue(next)}`, 3000);
}
