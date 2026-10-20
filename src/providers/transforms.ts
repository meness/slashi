import * as vscode from 'vscode';
import { TRANSFORMS, type TextTransform } from '../core/transforms';
import { textTarget } from '../services/editor';
import type { RunContext, SlashItem, SlashProvider } from '../types';
import { itemFactory } from './util';

const make = itemFactory('transforms', 'Text');

const GROUP_TITLES: Record<TextTransform['group'], string> = {
  case: 'Change Case',
  lines: 'Lines',
  encode: 'Encode & Hash',
  json: 'JSON',
  generate: 'Insert',
  stats: 'Stats',
};

/** Text tools that work on every selection (multi-cursor aware). */
export class TransformsProvider implements SlashProvider {
  readonly id = 'transforms' as const;
  readonly title = 'Text Tools';
  readonly description = 'Change case, sort lines, format JSON, encode, hash, insert UUIDs and dates.';
  readonly icon = 'text-aa';
  readonly prefix = 'tx';
  readonly placeholder = 'Transform the selection…';
  readonly features = [
    { id: 'case', title: 'Change case', description: 'UPPER, lower, Title, camelCase, snake_case, kebab-case…' },
    { id: 'lines', title: 'Lines', description: 'Sort, unique, reverse, trim, number, join.' },
    { id: 'encode', title: 'Encode & hash', description: 'Base64, URL, HTML, JSON strings, SHA-256, MD5.' },
    { id: 'json', title: 'JSON', description: 'Format, minify, sort keys.' },
    { id: 'generate', title: 'Insert', description: 'UUID, dates, timestamps, lorem ipsum.' },
    { id: 'stats', title: 'Stats', description: 'Count words, characters and lines.' },
  ];

  items(): SlashItem[] {
    return TRANSFORMS.map((t) =>
      make({
        id: `tx:${t.name}`,
        name: t.name,
        title: t.title,
        description: t.description,
        icon: t.icon,
        category: GROUP_TITLES[t.group],
        feature: t.group,
        keywords: t.keywords,
        args: t.args ? { placeholder: t.args } : undefined,
        needsEditor: true,
        aiKind: 'text transform',
        run: (ctx) => applyTransform(t, ctx),
      }),
    );
  }
}

async function applyTransform(t: TextTransform, ctx: RunContext): Promise<void> {
  const editor = (await ctx.editor())!;
  if (t.kind === 'info') {
    const [target] = textTarget(editor, 'document');
    void vscode.window.showInformationMessage(t.apply(target.text, ctx.args));
    return;
  }
  if (t.kind === 'insert') {
    const ok = await editor.edit((b) => editor.selections.forEach((s) => b.replace(s, t.apply('', ctx.args))));
    if (!ok) throw new Error('The editor rejected the edit.');
    return;
  }
  const targets = textTarget(editor, t.wholeDocument ? 'document' : 'word');
  const results = targets.map((target) => ({ range: target.range, text: t.apply(target.text, ctx.args) }));
  const ok = await editor.edit((b) => results.forEach((r) => b.replace(r.range, r.text)));
  if (!ok) throw new Error('The editor rejected the edit.');
}
