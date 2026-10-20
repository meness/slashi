import * as vscode from 'vscode';
import { get } from '../config';
import { frecencyBonus } from '../core/search';
import type { Services } from '../services/services';

/** Notion-style `/` at the start of a line suggests slash commands right in the editor. */
export class InlineSlashCompletions implements vscode.CompletionItemProvider {
  constructor(private readonly services: Services) {}

  async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
    if (!get('inlineTrigger.enabled', true)) return undefined;
    const languages = get<string[]>('inlineTrigger.languages', ['markdown', 'plaintext', 'scminput']);
    if (!languages.includes('*') && !languages.includes(document.languageId)) return undefined;
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    const match = /^(\s*)\/([\w-]*)$/.exec(prefix);
    if (!match) return undefined;

    const range = new vscode.Range(position.line, match[1].length, position.line, position.character);
    const now = Date.now();
    const history = this.services.history.map;
    const items = (await this.services.registry.localItems())
      .filter((i) => i.name)
      .sort((a, b) => frecencyBonus(history[b.id], now) + (b.boost ?? 0) - (frecencyBonus(history[a.id], now) + (a.boost ?? 0)));

    const open = new vscode.CompletionItem({ label: '/', description: 'Open Slashi…' }, vscode.CompletionItemKind.Event);
    open.range = range;
    open.insertText = '';
    open.filterText = '/';
    open.sortText = '0';
    open.command = { command: 'slashi.open', title: 'Open Slashi' };

    return [
      open,
      ...items.slice(0, 400).map((item, i) => {
        const completion = new vscode.CompletionItem(
          { label: `/${item.name}`, description: item.title },
          vscode.CompletionItemKind.Function,
        );
        completion.range = range;
        completion.filterText = `/${item.name} ${item.title}`;
        completion.sortText = String(i + 1).padStart(4, '0');
        completion.detail = item.category;
        completion.documentation = item.description;
        completion.insertText = '';
        completion.command = { command: 'slashi.inlineRun', title: item.title, arguments: [item.id] };
        return completion;
      }),
    ];
  }
}
