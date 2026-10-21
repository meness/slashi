import * as vscode from 'vscode';
import { get, isFeatureEnabled } from '../config';
import {
  approvalSteps,
  claimsSlashi,
  compareVersions,
  describeStep,
  isVerified,
  packDigest,
  resolvePackUrl,
  validatePack,
  validateRegistry,
  type PackDef,
  type RegistryEntry,
} from '../core/commandSchema';
import type { Services } from '../services/services';
import type { RunContext, SlashItem, SlashProvider } from '../types';
import { itemFactory } from './util';

const make = itemFactory('marketplace', 'Marketplace');
const TTL = 60 * 60 * 1000;
const MAX_BYTES = 1_000_000;

interface Listing extends RegistryEntry {
  registry: string;
  resolvedUrl: string;
  verified: boolean;
}

/** What a registry listing promises about the pack behind its URL. */
export interface Expected {
  id: string;
  sha256?: string;
  verified: boolean;
}

/** “by Slashi”, “by Slashi (unverified)” for packs that only claim to be Slashi's. */
function byline(author: string, verified: boolean): string {
  return `by ${author}${!verified && claimsSlashi(author) ? ' (unverified)' : ''}`;
}

export async function fetchJson(url: string): Promise<unknown> {
  const parsed = new URL(url);
  if (parsed.protocol === 'file:') {
    return JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.parse(url))));
  }
  if (parsed.protocol !== 'https:') throw new Error(`Only HTTPS URLs are allowed (${url}).`);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('The file is too large to be an action pack.');
  return JSON.parse(text);
}

/** Browse, install, update and remove community action packs. */
export class MarketplaceProvider implements SlashProvider {
  readonly id = 'marketplace' as const;
  readonly title = 'Action Marketplace';
  readonly description = 'Discover and install community action packs.';
  readonly icon = 'storefront';
  readonly prefix = 'market';
  readonly placeholder = 'Find action packs…';
  readonly features = [
    { id: 'browse', title: 'Browse registries', description: 'Packs from the registries in “slashi.marketplace.registries”.' },
    { id: 'install', title: 'Install from URL or file', description: '/install-pack <url> for packs that are not in a registry.' },
  ];

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private listings: Listing[] = [];
  private fetchedAt = 0;
  private loading?: Promise<void>;
  /** Registries the running load was started with. */
  private loadingKey?: string;
  private readonly subs: vscode.Disposable[];

  constructor(private readonly services: Services) {
    this.subs = [
      services.packs.onDidChange(() => this.emitter.fire()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('slashi.marketplace.registries')) {
          this.fetchedAt = 0;
          void this.refresh();
        }
      }),
    ];
  }

  dispose(): void {
    this.subs.forEach((s) => s.dispose());
    this.emitter.dispose();
  }

  /** Fetches every registry; failures are logged and the rest still load. */
  refresh(force = false): Promise<void> {
    if (!force && Date.now() - this.fetchedAt < TTL) return Promise.resolve();
    const registries = get<string[]>('marketplace.registries', []);
    const key = JSON.stringify(registries);
    // A load started before the registries setting changed would cache the old list; start a new one.
    if (this.loading && this.loadingKey === key) return this.loading;
    this.loadingKey = key;
    const run = (async () => {
      const all: Listing[] = [];
      await Promise.all(
        registries.map(async (registry) => {
          try {
            const { value, errors } = validateRegistry(await fetchJson(registry));
            errors.forEach((e) => this.services.log.warn(`${registry}: ${e}`));
            for (const entry of value?.packs ?? []) {
              try {
                all.push({ ...entry, registry, resolvedUrl: resolvePackUrl(registry, entry.url), verified: isVerified(registry, entry) });
              } catch (err) {
                this.services.log.warn(String(err));
              }
            }
          } catch (err) {
            this.services.log.warn(`Could not load registry ${registry}: ${(err as Error).message}`);
          }
        }),
      );
      if (this.loadingKey !== key) return; // superseded by a newer load
      this.listings = all;
      this.fetchedAt = Date.now();
      this.loading = this.loadingKey = undefined;
      this.emitter.fire();
    })();
    this.loading = run;
    return run;
  }

  items(): SlashItem[] {
    if (isFeatureEnabled('marketplace', 'browse') && Date.now() - this.fetchedAt > TTL) void this.refresh();
    const installed = new Map(this.services.packs.list().map((p) => [p.id, p]));
    const items: SlashItem[] = [
      make({
        id: 'market:browse',
        name: 'market',
        title: 'Browse Action Marketplace',
        description: 'Find and install community action packs',
        icon: 'storefront',
        feature: 'browse',
        boost: 2,
        kind: 'scope',
        scopePrefix: 'market',
        run: () => this.services.openPopup('/market '),
      }),
      make({
        id: 'market:refresh',
        name: 'market-refresh',
        title: 'Refresh Marketplace',
        icon: 'arrows-clockwise',
        feature: 'browse',
        run: async () => {
          await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Refreshing Slashi marketplace…' }, () =>
            this.refresh(true),
          );
          void vscode.window.setStatusBarMessage(`$(check) ${this.listings.length} packs available`, 3000);
        },
      }),
      make({
        id: 'market:install-url',
        name: 'install-pack',
        title: 'Install Action Pack from URL or File',
        icon: 'download-simple',
        feature: 'install',
        args: { placeholder: 'https://…/pack.json (empty to pick a file)' },
        run: (ctx) => installFromUrlOrFile(this.services, ctx.args),
      }),
      make({
        id: 'market:packs',
        name: 'packs',
        title: 'Manage Installed Packs',
        description: `${installed.size} installed`,
        icon: 'package',
        feature: 'browse',
        run: () => managePacks(this.services),
      }),
    ];
    if (!isFeatureEnabled('marketplace', 'browse')) return items;
    for (const listing of this.listings) {
      const current = installed.get(listing.id);
      const update = current && compareVersions(listing.version, current.version) > 0;
      items.push(
        make({
          id: `market:${listing.registry}:${listing.id}`,
          title: listing.name,
          description: `${listing.description} · ${byline(listing.author, listing.verified)}`,
          badge: update ? 'update' : current ? 'installed' : `${listing.commands} cmds`,
          icon: listing.icon ?? 'package',
          category: 'Action Packs',
          feature: 'browse',
          keywords: [...(listing.tags ?? []), listing.id, 'pack', ...(listing.verified ? ['verified'] : [])],
          verified: listing.verified,
          actions: [
            {
              id: 'install',
              title: current ? (update ? `Update to v${listing.version}` : 'Reinstall') : 'Install',
              icon: 'download-simple',
            },
            ...(current ? [{ id: 'uninstall', title: 'Uninstall', icon: 'trash', danger: true }] : []),
            { id: 'source', title: 'View source', icon: 'code' },
          ],
          run: (ctx) => this.listingAction(listing, current, ctx),
        }),
      );
    }
    return items;
  }

  private async listingAction(listing: Listing, current: PackDef | undefined, ctx: RunContext): Promise<void> {
    switch (ctx.action) {
      case 'uninstall':
        await this.services.packs.uninstall(listing.id);
        void vscode.window.setStatusBarMessage(`$(trash) Uninstalled ${listing.name}`, 3000);
        return;
      case 'source':
        await vscode.env.openExternal(vscode.Uri.parse(listing.resolvedUrl));
        return;
      default:
        if (current && !ctx.action && compareVersions(listing.version, current.version) <= 0) {
          await runFromPack(this.services, current);
          return;
        }
        await installFromUrl(this.services, listing.resolvedUrl, listing);
    }
  }
}

