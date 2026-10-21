import * as vscode from 'vscode';
import type { SlashiApi } from './api';
import { get, isFeatureEnabled, isProviderEnabled, setFeatureEnabled, shortcutLabel, updateGlobal } from './config';
import { parseQuery } from './core/query';
import { HELP_LINKS } from './data/links';
import { execute, reportError } from './executor';
import { AiProvider, pickModel } from './providers/ai';
import { CommandsProvider } from './providers/commands';
import { CustomProvider, editTeamCommands, exportPack, newCommandWizard } from './providers/custom';
import { ExtensionsProvider } from './providers/extensions';
import { FilesProvider } from './providers/files';
import { GitProvider } from './providers/git';
import { installFromUrl, MarketplaceProvider } from './providers/marketplace';
import { doWithAi, NaturalLanguageProvider } from './providers/naturalLanguage';
import { NavigationProvider } from './providers/navigation';
import { ProjectProvider } from './providers/project';
import { SettingsProvider } from './providers/settings';
import { diagnostics, SystemProvider } from './providers/system';
import { TerminalProvider } from './providers/terminal';
import { ThemesProvider } from './providers/themes';
import { TransformsProvider } from './providers/transforms';
import { WebProvider } from './providers/web';
import type { BackendId } from './llm/types';
import { Registry } from './registry';
import { currentDocument, snapshotEditor } from './services/editor';
import { Services } from './services/services';
import { AnswerPanel } from './ui/answer';
import { InlineSlashCompletions } from './ui/inline';
import { openNative } from './ui/native';
import { Onboarding } from './ui/onboarding';
import { Spotlight } from './ui/spotlight';
import { Studio } from './ui/studio';

