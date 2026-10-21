import * as vscode from 'vscode';
import type { SlashiProvider } from '../api';
import { extensionProviderId, normalizeProviderItems, validateProviderDef } from '../core/extensionProviders';
import type { ExtensionProviderId } from '../core/protocol';
import type { SlashItem, SlashProvider } from '../types';
import { itemFactory } from './util';

/** How long the popup waits for an extension's `items()`. */
export const ITEMS_TIMEOUT_MS = 3000;
const TIMED_OUT = Symbol('timed out');

/** Wraps a provider another extension registered, so its bugs and slowness can't break Slashi. */
export class ExtensionProvider implements SlashProvider {
  readonly id: ExtensionProviderId;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly prefix: string;
  readonly placeholder: string;
  readonly features: SlashProvider['features'];
  readonly volatile: boolean;
  readonly scopedOnly: boolean;
  readonly source: string;

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private readonly sub?: vscode.Disposable;
  private readonly make;
  /** A slow `items()` call still running; its result is kept in `late` for the next load. */
  private inflight?: Promise<void>;
  private late?: { value: unknown };
  private readonly warned = new Set<string>();

  /** Throws with every problem when the definition is invalid. `taken` holds the scope prefixes already in use. */
  constructor(
    private readonly def: SlashiProvider,
    taken: ReadonlySet<string>,
    private readonly log: vscode.LogOutputChannel,
  ) {
    const errors = validateProviderDef(def, taken);
    if (errors.length) throw new Error(`Invalid Slashi provider: ${errors.join('; ')}`);
    this.id = extensionProviderId(def.extensionId, def.id);
    this.title = def.title;
    this.description = def.description ?? `Results from ${def.extensionId}.`;
    this.icon = def.icon ?? 'puzzle-piece';
    this.prefix = def.prefix;
    this.placeholder = def.placeholder ?? `Search ${def.title}…`;
    this.features = [{ id: 'default', title: def.title, description: this.description }];
    this.volatile = def.volatile === true;
    this.scopedOnly = def.scopedOnly === true;
    this.source = def.extensionId;
    this.make = itemFactory(this.id, def.title);
    this.sub = def.onDidChange?.(() => this.emitter.fire());
  }

  async items(): Promise<SlashItem[]> {
    const raw = this.late ? this.late.value : await this.fetch();
    this.late = undefined;
    const { items, errors } = normalizeProviderItems(raw);
    for (const error of errors) this.warnOnce(error);
    return items.map((item) =>
      this.make({
        // Prefixed: item ids share one map across all providers.
        id: `${this.id}:${item.id}`,
        name: item.name,
        title: item.title,
        description: item.description,
        badge: item.badge,
        icon: item.icon ?? this.icon,
        keywords: item.keywords,
        feature: 'default',
        args: item.args ? { placeholder: item.args } : undefined,
        run: (ctx) => item.run(ctx.args),
      }),
    );
  }

  private async fetch(): Promise<unknown> {
    // A slow call is still running: show nothing now, its result arrives through `late`.
    if (this.inflight) return [];
    const call = Promise.resolve().then(() => this.def.items());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), ITEMS_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([call, timeout]);
      if (result !== TIMED_OUT) return result;
    } finally {
      clearTimeout(timer);
    }
    this.warnOnce(`items() took longer than ${ITEMS_TIMEOUT_MS / 1000} s; its results are shown once it finishes`);
    this.inflight = call
      .then(
        (value) => void (this.late = { value }),
        (err: unknown) => this.log.error(`Provider ${this.id} failed`, err),
      )
      .finally(() => {
        this.inflight = undefined;
        this.emitter.fire();
      });
    return [];
  }

  private warnOnce(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.log.warn(`Provider ${this.id} (${this.source}): ${message}`);
  }

  dispose(): void {
    this.sub?.dispose();
    this.emitter.dispose();
  }
}
