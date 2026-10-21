import * as vscode from 'vscode';
import { enabledFeatures, hiddenMatcher, isFeatureEnabled, isProviderEnabled } from './config';
import type { FrecencyMap, ItemView, ProviderId, RankedView, ScopeView } from './core/protocol';
import type { ParsedQuery } from './core/query';
import { indexItems, rank, type IndexedItem } from './core/search';
import type { SlashItem, SlashProvider } from './types';

interface CacheEntry {
  items: SlashItem[];
  remote: SlashItem[];
  remoteIndex: IndexedItem[];
}

/** Holds providers, caches their catalogues and answers searches. */
export class Registry implements vscode.Disposable {
  private readonly providers = new Map<ProviderId, SlashProvider>();
  private readonly cache = new Map<ProviderId, CacheEntry>();
  private readonly pending = new Map<ProviderId, Promise<CacheEntry>>();
  private readonly byId = new Map<string, SlashItem>();
  /** Ids each provider has put in `byId`, so items that disappear are dropped on the next load. */
  private readonly idsByProvider = new Map<ProviderId, Set<string>>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(
    private readonly log: vscode.LogOutputChannel,
    /** Language of the current editor, for items limited to some languages. */
    private readonly language: () => string | undefined = () => undefined,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration('slashi.providers') ||
          e.affectsConfiguration('slashi.disabledFeatures') ||
          e.affectsConfiguration('slashi.hiddenCommands')
        ) {
          this.onDidChangeEmitter.fire();
        }
      }),
    );
  }

  register(provider: SlashProvider): vscode.Disposable {
    this.providers.set(provider.id, provider);
    if (provider.onDidChange) this.disposables.push(provider.onDidChange(() => this.invalidate(provider.id)));
    return new vscode.Disposable(() => {
      this.providers.delete(provider.id);
      this.invalidate(provider.id);
      provider.dispose?.();
    });
  }

  all(): SlashProvider[] {
    return Array.from(this.providers.values());
  }

  get(id: ProviderId): SlashProvider | undefined {
    return this.providers.get(id);
  }

  enabled(): SlashProvider[] {
    return this.all().filter((p) => isProviderEnabled(p.id));
  }

  invalidate(id?: ProviderId): void {
    if (id) {
      this.cache.delete(id);
      this.pending.delete(id);
    } else {
      this.cache.clear();
      this.pending.clear();
    }
    this.onDidChangeEmitter.fire();
  }

  /** Rebuilds volatile providers (tabs, symbols…) — call right before showing the popup. */
  refreshVolatile(): void {
    for (const p of this.providers.values())
      if (p.volatile) {
        this.cache.delete(p.id);
        this.pending.delete(p.id);
      }
  }

  private load(provider: SlashProvider): Promise<CacheEntry> {
    const cached = this.cache.get(provider.id);
    if (cached) return Promise.resolve(cached);
    let pending = this.pending.get(provider.id);
    if (!pending) {
      pending = (async () => {
        const started = Date.now();
        let items: SlashItem[] = [];
        try {
          items = await provider.items();
        } catch (err) {
          this.log.error(`Provider ${provider.id} failed`, err);
        }
        const ids = this.idsByProvider.get(provider.id) ?? new Set<string>();
        this.idsByProvider.set(provider.id, ids);
        const current = this.pending.get(provider.id) === pending;
        // Only the newest load prunes, so a superseded load that finishes late can't drop the newer items.
        const fresh = current ? new Set(items.map((i) => i.id)) : undefined;
        if (fresh) {
          for (const id of ids)
            if (!fresh.has(id)) {
              this.byId.delete(id);
              ids.delete(id);
            }
        }
        for (const item of items) {
          item.providerId = provider.id;
          item.feature ??= 'default';
          this.byId.set(item.id, item);
          ids.add(item.id);
        }
        const remote = items.filter((i) => i.remote);
        const entry: CacheEntry = { items: items.filter((i) => !i.remote), remote, remoteIndex: indexItems(remote) };
        if (current) {
          this.cache.set(provider.id, entry);
          this.pending.delete(provider.id);
        }
        this.log.debug(`Provider ${provider.id}: ${items.length} items in ${Date.now() - started} ms`);
        return entry;
      })();
      this.pending.set(provider.id, pending);
    }
    return pending;
  }

  private visible(provider: SlashProvider): (item: SlashItem) => boolean {
    const hidden = hiddenMatcher();
    const enabled = enabledFeatures();
    const language = this.language();
    return (item) =>
      enabled(provider.id, item.feature) && !hidden(item.id) && (!item.languages || !language || item.languages.includes(language));
  }

  /** Local (non-remote) items of every enabled provider. */
  async localItems(): Promise<SlashItem[]> {
    const providers = this.enabled();
    const entries = await Promise.all(providers.map((p) => this.load(p)));
    return entries.flatMap((e, i) => e.items.filter(this.visible(providers[i])));
  }

  /** Every enabled item including remote ones (for the AI catalog and native mode). */
  async allItems(): Promise<SlashItem[]> {
    const providers = this.enabled();
    const entries = await Promise.all(providers.map((p) => this.load(p)));
    return entries.flatMap((e, i) => [...e.items, ...e.remote].filter(this.visible(providers[i])));
  }

  /** Ranks remote items (e.g. files) for a query, honouring a scope. */
  async searchRemote(query: ParsedQuery, limit: number, frecency: FrecencyMap): Promise<RankedView[]> {
    const scope = query.scope ? this.scopes().find((s) => s.prefix === query.scope) : undefined;
    const providers = this.enabled().filter((p) => (scope ? p.id === scope.providerId : !p.scopedOnly));
    const results: RankedView[] = [];
    for (const provider of providers) {
      const entry = await this.load(provider);
      if (!entry.remote.length) continue;
      const visible = this.visible(provider);
      const index = entry.remoteIndex.filter((e) => visible(e.item as SlashItem) && (!scope?.feature || e.item.feature === scope.feature));
      results.push(...rank(index, query, { limit, frecency }));
    }
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(toRankedView);
  }

  find(id: string): SlashItem | undefined {
    return this.byId.get(id);
  }

  scopes(): ScopeView[] {
    const out: ScopeView[] = [];
    for (const p of this.enabled()) {
      out.push({ prefix: p.prefix, providerId: p.id, title: p.title, icon: p.icon, remote: false, placeholder: p.placeholder });
      for (const s of p.scopes ?? []) {
        if (isFeatureEnabled(p.id, s.feature)) out.push({ ...s, providerId: p.id, remote: false });
      }
    }
    return out;
  }

  /** Marks scopes whose provider has remote items so the webview asks the host while typing. */
  async scopesWithRemote(): Promise<ScopeView[]> {
    const scopes = this.scopes();
    for (const scope of scopes) {
      const provider = this.providers.get(scope.providerId)!;
      const entry = await this.load(provider);
      scope.remote = entry.remote.some((i) => !scope.feature || i.feature === scope.feature);
    }
    return scopes;
  }

  async warm(): Promise<void> {
    await Promise.all(this.enabled().map((p) => this.load(p)));
  }

  dispose(): void {
    for (const p of this.providers.values()) p.dispose?.();
    this.disposables.forEach((d) => d.dispose());
    this.onDidChangeEmitter.dispose();
  }
}

/** Strips functions so items can be posted to a webview. */
export function toView(item: SlashItem): ItemView {
  const { id, name, title, description, badge, icon, providerId, feature, category, keywords, args, actions, boost, kind, scopePrefix } =
    item;
  return { id, name, title, description, badge, icon, providerId, feature, category, keywords, args, actions, boost, kind, scopePrefix };
}

function toRankedView(r: RankedView): RankedView {
  const { score, highlights, argText } = r;
  return { ...toView(r as unknown as SlashItem), score, highlights, argText };
}