export function activate(context: vscode.ExtensionContext): SlashiApi {
  const log = vscode.window.createOutputChannel('Slashi', { log: true });
  const services = new Services(context, log);
  const registry = new Registry(log, () => currentDocument(services.snapshot)?.languageId);
  services.registry = registry;

  const custom = new CustomProvider(services);
  const marketplace = new MarketplaceProvider(services);
  const providers = [
    new FilesProvider(services),
    new NavigationProvider(services),
    new ProjectProvider(services),
    new CommandsProvider(),
    new SettingsProvider(),
    new ExtensionsProvider(),
    new AiProvider(services),
    new NaturalLanguageProvider(services),
    new TransformsProvider(),
    new TerminalProvider(services),
    new GitProvider(),
    new ThemesProvider(),
    new WebProvider(),
    custom,
    marketplace,
    new SystemProvider(services),
  ];
  for (const provider of providers) context.subscriptions.push(registry.register(provider));

  const spotlight = new Spotlight(services, context.extensionUri);
  const answers = new AnswerPanel(services, context.extensionUri);
  const studio = new Studio(services, context.extensionUri);
  const onboarding = new Onboarding(services, context.extensionUri);
  context.subscriptions.push(log, services, registry, spotlight, answers, studio, onboarding);

  services.showAnswer = (request) => answers.show(request);
  services.openPopup = async (query = '', style) => {
    if ((style ?? get('popup.style', 'spotlight')) === 'native') {
      spotlight.close();
      await openNative(services, query);
    } else {
      await spotlight.open(query);
    }
  };
  services.runSlash = async (text) => {
    const query = parseQuery(text.startsWith('/') ? text : `/${text}`, []);
    const items = await registry.allItems();
    const item = items.find((i) => i.name === query.head) ?? items.find((i) => i.id === text);
    if (!item) return false;
    await execute(services, item, query.rest, undefined, services.snapshot ?? snapshotEditor());
    return true;
  };

  // VS Code passes command arguments untyped; each handler declares the shape it accepts.
  // oxlint-disable-next-line typescript/no-explicit-any
  const command = (id: string, fn: (...args: any[]) => unknown) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: unknown[]) => {
        try {
          await fn(...args);
        } catch (err) {
          await reportError(services, err, id.replace('slashi.', ''));
        }
      }),
    );

  const scoped = (prefix: string) => () => services.openPopup(`/${prefix} `);
  command('slashi.open', (query?: unknown) => {
    if (onboarding.interceptShortcut()) return;
    return services.openPopup(typeof query === 'string' ? query : '');
  });
  command('slashi.welcome', () => onboarding.open());
  command('slashi.openNative', (query?: unknown) => services.openPopup(typeof query === 'string' ? query : '', 'native'));
  command('slashi.run', async (slash?: unknown) => {
    const text =
      typeof slash === 'string' && slash ? slash : await vscode.window.showInputBox({ prompt: 'Slash command to run', value: '/' });
    if (!text) return;
    services.snapshot = snapshotEditor();
    if (!(await services.runSlash(text))) void vscode.window.showWarningMessage(`Slashi: no command matches “${text}”.`);
  });
  command('slashi.openFiles', scoped('f'));
  command('slashi.openSettings', scoped('set'));
  command('slashi.openExtensions', scoped('ext'));
  command('slashi.openAI', scoped('ai'));
  command('slashi.openGit', scoped('git'));
  command('slashi.openProject', scoped('p'));
  command('slashi.openTerminal', scoped('term'));
  command('slashi.openCustom', scoped('my'));
  command('slashi.openMarketplace', scoped('market'));
  command('slashi.doWithAI', async (task?: unknown) => {
    const snapshot = snapshotEditor();
    const text =
      typeof task === 'string' && task
        ? task
        : await vscode.window.showInputBox({
            title: 'Do with AI',
            prompt: 'Describe what you want to do',
            placeHolder: 'e.g. split the editor, turn on word wrap and run the tests',
            ignoreFocusOut: true,
          });
    if (text) await doWithAi(services, text, snapshot);
  });
  command('slashi.ask', async (question?: unknown) => {
    services.snapshot = snapshotEditor();
    await registry.allItems();
    const item = registry.find('ai:ask');
    if (item) await execute(services, item, typeof question === 'string' ? question : '', undefined, services.snapshot);
  });
  command('slashi.studio', (tab?: unknown) => studio.open(typeof tab === 'string' ? tab : undefined));
  command('slashi.toggleProviders', () => toggleProviders(registry));
  command('slashi.selectModel', () => pickModel(services));
  command('slashi.setApiKey', async () => {
    const backend = await vscode.window.showQuickPick(
      [
        { label: 'Anthropic (Claude)', value: 'anthropic' as const },
        { label: 'OpenAI', value: 'openai' as const },
        { label: 'OpenAI-compatible server', value: 'openaiCompatible' as const },
      ],
      { title: 'Which provider is the key for?' },
    );
    if (!backend) return;
    const key = await vscode.window.showInputBox({
      title: `${backend.label} API key`,
      password: true,
      ignoreFocusOut: true,
      prompt: 'Stored in VS Code Secret Storage, never in your settings files.',
    });
    if (!key) return;
    await services.ai.setKey(backend.value, key);
    if (get('ai.provider', 'auto') === 'auto' && backend.value !== 'openaiCompatible') await updateGlobal('ai.provider', backend.value);
    void vscode.window.showInformationMessage(`Slashi: ${backend.label} key saved.`);
  });
  command('slashi.clearApiKey', async () => {
    const backends: BackendId[] = [];
    for (const b of services.ai.keyBackends()) if (await services.ai.hasKey(b)) backends.push(b);
    if (!backends.length) return void vscode.window.showInformationMessage('Slashi has no stored API keys.');
    const pick = await vscode.window.showQuickPick(backends, { title: 'Remove which API key?' });
    if (pick) await services.ai.setKey(pick as BackendId, undefined);
  });
  command('slashi.newCommand', () => newCommandWizard(services));
  command('slashi.editTeamCommands', () => editTeamCommands());
  command('slashi.exportPack', () => exportPack());
  command('slashi.installPack', async (url?: unknown) => {
    const value =
      typeof url === 'string' && url ? url : await vscode.window.showInputBox({ prompt: 'Action pack URL (https://…) or file path' });
    if (value) await installFromUrl(services, /^[a-z]+:\/\//i.test(value) ? value : vscode.Uri.file(value).toString());
  });
  command('slashi.customizeShortcuts', () => vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'slashi.'));
  command('slashi.copyDiagnostics', async () => {
    await vscode.env.clipboard.writeText(await diagnostics(services));
    const choice = await vscode.window.showInformationMessage(
      'Slashi diagnostics copied. Paste them into your bug report.',
      'Report a Bug',
    );
    if (choice) await vscode.env.openExternal(vscode.Uri.parse(HELP_LINKS.bug));
  });
  command('slashi.clearHistory', async () => {
    await services.history.clear();
    void vscode.window.setStatusBarMessage('$(check) Slashi history cleared', 2500);
  });
  command('slashi.refresh', async () => {
    registry.invalidate();
    await marketplace.refresh(true);
    await registry.warm();
    void vscode.window.setStatusBarMessage('$(check) Slashi search results refreshed', 2500);
  });
  command('slashi.inlineRun', async (id: string) => {
    const item = registry.find(id);
    if (!item) return;
    if (item.args) return services.openPopup(`/${item.name} `);
    services.snapshot = snapshotEditor();
    await execute(services, item, '', undefined, services.snapshot);
  });

  // Status bar button
  const status = vscode.window.createStatusBarItem('slashi.status', vscode.StatusBarAlignment.Right, 1000);
  status.name = 'Slashi';
  status.text = '/ Slashi';
  status.command = 'slashi.open';
  const updateStatus = async () => {
    const label = await services.ai.label();
    const tooltip = new vscode.MarkdownString(
      `**Slashi** — \`${shortcutLabel()}\`\n\nType \`/\` to do anything.\n\nAI: ${label || '_not connected_ — `/ai-setup`'}`,
    );
    tooltip.isTrusted = false;
    status.tooltip = tooltip;
    if (get('statusBar.enabled', true)) status.show();
    else status.hide();
  };
  void updateStatus();
  context.subscriptions.push(
    status,
    services.ai.onDidChange(() => void updateStatus()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('slashi.statusBar')) void updateStatus();
      if (e.affectsConfiguration('slashi.disabledFeatures') || e.affectsConfiguration('slashi.providers')) registry.invalidate();
    }),
    vscode.languages.registerCompletionItemProvider('*', new InlineSlashCompletions(services), '/'),
  );

  // Pre-warm catalogues once VS Code is idle so the first popup is instant.
  const warm = setTimeout(() => {
    void registry.warm();
    if (isProviderEnabled('marketplace') && isFeatureEnabled('marketplace', 'browse')) void marketplace.refresh();
  }, 2000);
  context.subscriptions.push({ dispose: () => clearTimeout(warm) });

  // First run: a short, beautiful onboarding.
  if (Onboarding.shouldShow(context) && !process.env.SLASHI_SKIP_ONBOARDING) {
    const timer = setTimeout(() => onboarding.open(), 1200);
    context.subscriptions.push({ dispose: () => clearTimeout(timer) });
  }

  log.info(`Slashi activated (${providers.length} providers).`);

  return {
    version: 1,
    registerCommand: (cmd) => {
      const disposable = custom.register(cmd);
      context.subscriptions.push(disposable);
      return disposable;
    },
    open: (query) => services.openPopup(query ?? ''),
    run: (slash) => services.runSlash(slash),
  };
}

