import * as path from 'node:path';
import * as vscode from 'vscode';
import { isFeatureEnabled } from '../config';
import type { Services } from '../services/services';
import type { SlashItem, SlashProvider } from '../types';
import { ensureArgs, itemFactory, openAny, truncate } from './util';

const make = itemFactory('navigation', 'Navigate');

const SYMBOL_ICONS: Partial<Record<vscode.SymbolKind, string>> = {
  [vscode.SymbolKind.Class]: 'cube',
  [vscode.SymbolKind.Interface]: 'shapes',
  [vscode.SymbolKind.Function]: 'function',
  [vscode.SymbolKind.Method]: 'function',
  [vscode.SymbolKind.Constructor]: 'function',
  [vscode.SymbolKind.Variable]: 'cursor-text',
  [vscode.SymbolKind.Constant]: 'lock-key',
  [vscode.SymbolKind.Property]: 'tag',
  [vscode.SymbolKind.Field]: 'tag',
  [vscode.SymbolKind.Enum]: 'list-numbers',
  [vscode.SymbolKind.EnumMember]: 'list-numbers',
  [vscode.SymbolKind.Module]: 'package',
  [vscode.SymbolKind.Namespace]: 'package',
  [vscode.SymbolKind.String]: 'text-aa',
  [vscode.SymbolKind.Key]: 'key',
  [vscode.SymbolKind.Struct]: 'cube',
  [vscode.SymbolKind.TypeParameter]: 'brackets-angle',
};

/** Open tabs, symbols in the current file, problems and go-to-line. Rebuilt every time Slashi opens. */
export class NavigationProvider implements SlashProvider {
  readonly id = 'navigation' as const;
  readonly title = 'Navigate';
  readonly description = 'Jump to open tabs, symbols in the current file, problems or a line.';
  readonly icon = 'compass';
  readonly prefix = 'go';
  readonly placeholder = 'Jump to a tab, symbol, problem or line…';
  readonly volatile = true;
  readonly features = [
    { id: 'tabs', title: 'Open tabs', description: 'Switch between open editors.' },
    { id: 'symbols', title: 'Symbols in file', description: 'Functions, classes and variables of the current file.' },
    { id: 'problems', title: 'Problems', description: 'Errors and warnings across the workspace.' },
    { id: 'goToLine', title: 'Go to line', description: '/line 42 or /line 42:7.' },
  ];
  readonly scopes = [
    { prefix: 'tab', title: 'Open Tabs', icon: 'browsers', placeholder: 'Switch to an open editor…', feature: 'tabs' },
    { prefix: '@', title: 'Symbols in File', icon: 'tree-structure', placeholder: 'Go to a symbol in this file…', feature: 'symbols' },
    { prefix: 'err', title: 'Problems', icon: 'warning-circle', placeholder: 'Jump to an error or warning…', feature: 'problems' },
  ];

  constructor(private readonly services: Services) {}

  async items(): Promise<SlashItem[]> {
    const items: SlashItem[] = [];
    if (isFeatureEnabled('navigation', 'goToLine')) items.push(this.goToLine());
    if (isFeatureEnabled('navigation', 'tabs')) items.push(...this.tabs());
    if (isFeatureEnabled('navigation', 'problems')) items.push(...this.problems());
    if (isFeatureEnabled('navigation', 'symbols')) items.push(...(await this.symbols()));
    return items;
  }

  private goToLine(): SlashItem {
    return make({
      id: 'nav:line',
      name: 'line',
      title: 'Go to Line',
      description: 'Jump to a line (and column) in the current file',
      icon: 'text-align-left',
      feature: 'goToLine',
      args: { placeholder: '42 or 42:7' },
      boost: 4,
      needsEditor: true,
      keywords: ['goto line number'],
      run: async (ctx) => {
        const input = await ensureArgs(ctx.args, 'Line number (line:column)');
        const match = input && /^(\d+)(?::(\d+))?$/.exec(input.trim());
        if (!match) return;
        const editor = (await ctx.editor())!;
        const line = Math.min(Math.max(Number(match[1]) - 1, 0), editor.document.lineCount - 1);
        const column = match[2] ? Math.max(Number(match[2]) - 1, 0) : editor.document.lineAt(line).firstNonWhitespaceCharacterIndex;
        reveal(editor, new vscode.Range(line, column, line, column));
      },
    });
  }

