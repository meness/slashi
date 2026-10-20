import * as vscode from 'vscode';
import { get, isFeatureEnabled } from '../config';
import { selectionText } from '../services/editor';
import type { SlashItem, SlashProvider } from '../types';
import { ensureArgs, itemFactory } from './util';

const make = itemFactory('web', 'Web');

const ENGINES: { name: string; title: string; icon: string; url: string }[] = [
  { name: 'google', title: 'Search Google', icon: 'google-logo', url: 'https://www.google.com/search?q=%s' },
  { name: 'so', title: 'Search Stack Overflow', icon: 'stack-overflow-logo', url: 'https://stackoverflow.com/search?q=%s' },
  { name: 'gh', title: 'Search GitHub Code', icon: 'github-logo', url: 'https://github.com/search?type=code&q=%s' },
  { name: 'mdn', title: 'Search MDN Web Docs', icon: 'book-open', url: 'https://developer.mozilla.org/search?q=%s' },
  { name: 'npm', title: 'Search npm', icon: 'package', url: 'https://www.npmjs.com/search?q=%s' },
  { name: 'pypi', title: 'Search PyPI', icon: 'file-py', url: 'https://pypi.org/search/?q=%s' },
  { name: 'crates', title: 'Search crates.io', icon: 'file-rs', url: 'https://crates.io/search?q=%s' },
  { name: 'devdocs', title: 'Search DevDocs', icon: 'books', url: 'https://devdocs.io/#q=%s' },
  { name: 'caniuse', title: 'Can I Use…', icon: 'browsers', url: 'https://caniuse.com/?search=%s' },
  { name: 'youtube', title: 'Search YouTube', icon: 'youtube-logo', url: 'https://www.youtube.com/results?search_query=%s' },
];

/** Opens web searches for the typed text or the current selection. */
export class WebProvider implements SlashProvider {
  readonly id = 'web' as const;
  readonly title = 'Web';
  readonly description = 'Search Google, Stack Overflow, GitHub, MDN, npm, PyPI and your own engines.';
  readonly icon = 'globe';
  readonly prefix = 'web';
  readonly placeholder = 'Search the web…';
  readonly features = [
    { id: 'builtin', title: 'Built-in engines', description: 'Google, Stack Overflow, GitHub, MDN, npm, PyPI, crates.io, DevDocs, Can I Use, YouTube.' },
    { id: 'custom', title: 'Your engines', description: 'Engines from “slashi.web.engines”.' },
  ];

  items(): SlashItem[] {
    const custom = Object.entries(get<Record<string, string>>('web.engines', {})).map(([name, url]) => ({ name, title: `Search ${name}`, icon: 'globe', url, custom: true }));
    const engines = [...(isFeatureEnabled('web', 'builtin') ? ENGINES : []), ...(isFeatureEnabled('web', 'custom') ? custom : [])];
    return engines.map((engine) =>
      make({
        id: `web:${engine.name}`,
        name: engine.name,
        title: engine.title,
        description: new URL(engine.url.replace('%s', '')).hostname,
        icon: engine.icon,
        feature: 'custom' in engine ? 'custom' : 'builtin',
        args: { placeholder: 'search text (defaults to the selection)' },
        keywords: ['search', 'web', 'browser'],
        run: async (ctx) => {
          const fallback = selectionText(await ctx.editor()).trim();
          const query = ctx.args || (await ensureArgs('', engine.title, { value: fallback.slice(0, 200) }));
          if (query) await vscode.env.openExternal(vscode.Uri.parse(engine.url.replace('%s', encodeURIComponent(query))));
        },
      }),
    );
  }
}
