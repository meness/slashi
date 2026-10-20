import * as vscode from 'vscode';
import type { HostToSpotlight, SpotlightToHost } from '../core/protocol';
import { parseQuery } from '../core/query';
import { execute, reportError } from '../executor';
import { doWithAi } from '../providers/naturalLanguage';
import { snapshotEditor } from '../services/editor';
import type { Services } from '../services/services';
import { panelIcon, webviewHtml, webviewOptions } from './html';
import { buildSpotlightInit } from './views';

/** The Spotlight popup: a focused webview over the active editor group that closes as soon as it loses focus. */
export class Spotlight implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;

  constructor(
    private readonly services: Services,
    private readonly extensionUri: vscode.Uri,
  ) {}

  get isOpen(): boolean {
    return !!this.panel;
  }

  close(): void {
    this.panel?.dispose();
  }

  async open(initialQuery = ''): Promise<void> {
    if (this.panel) {
      // Pressing the shortcut again toggles the popup; with a query it re-targets it.
      if (!initialQuery) return this.close();
      void this.post({ type: 'setQuery', query: initialQuery });
      this.panel.reveal(undefined, false);
      return;
    }

    const { services } = this;
    services.snapshot = snapshotEditor();
    services.registry.refreshVolatile();
    const init = buildSpotlightInit(services, initialQuery);

    const panel = vscode.window.createWebviewPanel('slashi.spotlight', 'Slashi', { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, webviewOptions(this.extensionUri));
    this.panel = panel;
    panel.iconPath = panelIcon(this.extensionUri);
    panel.webview.html = webviewHtml(panel.webview, this.extensionUri, { title: 'Slashi', script: 'spotlight.js', styles: ['spotlight.css'] });
    void vscode.commands.executeCommand('setContext', 'slashi.spotlightOpen', true);

    let closingForRun = false;
    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = undefined;
      void vscode.commands.executeCommand('setContext', 'slashi.spotlightOpen', false);
    });
    // Behave like a popup: clicking anywhere else closes it.
    panel.onDidChangeViewState((e) => {
      if (!e.webviewPanel.active && !closingForRun) panel.dispose();
    });

    panel.webview.onDidReceiveMessage(async (message: SpotlightToHost) => {
      switch (message.type) {
        case 'ready':
          void this.post({ type: 'init', data: await init });
          break;
        case 'close':
          panel.dispose();
          break;
        case 'query': {
          const data = await init;
          const query = parseQuery(message.query, data.scopes.map((s) => s.prefix));
          const items = await services.registry.searchRemote(query, data.maxResults, data.frecency);
          void this.post({ type: 'live', seq: message.seq, items });
          break;
        }
        case 'run': {
          const item = services.registry.find(message.id);
          closingForRun = true;
          panel.dispose();
          if (item) await execute(services, item, message.args ?? '', message.action, services.snapshot);
          break;
        }
        case 'ai': {
          closingForRun = true;
          panel.dispose();
          const snapshot = services.snapshot;
          try {
            await doWithAi(services, message.text, snapshot);
          } catch (err) {
            await reportError(services, err, 'Do with AI');
          }
          break;
        }
      }
    });
  }

  private post(message: HostToSpotlight): Thenable<boolean> | undefined {
    return this.panel?.webview.postMessage(message);
  }

  dispose(): void {
    this.close();
  }
}
