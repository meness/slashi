import type * as vscode from 'vscode';

/**
 * Public API returned by `vscode.extensions.getExtension('meness.slashi').activate()`.
 * See docs/BUILDING_ACTIONS.md for a full example.
 */
export interface SlashiApi {
  readonly version: 1;
  /** Adds a slash command to Slashi. Dispose the result to remove it. */
  registerCommand(command: {
    /** Your extension ID, e.g. `acme.deploy-tools`. */
    extensionId: string;
    /** Slash name: lower-case letters, digits and dashes (`deploy` → `/deploy`). */
    name: string;
    title?: string;
    description?: string;
    /** Phosphor icon name (https://phosphoricons.com), e.g. `rocket-launch`. */
    icon?: string;
    /** Placeholder shown when the command accepts arguments. */
    args?: string;
    run(args: string): unknown;
  }): vscode.Disposable;
  /**
   * Adds a whole source of results with its own scope, e.g. `/jira ` listing your tickets.
   * Throws if the definition is invalid or the prefix is taken. Dispose the result to remove it.
   * Added in 0.5.0: check `typeof api.registerProvider === 'function'` to support older versions.
   */
  registerProvider(provider: SlashiProvider): vscode.Disposable;
  /** Opens Slashi, optionally with a query such as `/git `. */
  open(query?: string): Promise<void>;
  /** Runs a slash command such as `/format` or `/run npm test`. Resolves false if no command matched. */
  run(slash: string): Promise<boolean>;
}

/** A provider registered through `SlashiApi.registerProvider`. */
export interface SlashiProvider {
  /** Your extension ID, e.g. `acme.jira`. */
  extensionId: string;
  /** Unique within your extension: lower-case letters, digits and dashes. */
  id: string;
  title: string;
  description?: string;
  /** Phosphor icon name (https://phosphoricons.com), used for the provider and as the default for its items. */
  icon?: string;
  /**
   * Scope keyword: `jira` → type `/jira ` to search only this provider. Must not be another provider's prefix,
   * and while it matches a command name (such as `run`) the command wins and the scope is off.
   */
  prefix: string;
  /** Placeholder shown inside the scope. */
  placeholder?: string;
  /** Call `items()` every time Slashi opens (live data). Otherwise results are cached until `onDidChange` fires. */
  volatile?: boolean;
  /** Show results only inside the scope, not in the global search. */
  scopedOnly?: boolean;
  /**
   * Returns the results. Called when you register and cached; Slashi waits at most 0.5 s for it when opening,
   * and a slower call's results show the next time Slashi opens.
   * Invalid items are skipped and logged, and at most 2000 are kept.
   */
  items(): SlashiProviderItem[] | PromiseLike<SlashiProviderItem[]>;
  /** Fire to make Slashi call `items()` again. */
  onDidChange?: vscode.Event<void>;
}

export interface SlashiProviderItem {
  /** Unique within your provider. */
  id: string;
  title: string;
  /** Slash name (`deploy` → `/deploy`). Leave it out for results that are only found by search. */
  name?: string;
  description?: string;
  /** Short value shown on the right. */
  badge?: string;
  /** Phosphor icon name; defaults to the provider's icon. */
  icon?: string;
  /** Extra search words. */
  keywords?: string[];
  /** Placeholder shown when the item accepts arguments. */
  args?: string;
  run(args: string): unknown;
}
