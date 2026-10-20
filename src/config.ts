import * as vscode from 'vscode';
import type { ProviderId } from './core/protocol';

export const section = () => vscode.workspace.getConfiguration('slashi');

export function get<T>(key: string, fallback: T): T {
  return section().get<T>(key, fallback);
}

export function isProviderEnabled(id: ProviderId): boolean {
  if (id === 'system') return true;
  return get<boolean>(`providers.${id}`, true);
}

export function isFeatureEnabled(provider: ProviderId, feature: string): boolean {
  return !get<string[]>('disabledFeatures', []).includes(`${provider}.${feature}`);
}

/** Matches ids against `slashi.hiddenCommands`, supporting a trailing `*`. */
export function hiddenMatcher(): (id: string) => boolean {
  const patterns = get<string[]>('hiddenCommands', []);
  if (!patterns.length) return () => false;
  const exact = new Set(patterns.filter((p) => !p.endsWith('*')));
  const prefixes = patterns.filter((p) => p.endsWith('*')).map((p) => p.slice(0, -1));
  return (id) => exact.has(id) || prefixes.some((p) => id.startsWith(p));
}

export async function updateGlobal(key: string, value: unknown): Promise<void> {
  await section().update(key, value, vscode.ConfigurationTarget.Global);
}

export async function setFeatureEnabled(provider: ProviderId, feature: string, enabled: boolean): Promise<void> {
  const key = `${provider}.${feature}`;
  const current = new Set(get<string[]>('disabledFeatures', []));
  if (enabled) current.delete(key);
  else current.add(key);
  await updateGlobal('disabledFeatures', Array.from(current).sort());
}

export async function hideItem(id: string): Promise<void> {
  const current = new Set(get<string[]>('hiddenCommands', []));
  current.add(id);
  await updateGlobal('hiddenCommands', Array.from(current).sort());
}

export function shortcutLabel(): string {
  return process.platform === 'darwin' ? '⌃/' : 'Ctrl+Shift+/';
}
