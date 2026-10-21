import * as vscode from 'vscode';
import type { ProviderId } from './core/protocol';

export const section = () => vscode.workspace.getConfiguration('slashi');

// The primitive overloads widen the fallback, so get('x', '') is a string, not the literal type ''.
export function get(key: string, fallback: string): string;
export function get(key: string, fallback: number): number;
export function get(key: string, fallback: boolean): boolean;
export function get<T>(key: string, fallback: T): T;
export function get<T>(key: string, fallback: T): T {
  return section().get<T>(key, fallback);
}

export function isProviderEnabled(id: ProviderId): boolean {
  if (id === 'system') return true;
  return get<boolean>(`providers.${id}`, true);
}

export function isFeatureEnabled(provider: ProviderId, feature: string): boolean {
  return enabledFeatures()(provider, feature);
}

/** Reads `slashi.disabledFeatures` once, for checking many items (a settings read per item is slow). */
export function enabledFeatures(): (provider: ProviderId, feature: string) => boolean {
  const disabled = new Set(get<string[]>('disabledFeatures', []));
  return (provider, feature) => !disabled.has(`${provider}.${feature}`);
}

/** Matches ids against `slashi.hiddenCommands`, supporting a trailing `*`. */
export function hiddenMatcher(): (id: string) => boolean {
  const patterns = get<string[]>('hiddenCommands', []);
  if (!patterns.length) return () => false;
  const exact = new Set(patterns.filter((p) => !p.endsWith('*')));
  const prefixes = patterns.filter((p) => p.endsWith('*')).map((p) => p.slice(0, -1));
  return (id) => exact.has(id) || prefixes.some((p) => id.startsWith(p));
}

/** The user-settings value only. `get` also returns workspace values, which must never be copied into user settings. */
export function globalValue<T>(key: string, fallback: T): T {
  return section().inspect<T>(key)?.globalValue ?? fallback;
}

export async function updateGlobal(key: string, value: unknown): Promise<void> {
  await section().update(key, value, vscode.ConfigurationTarget.Global);
}

export async function setFeatureEnabled(provider: ProviderId, feature: string, enabled: boolean): Promise<void> {
  const key = `${provider}.${feature}`;
  const current = new Set(globalValue<string[]>('disabledFeatures', []));
  if (enabled) current.delete(key);
  else current.add(key);
  await updateGlobal('disabledFeatures', Array.from(current).sort());
}

export async function hideItem(id: string): Promise<void> {
  const current = new Set(globalValue<string[]>('hiddenCommands', []));
  current.add(id);
  await updateGlobal('hiddenCommands', Array.from(current).sort());
}

/** The key that opens Slashi on this platform, as shown in the UI. */
export function shortcutLabel(): string {
  const slash = get('shortcut.useSlashKey', true);
  if (process.platform === 'darwin') return slash ? '⌘/' : '⌘⇧;';
  return slash ? 'Ctrl+/' : 'Ctrl+Shift+/';
}