async function installFromUrlOrFile(services: Services, input: string): Promise<void> {
  let url = input.trim();
  if (!url) {
    const files = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'Slashi action pack': ['json'] },
      title: 'Install action pack',
    });
    if (!files?.[0]) return;
    url = files[0].toString();
  } else if (!/^[a-z]+:\/\//i.test(url)) {
    url = vscode.Uri.file(url).toString();
  }
  await installFromUrl(services, url);
}

/** Installs after showing every step. `expected` comes from a registry listing; the download must match it. */
export async function installFromUrl(services: Services, url: string, expected?: Expected): Promise<void> {
  const raw = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Downloading action pack…' }, () =>
    fetchJson(url),
  );
  const { value: pack, errors } = validatePack(raw);
  if (!pack) throw new Error(`Invalid action pack: ${errors.slice(0, 3).join('; ')}`);
  if (expected && pack.id !== expected.id)
    throw new Error(`The registry lists “${expected.id}”, but the file is the pack “${pack.id}”. Nothing was installed.`);
  if (expected?.sha256 && (await packDigest(raw)) !== expected.sha256)
    throw new Error(
      `${pack.name} doesn’t match its registry listing, so nothing was installed. If the registry was just updated, try again in a few minutes.`,
    );
  const verified = expected?.verified === true;
  const lines = pack.commands.map((c) => {
    const risky = approvalSteps(c);
    const steps = c.steps.map((s) => `${risky.includes(s) ? '⚠ ' : '   '}${describeStep(s)}`).join('\n');
    return `/${c.name} — ${c.title ?? ''}\n${steps}`;
  });
  const asks = pack.commands.some((c) => approvalSteps(c).length);
  const existing = services.packs.get(pack.id);
  const verb = existing ? `Update ${pack.name} ${existing.version} → ${pack.version}` : `Install ${pack.name} v${pack.version}`;
  const choice = await vscode.window.showInformationMessage(
    `${verb} ${byline(pack.author, verified)}?`,
    {
      modal: true,
      detail: `${verified ? '✓ Verified: published by Slashi and checked against its official registry.\n\n' : ''}${pack.description}\n\n${lines.join('\n\n')}${asks ? '\n\n⚠ Steps marked ⚠ can run commands, change settings or open links. Each command asks you before it runs the first time.' : ''}`,
    },
    existing ? 'Update' : 'Install',
  );
  if (!choice) return;
  await services.packs.install(pack);
  void vscode.window.showInformationMessage(`${pack.name} installed — try /${pack.commands[0].name}.`);
}

async function runFromPack(services: Services, pack: PackDef): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    pack.commands.map((c) => ({ label: `/${c.name}`, description: c.title, detail: c.description })),
    { title: `${pack.name} v${pack.version}`, placeHolder: 'Run a command from this pack' },
  );
  if (pick) await services.runSlash(pick.label);
}

async function managePacks(services: Services): Promise<void> {
  const packs = services.packs.list();
  if (!packs.length) {
    await services.openPopup('/market ');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    packs.map((p) => ({ label: p.name, description: `v${p.version} · ${p.commands.length} commands`, detail: p.description, pack: p })),
    { title: 'Installed action packs' },
  );
  if (!pick) return;
  const action = await vscode.window.showQuickPick(['Run a command', 'Uninstall'], { title: pick.pack.name });
  if (action === 'Run a command') await runFromPack(services, pick.pack);
  if (action === 'Uninstall') await services.packs.uninstall(pick.pack.id);
}