/** Multi-select picker for providers and their features. */
async function toggleProviders(registry: Registry): Promise<void> {
  type Item = vscode.QuickPickItem & { provider: string; feature?: string };
  const items: Item[] = [];
  for (const p of registry.all().filter((provider) => provider.id !== 'system')) {
    items.push({ label: p.title, kind: vscode.QuickPickItemKind.Separator, provider: p.id });
    items.push({
      label: `$(circle-large-filled) ${p.title}`,
      description: `/${p.prefix}`,
      detail: p.description,
      picked: isProviderEnabled(p.id),
      provider: p.id,
    });
    if (p.features.length > 1) {
      for (const f of p.features) {
        items.push({
          label: `      ${f.title}`,
          description: f.description,
          picked: isFeatureEnabled(p.id, f.id),
          provider: p.id,
          feature: f.id,
        });
      }
    }
  }
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: 'Slashi providers & features',
    placeHolder: 'Space toggles · Enter saves · a provider must be on for its features to show',
    matchOnDescription: true,
  });
  if (!picked) return;
  const on = new Set(picked.map((i) => `${i.provider}|${i.feature ?? ''}`));
  for (const item of items) {
    if (item.kind === vscode.QuickPickItemKind.Separator) continue;
    const enabled = on.has(`${item.provider}|${item.feature ?? ''}`);
    if (item.feature) {
      if (isFeatureEnabled(item.provider as never, item.feature) !== enabled)
        await setFeatureEnabled(item.provider as never, item.feature, enabled);
    } else if (isProviderEnabled(item.provider as never) !== enabled) {
      await updateGlobal(`providers.${item.provider}`, enabled);
    }
  }
  void vscode.window.setStatusBarMessage('$(check) Slashi providers updated', 2500);
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