  private tabs(): SlashItem[] {
    const items: SlashItem[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        const uri =
          input instanceof vscode.TabInputText ? input.uri : input instanceof vscode.TabInputTextDiff ? input.modified : undefined;
        const rel = uri ? vscode.workspace.asRelativePath(uri) : '';
        items.push(
          make({
            id: `tab:${group.viewColumn}:${uri?.toString() ?? tab.label}`,
            title: tab.label,
            description: `${rel && path.posix.dirname(rel) !== '.' ? path.posix.dirname(rel) : ''}${vscode.window.tabGroups.all.length > 1 ? ` · group ${group.viewColumn}` : ''}${tab.isDirty ? ' · unsaved' : ''}`,
            badge: tab.isActive && group.isActive ? 'active' : tab.isPinned ? 'pinned' : undefined,
            icon: tab.isDirty ? 'circle-half' : 'browser',
            category: 'Open Tabs',
            feature: 'tabs',
            keywords: rel ? [rel] : undefined,
            actions: [
              { id: 'close', title: 'Close tab', icon: 'x' },
              { id: 'pin', title: tab.isPinned ? 'Unpin tab' : 'Pin tab', icon: 'push-pin' },
            ],
            run: async (ctx) => {
              if (ctx.action === 'close') {
                await vscode.window.tabGroups.close(tab);
              } else if (uri) {
                await openAny(uri, group.viewColumn);
                if (ctx.action === 'pin')
                  await vscode.commands.executeCommand(tab.isPinned ? 'workbench.action.unpinEditor' : 'workbench.action.pinEditor');
              } else {
                // Non-text tabs (settings, webviews…) can only be focused by index.
                const index = group.tabs.indexOf(tab);
                await vscode.commands.executeCommand(`workbench.action.focus${ordinal(group.viewColumn)}EditorGroup`);
                await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', index);
              }
            },
          }),
        );
      }
    }
    return items;
  }

  private problems(): SlashItem[] {
    const items: SlashItem[] = [];
    for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
      for (const d of diagnostics) {
        if (d.severity > vscode.DiagnosticSeverity.Warning) continue;
        const rel = vscode.workspace.asRelativePath(uri);
        items.push(
          make({
            id: `problem:${uri.toString()}:${d.range.start.line}:${d.range.start.character}:${d.message.slice(0, 40)}`,
            title: truncate(d.message, 110),
            description: `${rel}:${d.range.start.line + 1}${d.source ? ` · ${d.source}` : ''}`,
            icon: d.severity === vscode.DiagnosticSeverity.Error ? 'x-circle' : 'warning',
            category: d.severity === vscode.DiagnosticSeverity.Error ? 'Errors' : 'Warnings',
            feature: 'problems',
            boost: d.severity === vscode.DiagnosticSeverity.Error ? 2 : 0,
            keywords: [rel, 'problem'],
            actions: [{ id: 'fix', title: 'Show quick fixes', icon: 'lightbulb' }],
            run: async (ctx) => {
              const editor = await vscode.window.showTextDocument(uri, { preview: false });
              reveal(editor, d.range);
              if (ctx.action === 'fix') await vscode.commands.executeCommand('editor.action.quickFix');
            },
          }),
        );
        if (items.length >= 400) return items;
      }
    }
    return items;
  }

  private async symbols(): Promise<SlashItem[]> {
    const doc = this.services.snapshot?.document ?? vscode.window.activeTextEditor?.document;
    if (!doc) return [];
    const result = await Promise.race([
      Promise.resolve(
        vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
          'vscode.executeDocumentSymbolProvider',
          doc.uri,
        ),
      ).catch(() => undefined),
      new Promise<undefined>((r) => {
        setTimeout(() => r(undefined), 600);
      }),
    ]);
    if (!result?.length) return [];
    const items: SlashItem[] = [];
    const visit = (symbol: vscode.DocumentSymbol | vscode.SymbolInformation, container: string) => {
      const range = 'selectionRange' in symbol ? symbol.selectionRange : symbol.location.range;
      items.push(
        make({
          id: `symbol:${doc.uri.toString()}:${range.start.line}:${range.start.character}:${symbol.name}`,
          title: symbol.name,
          description: [container, `line ${range.start.line + 1}`].filter(Boolean).join(' · '),
          icon: SYMBOL_ICONS[symbol.kind] ?? 'hash',
          category: `Symbols · ${path.basename(doc.fileName)}`,
          feature: 'symbols',
          needsEditor: true,
          run: async (ctx) => {
            const editor = await ctx.editor();
            if (editor) reveal(editor, range);
          },
        }),
      );
      if ('children' in symbol) for (const child of symbol.children) visit(child, container ? `${container}.${symbol.name}` : symbol.name);
    };
    for (const s of result) visit(s, 'containerName' in s ? s.containerName : '');
    return items.slice(0, 1500);
  }
}

function reveal(editor: vscode.TextEditor, range: vscode.Range): void {
  editor.selection = new vscode.Selection(range.start, range.start);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function ordinal(column: number): string {
  return ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'][column - 1] ?? 'First';
}
