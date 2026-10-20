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
  /** Opens Slashi, optionally with a query such as `/git `. */
  open(query?: string): Promise<void>;
  /** Runs a slash command such as `/format` or `/run npm test`. Resolves false if no command matched. */
  run(slash: string): Promise<boolean>;
}
