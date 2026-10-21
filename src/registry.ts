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
  private readonly warned = new Set<string>();
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
          e.affectsConfiguration('slashi.disabledProviders') ||
          e.affectsConfiguration('slashi.disabledFeatures') ||
          e.affectsConfiguration('slashi.hiddenCommands')
        ) {
          this.onDidChangeEmitter.fire();
        }
      }),
    );
  }

  register(provider: SlashProvider): vscode.Disposable {
    if (this.providers.has(provider.id)) throw new Error(`A Slashi provider with the id ${provider.id} is already registered.`);
    this.providers.set(provider.id, provider);
    const sub = provider.onDidChange?.(() => this.invalidate(provider.id));
    let disposed = false;
    return new vscode.Disposable(() => {
      // Extensions dispose it themselves and again through context.subscriptions; the second call must not remove a re-registered provider.
      if (disposed) return;
      disposed = true;
      sub?.dispose();
      this.providers.delete(provider.id);
      this.forget(provider.id);
      provider.dispose?.();
    });
  }

  /** Scope prefixes in use by any registered provider, enabled or not. */
  takenPrefixes(): Set<string> {
    return new Set(this.all().flatMap((p) => [p.prefix, ...(p.scopes ?? []).map((s) => s.prefix)]));
  }

  /** Drops a removed provider's cache and items. */
  private forget(id: ProviderId): void {
    for (const itemId of this.idsByProvider.get(id) ?? []) this.byId.delete(itemId);
    this.idsByProvider.delete(id);
    this.invalidate(id);
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
        // Removed while loading: its items must not become runnable again.
        if (this.providers.get(provider.id) !== provider) return { items: [], remote: [], remoteIndex: [] };
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
      if (p.source && this.shadowsCommand(p)) {
        this.warnOnce(`Provider ${p.id}: /${p.prefix} is also a command name, so the command wins and the scope is off.`);
        continue;
      }
      out.push({ prefix: p.prefix, providerId: p.id, title: p.title, icon: p.icon, remote: false, placeholder: p.placeholder });
      for (const s of p.scopes ?? []) {
        if (isFeatureEnabled(p.id, s.feature)) out.push({ ...s, providerId: p.id, remote: false });
      }
    }
    return out;
  }

  /**
   * An extension provider's prefix must not shadow another provider's command: with `run` as a scope,
   * `/run npm test` would search that provider instead of running the command. Checks loaded catalogues.
   */
  private shadowsCommand(provider: SlashProvider): boolean {
    for (const [id, entry] of this.cache) {
      const named = (i: SlashItem) => i.name === provider.prefix;
      if (id !== provider.id && (entry.items.some(named) || entry.remote.some(named))) return true;
    }
    return false;
  }

  private warnOnce(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.log.warn(message);
  }

  /** Marks scopes whose provider has remote items so the webview asks the host while typing. */
  async scopesWithRemote(): Promise<ScopeView[]> {
    // Loaded first, so scopes() knows every command name an extension's prefix could shadow.
    await this.warm();
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
