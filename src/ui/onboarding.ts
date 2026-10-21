import * as vscode from 'vscode';
import { get, isProviderEnabled, setProviderEnabled, shortcutLabel, updateGlobal } from '../config';
import type { ProviderId } from '../core/protocol';
import { BACKEND_LABELS, type BackendId, type ModelInfo } from '../llm/types';
import type { Services } from '../services/services';
import { panelIcon, webviewHtml, webviewOptions } from './html';

const DONE_KEY = 'slashi.onboarded';

type FromOnboarding =
  | { type: 'ready' }
  | { type: 'step'; step: string }
  | { type: 'toggleProvider'; id: ProviderId; enabled: boolean }
  | { type: 'useSlashKey'; value: boolean }
  | { type: 'useModel'; model: ModelInfo | 'auto' }
  | { type: 'setKey'; backend: BackendId }
  | { type: 'command'; command: string; args?: unknown }
  | { type: 'finish'; open?: string };

/** First-run welcome: shortcut, providers, AI, your stack, and a cheat sheet. */
export class Onboarding implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private step = '';

  constructor(
    private readonly services: Services,
    private readonly extensionUri: vscode.Uri,
  ) {}

  static shouldShow(context: vscode.ExtensionContext): boolean {
    return !context.globalState.get<boolean>(DONE_KEY, false);
  }

  /** While the shortcut step is showing, pressing the shortcut celebrates instead of opening Slashi. */
  interceptShortcut(): boolean {
    if (!this.panel?.active || this.step !== 'shortcut') return false;
    void this.panel.webview.postMessage({ type: 'shortcutPressed' });
    return true;
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel('slashi.welcome', 'Welcome to Slashi', vscode.ViewColumn.Active, {
      ...webviewOptions(this.extensionUri),
      retainContextWhenHidden: true,
    });
    this.panel = panel;
    panel.iconPath = panelIcon(this.extensionUri);
    panel.webview.html = webviewHtml(panel.webview, this.extensionUri, {
      title: 'Welcome to Slashi',
      script: 'onboarding.js',
      styles: ['onboarding.css'],
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
      void this.services.context.globalState.update(DONE_KEY, true);
    });
    panel.webview.onDidReceiveMessage(async (m: FromOnboarding) => {
      try {
        await this.handle(m);
      } catch (err) {
        void vscode.window.showErrorMessage(`Slashi: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  private async handle(m: FromOnboarding): Promise<void> {
    const { services } = this;
    switch (m.type) {
      case 'ready':
        await this.pushState();
        break;
      case 'step':
        this.step = m.step;
        break;
      case 'toggleProvider':
        if (!this.services.registry.get(m.id)) throw new Error(`Unknown provider ${m.id}`);
        await setProviderEnabled(m.id, m.enabled);
        await this.pushState();
        break;
      case 'useSlashKey':
        await updateGlobal('shortcut.useSlashKey', m.value);
        await this.pushState();
        break;
      case 'useModel':
        if (m.model === 'auto') {
          await updateGlobal('ai.provider', 'auto');
          await updateGlobal('ai.model', '');
          services.ai.changed();
        } else {
          await services.ai.selectModel(m.model);
        }
        await this.pushState();
        break;
      case 'setKey': {
        const key = await vscode.window.showInputBox({
          title: `${BACKEND_LABELS[m.backend]} API key`,
          password: true,
          ignoreFocusOut: true,
          prompt: 'Stored in VS Code Secret Storage, never in your settings files.',
        });
        if (key) {
          await services.ai.setKey(m.backend, key);
          await updateGlobal('ai.provider', m.backend);
          await updateGlobal('ai.model', '');
        }
        await this.pushState();
        break;
      }
      case 'command':
        await vscode.commands.executeCommand(m.command, m.args);
        break;
      case 'finish':
        await services.context.globalState.update(DONE_KEY, true);
        this.panel?.dispose();
        if (m.open !== undefined) await services.openPopup(m.open);
        break;
    }
  }

  private async pushState(): Promise<void> {
    if (!this.panel) return;
    const { services } = this;
    const [models, label, hasAnthropic, hasOpenAi, local] = await Promise.all([
      services.ai.listAllModels().catch(() => [] as ModelInfo[]),
      services.ai.label(),
      services.ai.hasKey('anthropic'),
      services.ai.hasKey('openai'),
      services.registry.localItems(),
    ]);
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
      }));
    const scripts = local.filter((i) => i.providerId === 'project' && i.feature === 'scripts').slice(0, 4);
    void this.panel.webview.postMessage({
      type: 'state',
      state: {
        platform: process.platform,
        shortcut: shortcutLabel(),
        useSlashKey: get('shortcut.useSlashKey', true),
        providers,
        ai: {
          label,
          provider: get('ai.provider', 'auto'),
          model: get('ai.model', ''),
          keys: { anthropic: hasAnthropic, openai: hasOpenAi },
          vscode: models.filter((m) => m.backend === 'vscode'),
          ollama: models.filter((m) => m.backend === 'ollama'),
          cli: models.filter((m) => m.backend === 'claudeCode' || m.backend === 'codex'),
          other: models.filter((m) => m.backend !== 'vscode' && m.backend !== 'ollama'),
        },
        stack: services.stack,
        examples: scripts.map((s) => ({ name: s.name, title: s.title, description: s.description })),
      },
    });
  }

  dispose(): void {
    this.panel?.dispose();
  }
}
