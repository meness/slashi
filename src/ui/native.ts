import * as vscode from 'vscode';
import { get, isProviderEnabled } from '../config';
import { toCodicon } from '../core/icons';
import type { RankedView } from '../core/protocol';
import { parseQuery } from '../core/query';
import { indexItems, mergeRanked, rank } from '../core/search';
import { COMMON_ACTIONS, execute, reportError } from '../executor';
import { doWithAi } from '../providers/naturalLanguage';
import { snapshotEditor } from '../services/editor';
import type { Services } from '../services/services';
import type { SlashItem } from '../types';

interface Pick extends vscode.QuickPickItem {
  id?: string;
  argText?: string;
  scope?: string;
  ai?: 'do' | 'ask';
}

const MORE = new vscode.ThemeIcon('ellipsis');

/** Slashi in VS Code's native Quick Pick — the fastest and most accessible popup. */
export async function openNative(services: Services, initialQuery = ''): Promise<void> {
  services.snapshot = snapshotEditor();
  services.registry.refreshVolatile();
  const snapshot = services.snapshot;
  const items = await services.registry.localItems();
  const scopes = services.registry.scopes();
  const prefixes = scopes.map((s) => s.prefix);
  const scopeItems: SlashItem[] = scopes.map((s) => ({
    id: `scope:${s.prefix}`, name: s.prefix, title: s.title, description: s.placeholder, icon: s.icon, providerId: s.providerId,
    category: 'Search in…', kind: 'scope', scopePrefix: s.prefix, feature: s.feature ?? 'default', boost: 2, run: () => undefined,
  }));
  const all = [...items, ...scopeItems];
  const index = indexItems(all);
  const byScope = new Map<string, ReturnType<typeof indexItems>>();
  const limit = get('popup.maxResults', 60);

  const qp = vscode.window.createQuickPick<Pick>();
  qp.placeholder = 'Type / to search commands, files, settings, git, AI…  (Tab completes)';
  qp.matchOnDescription = true;
  qp.value = initialQuery || '/';
  let seq = 0;

  const toPick = (r: RankedView): Pick => ({
    label: `$(${toCodicon(r.icon)}) ${r.title}`,
    description: [r.name ? `/${r.name}${r.args ? ` ‹${r.args.placeholder}›` : ''}` : '', r.badge ? `· ${r.badge}` : ''].filter(Boolean).join(' '),
    detail: get('popup.showDescriptions', true) ? r.description : undefined,
    alwaysShow: true,
    id: r.id,
    argText: r.argText,
    scope: r.kind === 'scope' ? r.scopePrefix : undefined,
    buttons: r.actions?.length ? [{ iconPath: MORE, tooltip: 'More actions' }] : undefined,
  });

  const update = async () => {
    const mySeq = ++seq;
    const query = parseQuery(qp.value, prefixes);
    const scope = query.scope ? scopes.find((s) => s.prefix === query.scope) : undefined;
    let source = index;
    if (scope) {
      source = byScope.get(scope.prefix) ?? indexItems(all.filter((i) => i.providerId === scope.providerId && i.kind !== 'scope' && (!scope.feature || i.feature === scope.feature)));
      byScope.set(scope.prefix, source);
    }
    const local = rank(source, query, { limit, frecency: services.history.map });
    qp.busy = true;
    const remote = query.words.length || scope ? await services.registry.searchRemote(query, limit, services.history.map) : [];
    if (mySeq !== seq) return;
    qp.busy = false;
    const ranked = mergeRanked([local, remote], limit);
    const picks = ranked.map(toPick);
    if (query.term.length > 2 && isProviderEnabled('ai')) {
      const ai: Pick[] = [];
      if (isProviderEnabled('naturalLanguage')) ai.push({ label: `$(sparkle) Do with AI: “${query.term}”`, alwaysShow: true, ai: 'do' });
      ai.push({ label: `$(comment-discussion) Ask AI: “${query.term}”`, alwaysShow: true, ai: 'ask' });
      if (!ranked.length || ranked[0].score < 60) picks.unshift(...ai);
      else picks.push(...ai);
    }
    qp.items = picks;
  };

  const run = async (pick: Pick, action?: string) => {
    const query = parseQuery(qp.value, prefixes);
    if (pick.scope) {
      qp.value = `/${pick.scope} `;
      return;
    }
    qp.hide();
    try {
      if (pick.ai === 'do') return await doWithAi(services, query.term, snapshot);
      const item = services.registry.find(pick.ai === 'ask' ? 'ai:ask' : pick.id!);
      if (item) await execute(services, item, pick.ai === 'ask' ? query.term : pick.argText ?? '', action, snapshot);
    } catch (err) {
      await reportError(services, err, pick.label);
    }
  };

  qp.onDidChangeValue(() => void update());
  qp.onDidAccept(() => {
    const pick = qp.selectedItems[0] ?? qp.activeItems[0];
    if (pick) void run(pick);
  });
  qp.onDidTriggerItemButton(async (e) => {
    const item = e.item.id ? services.registry.find(e.item.id) : undefined;
    if (!item) return;
    const actions = [...(item.actions ?? []), ...COMMON_ACTIONS];
    qp.hide();
    const chosen = await vscode.window.showQuickPick(
      actions.map((a) => ({ label: `$(${toCodicon(a.icon)}) ${a.title}`, id: a.id })),
      { title: item.title, placeHolder: 'Choose an action' },
    );
    if (chosen) await execute(services, item, '', chosen.id, snapshot);
  });
  qp.onDidHide(() => qp.dispose());
  qp.show();
  await update();
}
