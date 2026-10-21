import type * as vscode from 'vscode';
import type { ItemView, ProviderId } from './core/protocol';
import type { Services } from './services/services';

export interface RunContext {
  /** Text typed after the item's name, e.g. `npm test` for `/run npm test`. */
  args: string;
  /** Secondary action chosen from the actions menu, if any. */
  action?: string;
  /** Returns the editor that was active when Slashi opened, re-focused with its original selections. */
  editor(): Promise<vscode.TextEditor | undefined>;
  services: Services;
}

export interface SlashItem extends ItemView {
  /** Feature inside the provider, used by `slashi.disabledFeatures`. */
  feature: string;
  run(ctx: RunContext): unknown;
  /** Extra context for the Do-with-AI catalog. */
  aiKind?: string;
  aiHint?: string;
  /**
   * Remote items are ranked in the extension host (large catalogues such as workspace files)
   * and never posted to the Spotlight webview in bulk.
   */
  remote?: boolean;
  /** Shown only while the current editor is in one of these languages (custom commands' `languages`). */
  languages?: string[];
  /** Items that always need the previous text editor (transforms, AI on selection…). */
  needsEditor?: boolean;
}

export interface FeatureDef {
  id: string;
  title: string;
  description: string;
}

export interface ScopeDef {
  prefix: string;
  title: string;
  icon: string;
  placeholder: string;
  feature: string;
}

export interface SlashProvider {
  id: ProviderId;
  title: string;
  description: string;
  /** Phosphor icon. */
  icon: string;
  /** Scope keyword: `/set `. */
  prefix: string;
  placeholder: string;
  features: FeatureDef[];
  /** Extra scopes beyond `prefix`, each narrowing to one feature: `/tab `, `/err `. */
  scopes?: ScopeDef[];
  /** Volatile providers are rebuilt every time the popup opens (open tabs, symbols, problems). */
  volatile?: boolean;
  /** Excluded from unscoped searches, only reachable through its scope. */
  scopedOnly?: boolean;
  /** ID of the extension that registered this provider through the API; unset for built-in providers. */
  source?: string;
  items(): SlashItem[] | Promise<SlashItem[]>;
  onDidChange?: vscode.Event<void>;
  dispose?(): void;
}
