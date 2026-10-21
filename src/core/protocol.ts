// Serializable shapes shared by the extension host and the webviews.

export type ProviderId =
  | 'files'
  | 'navigation'
  | 'project'
  | 'commands'
  | 'settings'
  | 'extensions'
  | 'ai'
  | 'naturalLanguage'
  | 'transforms'
  | 'terminal'
  | 'git'
  | 'themes'
  | 'web'
  | 'custom'
  | 'marketplace'
  | 'system';

/** A result as the UI sees it. Never contains functions. */
export interface ItemView {
  id: string;
  /** Slash keyword without the leading slash, e.g. `upper`. Empty for items reachable only by search. */
  name: string;
  title: string;
  description?: string;
  /** Short value shown on the right, e.g. a setting's current value. */
  badge?: string;
  /** Phosphor icon name, e.g. `gear-six` (https://phosphoricons.com). */
  icon: string;
  providerId: ProviderId;
  /** Feature inside the provider (see `slashi.disabledFeatures`). */
  feature?: string;
  category: string;
  keywords?: string[];
  /** Present when the item accepts free text after its name: `/run npm test`. */
  args?: { placeholder: string; required?: boolean };
  /** Secondary actions shown in the actions menu (Shift+Enter / →). */
  actions?: ActionView[];
  /** Static ranking boost for important items. */
  boost?: number;
  /** `scope` items narrow the search to a provider when chosen. */
  kind?: 'item' | 'scope' | 'ai';
  /** Scope prefix applied when a `scope` item is chosen. */
  scopePrefix?: string;
  /** A marketplace pack published by Slashi in its official registry (see `isVerified`). */
  verified?: boolean;
}

export interface ActionView {
  id: string;
  title: string;
  icon: string;
  /** Rendered as a keyboard hint. */
  hint?: string;
  danger?: boolean;
}

export interface ScopeView {
  prefix: string;
  providerId: ProviderId;
  title: string;
  icon: string;
  /** Narrows the scope to one feature of the provider. */
  feature?: string;
  /** Remote scopes are searched by the extension host as you type. */
  remote: boolean;
  placeholder: string;
}

export interface FrecencyEntry {
  /** Number of runs. */
  c: number;
  /** Last run, epoch ms. */
  t: number;
}

export type FrecencyMap = Record<string, FrecencyEntry>;

export interface SpotlightInit {
  items: ItemView[];
  scopes: ScopeView[];
  frecency: FrecencyMap;
  initialQuery: string;
  maxResults: number;
  showDescriptions: boolean;
  aiEnabled: boolean;
  nlEnabled: boolean;
  aiLabel: string;
  commonActions: ActionView[];
  shortcut: string;
  context: { hasSelection: boolean; fileName?: string };
  now: number;
}

export interface RankedView extends ItemView {
  score: number;
  /** Indices into `title` to highlight. */
  highlights?: number[];
  /** Text passed as arguments when the item runs. */
  argText?: string;
}

/** Messages from the Spotlight webview to the extension host. */
export type SpotlightToHost =
  | { type: 'ready' }
  | { type: 'run'; id: string; args?: string; action?: string }
  | { type: 'ai'; text: string }
  | { type: 'query'; seq: number; query: string }
  | { type: 'close' };

/** Messages from the extension host to the Spotlight webview. */
export type HostToSpotlight =
  { type: 'init'; data: SpotlightInit } | { type: 'live'; seq: number; items: RankedView[] } | { type: 'setQuery'; query: string };
