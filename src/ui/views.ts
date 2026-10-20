import * as vscode from 'vscode';
import { isProviderEnabled, shortcutLabel, get } from '../config';
import type { ItemView, SpotlightInit } from '../core/protocol';
import { COMMON_ACTIONS } from '../executor';
import { toView } from '../registry';
import type { Services } from '../services/services';

/** Everything the Spotlight webview needs to rank locally. */
export async function buildSpotlightInit(services: Services, initialQuery: string): Promise<SpotlightInit> {
  const [items, scopes, aiLabel] = await Promise.all([
    services.registry.localItems(),
    services.registry.scopesWithRemote(),
    services.ai.label(),
  ]);
  const views: ItemView[] = items.map(toView);
  for (const scope of scopes) {
    views.push({
      id: `scope:${scope.prefix}`,
      name: scope.prefix,
      title: scope.title,
      description: scope.placeholder,
      icon: scope.icon,
      providerId: scope.providerId,
      feature: scope.feature,
      category: 'Search in…',
      kind: 'scope',
      scopePrefix: scope.prefix,
      boost: 2,
    });
  }
  const snapshot = services.snapshot;
  return {
    items: views,
    scopes,
    frecency: services.history.map,
    initialQuery,
    maxResults: get('popup.maxResults', 60),
    showDescriptions: get('popup.showDescriptions', true),
    aiEnabled: isProviderEnabled('ai'),
    nlEnabled: isProviderEnabled('naturalLanguage'),
    aiLabel,
    shortcut: shortcutLabel(),
    commonActions: COMMON_ACTIONS,
    context: {
      hasSelection: !!snapshot?.selections.some((s) => !s.isEmpty),
      fileName: snapshot && !snapshot.document.isUntitled ? vscode.workspace.asRelativePath(snapshot.document.uri) : undefined,
    },
    now: Date.now(),
  };
}
