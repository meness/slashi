import * as vscode from 'vscode';
import { get, isFeatureEnabled, isProviderEnabled, setFeatureEnabled, updateGlobal } from '../config';
import type { ProviderId } from '../core/protocol';
import { HELP_LINKS, type HelpLink } from '../data/links';
import { BACKEND_LABELS, type BackendId, type ModelInfo } from '../llm/types';
import type { Services } from '../services/services';
import { panelIcon, webviewHtml, webviewOptions } from './html';

const CONFIG_KEYS = new Set([
  'shortcut.useSlashKey', 'popup.style', 'popup.maxResults', 'popup.showDescriptions', 'statusBar.enabled', 'inlineTrigger.enabled', 'history.enabled',
  'ai.provider', 'ai.model', 'ai.baseUrl', 'ai.anthropicEffort', 'ai.confirmBeforeRun', 'ai.customInstructions', 'ai.includeFileContext',
]);

type FromStudio =
  | { type: 'ready' }
  | { type: 'toggleProvider'; id: ProviderId; enabled: boolean }
  | { type: 'toggleFeature'; provider: ProviderId; feature: string; enabled: boolean }
  | { type: 'setConfig'; key: string; value: unknown }
  | { type: 'setKey'; backend: BackendId }
  | { type: 'clearKey'; backend: BackendId }
  | { type: 'selectModel'; model: ModelInfo }
  | { type: 'refreshModels' }
  | { type: 'testAi' }
  | { type: 'command'; command: string; args?: unknown }
  | { type: 'openLink'; link: HelpLink };

/** Studio: one place to toggle providers/features, connect AI and manage commands. */
export class Studio implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private models: ModelInfo[] = [];
  private readonly subs: vscode.Disposable[] = [];

  constructor(
    private readonly services: Services,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.subs.push(
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('slashi') && void this.pushState()),
      services.ai.onDidChange(() => void this.pushState()),
      services.registry.onDidChange(() => void this.pushState()),
    );
  }

  open(tab?: string): void {
    if (this.panel) {
      this.panel.reveal();
      if (tab) void this.panel.webview.postMessage({ type: 'tab', tab });
      return;
    }
    const panel = vscode.window.createWebviewPanel('slashi.studio', 'Slashi Studio', vscode.ViewColumn.Active, { ...webviewOptions(this.extensionUri), retainContextWhenHidden: true });
    this.panel = panel;
    panel.iconPath = panelIcon(this.extensionUri);
    panel.webview.html = webviewHtml(panel.webview, this.extensionUri, { title: 'Slashi Studio', script: 'studio.js', styles: ['studio.css'] });
    panel.onDidDispose(() => (this.panel = undefined));
    panel.webview.onDidReceiveMessage(async (m: FromStudio) => {
      try {
        await this.handle(m, tab);
      } catch (err) {
        void vscode.window.showErrorMessage(`Slashi Studio: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  private async handle(m: FromStudio, tab?: string): Promise<void> {
    const ai = this.services.ai;
    switch (m.type) {
      case 'ready':
        await this.pushState(tab);
        void this.loadModels();
        break;
      case 'toggleProvider':
        await updateGlobal(`providers.${m.id}`, m.enabled);
        break;
      case 'toggleFeature':
        await setFeatureEnabled(m.provider, m.feature, m.enabled);
        break;
      case 'setConfig':
        if (!CONFIG_KEYS.has(m.key)) throw new Error(`Unknown setting ${m.key}`);
        await updateGlobal(m.key, m.value);
        if (m.key.startsWith('ai.')) {
          ai.changed();
          void this.loadModels();
        }
        break;
      case 'setKey': {
        const key = await vscode.window.showInputBox({ title: `${BACKEND_LABELS[m.backend]} API key`, password: true, ignoreFocusOut: true, prompt: 'Stored in VS Code Secret Storage, never in your settings files.' });
        if (key) {
          await ai.setKey(m.backend, key);
          void this.loadModels();
        }
        break;
      }
      case 'clearKey':
        await ai.setKey(m.backend, undefined);
        break;
      case 'selectModel':
        await ai.selectModel(m.model);
        break;
      case 'refreshModels':
        await this.loadModels();
        break;
      case 'testAi':
        await this.testAi();
        break;
      case 'command':
        await vscode.commands.executeCommand(m.command, m.args);
        break;
      case 'openLink':
        if (!Object.hasOwn(HELP_LINKS, m.link)) throw new Error(`Unknown link ${m.link}`);
        await vscode.env.openExternal(vscode.Uri.parse(HELP_LINKS[m.link]));
        break;
    }
  }

  private async loadModels(): Promise<void> {
    this.models = await this.services.ai.listAllModels().catch(() => []);
    await this.pushState();
  }

  private async testAi(): Promise<void> {
    const started = Date.now();
    const cts = new vscode.CancellationTokenSource();
    const timer = setTimeout(() => cts.cancel(), 60_000);
    try {
      const label = await this.services.ai.label();
      const text = await this.services.ai.complete({ system: 'You are a connectivity check.', messages: [{ role: 'user', content: 'Reply with exactly: Slashi is connected.' }], maxTokens: 200 }, cts.token);
      void this.panel?.webview.postMessage({ type: 'test', ok: true, text: text.trim(), ms: Date.now() - started, label });
    } catch (err) {
      void this.panel?.webview.postMessage({ type: 'test', ok: false, text: err instanceof Error ? err.message : String(err), ms: Date.now() - started });
    } finally {
      clearTimeout(timer);
    }
  }

  private async pushState(tab?: string): Promise<void> {
    if (!this.panel) return;
    const { services } = this;
    const providers = services.registry
      .all()
      .filter((p) => p.id !== 'system')
      .map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        icon: p.icon,
        prefix: p.prefix,
        enabled: isProviderEnabled(p.id),
        features: p.features.length > 1 ? p.features.map((f) => ({ ...f, enabled: isFeatureEnabled(p.id, f.id) })) : [],
      }));
    const custom = (await services.registry.localItems()).filter((i) => i.providerId === 'custom' && !['custom:new', 'custom:edit', 'custom:team', 'custom:export'].includes(i.id));
    const keys = Object.fromEntries(await Promise.all(services.ai.keyBackends().map(async (b) => [b, await services.ai.hasKey(b)])));
    const ext = vscode.extensions.getExtension('meness.slashi');
    void this.panel.webview.postMessage({
      type: 'state',
      tab,
      state: {
        version: ext?.packageJSON?.version ?? 'dev',
        platform: process.platform,
        popupStyle: get('popup.style', 'spotlight'),
        useSlashKey: get('shortcut.useSlashKey', true),
        statusBar: get('statusBar.enabled', true),
        inlineTrigger: get('inlineTrigger.enabled', true),
        history: get('history.enabled', true),
        providers,
        ai: {
          provider: get('ai.provider', 'auto'),
          model: get('ai.model', ''),
          baseUrl: get('ai.baseUrl', ''),
          effort: get('ai.anthropicEffort', 'medium'),
          confirm: get('ai.confirmBeforeRun', true),
          customInstructions: get('ai.customInstructions', ''),
          label: await services.ai.label(),
          keys,
          models: this.models,
        },
        commands: custom.map((c) => ({ name: c.name, title: c.title, description: c.description, icon: c.icon, category: c.category })),
        packs: services.packs.list().map((p) => ({ id: p.id, name: p.name, version: p.version, commands: p.commands.length })),
        stack: services.stack,
      },
    });
  }

  dispose(): void {
    this.subs.forEach((s) => s.dispose());
    this.panel?.dispose();
  }
}
