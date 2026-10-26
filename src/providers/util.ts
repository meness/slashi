import * as vscode from 'vscode';
import type { ProviderId } from '../core/protocol';
import type { SlashItem } from '../types';

type ItemInput = Omit<SlashItem, 'providerId' | 'category' | 'name'> & { name?: string; category?: string };

/** Creates items for one provider with its id and category filled in. */
export function itemFactory(providerId: ProviderId, category: string) {
  return (input: ItemInput): SlashItem => ({ name: '', category, providerId, ...input });
}

/** Asks for arguments when an item that needs them was run without any. */
export async function ensureArgs(
  args: string,
  prompt: string,
  options: { value?: string; title?: string } = {},
): Promise<string | undefined> {
  if (args) return args;
  const value = await vscode.window.showInputBox({ prompt, value: options.value, title: options.title, ignoreFocusOut: true });
  return value?.trim() || undefined;
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Strips Markdown links/backticks from setting descriptions. */
export function plainMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`#?([^`]+?)#?`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1');
}

/** "editor.fontSize" → "Editor: Font Size", like the Settings UI. */
export function settingTitle(key: string): string {
  const parts = key.split('.');
  const words = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  const last = parts.pop()!;
  const prefix = parts.map(words).join(' › ');
  return prefix ? `${prefix}: ${words(last)}` : words(last);
}

export function formatValue(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return truncate(value || '""', 28);
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'number') return String(value);
  return truncate(JSON.stringify(value), 28);
}

/** `vscode.open` picks the right editor (image viewer, notebook…); showTextDocument fails on binary files. */
export function openAny(uri: vscode.Uri, viewColumn?: vscode.ViewColumn): Thenable<unknown> {
  return vscode.commands.executeCommand('vscode.open', uri, { preview: false, viewColumn });
}
