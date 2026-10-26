// Spotlight popup UI. Ranks local items in the webview; remote providers (files) are ranked by the host.

import type { ActionView, HostToSpotlight, ItemView, RankedView, SpotlightInit } from '../core/protocol';
import { parseQuery, type ParsedQuery } from '../core/query';
import { indexItems, mergeRanked, rank, type IndexedItem } from '../core/search';
import { $, esc, icon, isMac, MOD, vscode } from './common';

type Row = { section: string } | { item: RankedView };

const AI_DO = '__ai_do';
const AI_ASK = '__ai_ask';

let data: SpotlightInit | undefined;
let index: IndexedItem[] = [];
const scopeIndex = new Map<string, IndexedItem[]>();
let prefixes: string[] = [];
let selectable: RankedView[] = [];
let active = 0;
let remote: RankedView[] = [];
let remoteQuery = '';
let seq = 0;
let remoteTimer: number | undefined;
let pendingRemote = false;
let menu: { item: RankedView; actions: ActionView[]; active: number } | undefined;
let mouseMoved = false;

document.body.innerHTML = `
  <div class="stage">
    <div class="card" role="dialog" aria-label="Slashi">
      <div class="search">
        <div class="brand-mark" aria-hidden="true">/</div>
        <input id="q" type="text" autocomplete="off" spellcheck="false" placeholder="Type / to do anything…" aria-label="Slashi search" role="combobox" aria-expanded="true" aria-controls="results" aria-autocomplete="list">
        <div class="spinner" id="spin" aria-hidden="true"></div>
        <span class="scope-chip" id="chip"></span>
      </div>
      <div class="results" id="results" role="listbox" aria-label="Results"></div>
      <div class="actions" id="actions" role="menu" hidden></div>
      <div class="footer" id="footer"></div>
    </div>
  </div>`;

const input = $('#q') as HTMLInputElement;
const results = $('#results');
const actionsEl = $('#actions');
const chip = $('#chip');
const spin = $('#spin');
const footer = $('#footer');

window.addEventListener('message', (event: MessageEvent<HostToSpotlight>) => {
  const msg = event.data;
  if (msg.type === 'init') init(msg.data);
  else if (msg.type === 'live' && msg.seq === seq) {
    remote = msg.items;
    remoteQuery = input.value;
    pendingRemote = false;
    render();
  } else if (msg.type === 'setQuery') {
    input.value = msg.query;
    update();
  }
});

function init(d: SpotlightInit): void {
  data = d;
  index = indexItems(d.items);
  prefixes = d.scopes.map((s) => s.prefix);
  input.value = d.initialQuery;
  renderFooter();
  update();
  input.focus();
}

function update(): void {
  menu = undefined;
  active = 0;
  scheduleRemote();
  render();
}

function currentQuery(): ParsedQuery {
  return parseQuery(input.value, prefixes);
}

function scopeOf(q: ParsedQuery) {
  return q.scope ? data?.scopes.find((s) => s.prefix === q.scope) : undefined;
}

function scheduleRemote(): void {
  if (!data) return;
  const q = currentQuery();
  const scope = scopeOf(q);
  const wanted = scope ? scope.remote : q.words.length > 0 && q.term.length >= 2 && data.scopes.some((s) => s.remote && !s.feature);
  window.clearTimeout(remoteTimer);
  if (!wanted) {
    remote = [];
    pendingRemote = false;
    return;
  }
  if (remoteQuery !== input.value) remote = [];
  pendingRemote = true;
  remoteTimer = window.setTimeout(() => {
    seq++;
    vscode.postMessage({ type: 'query', seq, query: input.value });
  }, 60);
}

function sourceFor(q: ParsedQuery): IndexedItem[] {
  const scope = scopeOf(q);
  if (!scope) return index;
  let cached = scopeIndex.get(scope.prefix);
  if (!cached) {
    cached = index.filter(
      (e) => e.item.kind !== 'scope' && e.item.providerId === scope.providerId && (!scope.feature || e.item.feature === scope.feature),
    );
    scopeIndex.set(scope.prefix, cached);
  }
  return cached;
}

function aiItems(term: string): RankedView[] {
  if (!data?.aiEnabled || term.length < 3) return [];
  const items: RankedView[] = [];
  if (data.nlEnabled) {
    items.push({
      id: AI_DO,
      name: '',
      title: `Do with AI: “${term}”`,
      description: 'Let the AI pick and run the right actions (you confirm first)',
      icon: 'magic-wand',
      providerId: 'naturalLanguage',
      category: 'AI',
      kind: 'ai',
      score: 0,
    });
  }
  items.push({
    id: AI_ASK,
    name: '',
    title: `Ask AI: “${term}”`,
    description: data.context.hasSelection
      ? 'Includes your selection as context'
      : data.context.fileName
        ? `Includes ${data.context.fileName} as context`
        : 'Opens the answer panel',
    icon: 'chat-circle-dots',
    providerId: 'ai',
    category: 'AI',
    kind: 'ai',
    score: 0,
  });
  return items;
}

function buildRows(): Row[] {
  if (!data) return [];
  const q = currentQuery();
  const scope = scopeOf(q);
  const frecency = data.frecency;
  const now = data.now;
  chip.className = scope ? 'scope-chip visible' : 'scope-chip';
  if (scope) {
    chip.dataset.provider = scope.providerId;
    chip.innerHTML = `${icon(scope.icon)} ${esc(scope.title)}`;
    input.placeholder = scope.placeholder;
  } else {
    input.placeholder = 'Type / to do anything…';
  }

  // Home screen: recent, suggestions and scopes.
  if (!q.words.length && !scope) {
    const rows: Row[] = [];
    const byId = new Map(data.items.map((i) => [i.id, i]));
    const recent = Object.keys(frecency)
      .filter((id) => byId.has(id))
      .sort((a, b) => frecency[b].t - frecency[a].t)
      .slice(0, 6)
      .map((id) => ({ ...byId.get(id)!, score: 0 }));
    if (recent.length) rows.push({ section: 'Recent' }, ...recent.map((item) => ({ item })));
    const shown = new Set(recent.map((r) => r.id));
    const contextual = data.context.hasSelection
      ? ['ai:explain', 'ai:edit', 'ai:fix', 'tx:upper', 'tx:camel', 'tx:sort']
      : ['ai:ask', 'files:new', 'nl:do', 'cmd:editor.action.formatDocument', 'term:run', 'git:commit'];
    const suggested = [...contextual.map((id) => byId.get(id)), ...data.items.filter((i) => (i.boost ?? 0) >= 6 && i.kind !== 'scope')]
      .filter((i): i is ItemView => !!i && !shown.has(i.id))
      .filter((i, n, all) => all.findIndex((x) => x.id === i.id) === n)
      .slice(0, 8)
      .map((i) => ({ ...i, score: 0 }));
    if (suggested.length)
      rows.push({ section: data.context.hasSelection ? 'For your selection' : 'Suggested' }, ...suggested.map((item) => ({ item })));
    const scopes = data.items.filter((i) => i.kind === 'scope').map((i) => ({ ...i, score: 0 }));
    if (scopes.length) rows.push({ section: 'Search in…' }, ...scopes.map((item) => ({ item })));
    return rows;
  }

  const local = rank(sourceFor(q), q, { limit: data.maxResults, frecency, now });
  const live = remoteQuery === input.value ? remote : [];
  const ranked = mergeRanked([local, live], data.maxResults);
  const ai = scope && scope.providerId !== 'ai' && scope.providerId !== 'naturalLanguage' ? [] : aiItems(q.term);
  const weak = !ranked.length || ranked[0].score < 60;
  const items = weak ? [...ai, ...ranked] : [...ranked, ...ai];
  return items.map((item) => ({ item }));
}

function highlight(text: string, positions: number[] | undefined): string {
  if (!positions?.length) return esc(text);
  const set = new Set(positions);
  let out = '';
  let open = false;
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    if (hit && !open) {
      out += '<mark>';
      open = true;
    } else if (!hit && open) {
      out += '</mark>';
      open = false;
    }
    out += esc(text[i]);
  }
  return open ? `${out}</mark>` : out;
}

const VERIFIED = `<span class="verified" role="img" aria-label="Verified" title="Verified: published by Slashi">${icon('seal-check', 'duotone')}</span>`;

function rowHtml(item: RankedView, i: number): string {
  const slash =
    item.name && item.kind !== 'ai'
      ? `<span class="slash">/${esc(item.name)}${item.args ? ` <span class="arg">‹${esc(item.args.placeholder)}›</span>` : ''}</span>`
      : '';
  let desc = data?.showDescriptions ? esc(item.description) : '';
  if (item.argText) desc = `<span class="args-preview">${esc(item.argText)}</span>${desc ? ` · ${desc}` : ''}`;
  return `<div class="row${i === active ? ' active' : ''}" id="opt-${i}" data-i="${i}" data-provider="${esc(item.providerId)}" role="option" aria-selected="${i === active}">
    <div class="tile">${icon(item.icon, 'duotone')}</div>
    <div class="text">
      <div class="title"><span class="label">${highlight(item.title, item.highlights)}</span>${item.verified ? VERIFIED : ''}${slash}</div>
      ${desc ? `<div class="desc">${desc}</div>` : ''}
    </div>
    <div class="meta">
      ${item.badge ? `<span class="badge">${esc(item.badge)}</span>` : ''}
      <span class="category">${esc(item.category)}</span>
      <kbd class="enter">↵</kbd>
    </div>
  </div>`;
}

function render(): void {
  if (!data) return;
  const rows = buildRows();
  selectable = [];
  let html = '';
  for (const row of rows) {
    if ('section' in row) html += `<div class="section">${esc(row.section)}</div>`;
    else {
      html += rowHtml(row.item, selectable.length);
      selectable.push(row.item);
    }
  }
  spin.className = pendingRemote ? 'spinner visible' : 'spinner';
  if (!selectable.length) {
    const q = currentQuery();
    html = pendingRemote
      ? `<div class="empty">${icon('magnifying-glass')}<span>Searching…</span></div>`
      : `<div class="empty">${icon('ghost')}<strong>No matches for “${esc(q.term)}”</strong><span>${data.aiEnabled ? `Press <kbd>${MOD}</kbd> <kbd>↵</kbd> to ask AI instead.` : 'Try fewer letters, or another scope.'}</span></div>`;
  }
  active = Math.min(active, Math.max(selectable.length - 1, 0));
  results.innerHTML = html;
  input.setAttribute('aria-activedescendant', selectable.length ? `opt-${active}` : '');
  renderMenu();
  syncTabHint();
}

/** Tab only does something on rows with a slash name (or a scope), so the footer hint follows the selection. */
function syncTabHint(): void {
  const item = selectable[active];
  footer.classList.toggle('no-complete', !(item && (item.kind === 'scope' ? item.scopePrefix : item.name && item.kind !== 'ai')));
}

function setActive(next: number, scroll = true): void {
  if (!selectable.length) return;
  const prev = results.querySelector('.row.active');
  active = (next + selectable.length) % selectable.length;
  prev?.classList.remove('active');
  prev?.setAttribute('aria-selected', 'false');
  const el = document.getElementById(`opt-${active}`);
  el?.classList.add('active');
  el?.setAttribute('aria-selected', 'true');
  input.setAttribute('aria-activedescendant', `opt-${active}`);
  syncTabHint();
  if (scroll) el?.scrollIntoView({ block: 'nearest' });
}

function complete(item: RankedView | undefined): boolean {
  if (!item) return false;
  if (item.kind === 'scope' && item.scopePrefix) input.value = `/${item.scopePrefix} `;
  else if (item.name && item.kind !== 'ai') input.value = `/${item.name}${item.args ? ' ' : ''}`;
  else return false;
  update();
  return true;
}

function run(item: RankedView | undefined, action?: string): void {
  if (!item) return;
  const q = currentQuery();
  if (item.kind === 'scope') {
    complete(item);
    return;
  }
  if (item.id === AI_DO) {
    vscode.postMessage({ type: 'ai', text: q.term });
    return;
  }
  if (item.id === AI_ASK) {
    vscode.postMessage({ type: 'run', id: 'ai:ask', args: q.term });
    return;
  }
  // Items that take arguments complete inline first so the arguments can be typed right here; optional ones just run.
  if (!action && item.args && item.args.required !== false && item.argText === undefined && item.name) {
    complete(item);
    return;
  }
  vscode.postMessage({ type: 'run', id: item.id, args: item.argText ?? '', action });
}

function openMenu(item: RankedView | undefined): void {
  if (!item || item.kind === 'scope' || item.kind === 'ai' || !data) return;
  const actions = [...(item.actions ?? []), ...data.commonActions];
  menu = { item, actions, active: 0 };
  renderMenu();
}

function renderMenu(): void {
  if (!menu) {
    actionsEl.hidden = true;
    return;
  }
  const own = menu.item.actions?.length ?? 0;
  actionsEl.hidden = false;
  actionsEl.innerHTML =
    `<div class="head">${esc(menu.item.title)}</div>` +
    menu.actions
      .map(
        (a, i) =>
          `${i === own && own ? '<hr>' : ''}<div class="action${i === menu!.active ? ' active' : ''}${a.danger ? ' danger' : ''}" data-a="${i}" role="menuitem">${icon(a.icon)}<span class="grow">${esc(a.title)}</span>${i === 0 && own ? '<kbd>↵</kbd>' : ''}</div>`,
      )
      .join('');
  actionsEl.querySelector('.action.active')?.scrollIntoView({ block: 'nearest' });
}

function renderFooter(): void {
  if (!data) return;
  const ctx = data.context.hasSelection
    ? `${icon('cursor-text')} Selection${data.context.fileName ? ` in ${esc(data.context.fileName)}` : ''}`
    : data.context.fileName
      ? `${icon('file')} ${esc(data.context.fileName)}`
      : `${icon('lightning')} Slashi`;
  footer.innerHTML = `
    <span class="context">${ctx}</span>
    <span class="grow"></span>
    ${data.aiEnabled ? `<span class="ai" title="AI model">${icon('sparkle')} ${esc(data.aiLabel || 'AI not set up')}</span>` : ''}
    <span class="hint"><kbd>↵</kbd> Run</span>
    <span class="hint optional"><kbd>⇧</kbd><kbd>↵</kbd> Actions</span>
    <span class="hint optional tab"><kbd>Tab</kbd> Complete</span>
    <span class="hint"><kbd>Esc</kbd> Close</span>`;
}

input.addEventListener('input', update);

document.addEventListener(
  'keydown',
  (e) => {
    if (menu) {
      const total = menu.actions.length;
      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) menu.active = (menu.active + 1) % total;
      else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) menu.active = (menu.active - 1 + total) % total;
      else if (e.key === 'Enter') run(menu.item, menu.actions[menu.active].id);
      else if (e.key === 'Escape' || e.key === 'ArrowLeft') menu = undefined;
      else return;
      e.preventDefault();
      e.stopPropagation();
      renderMenu();
      return;
    }
    const item = selectable[active];
    switch (e.key) {
      case 'ArrowDown':
        setActive(active + 1);
        break;
      case 'ArrowUp':
        setActive(active - 1);
        break;
      case 'PageDown':
        setActive(Math.min(active + 8, selectable.length - 1));
        break;
      case 'PageUp':
        setActive(Math.max(active - 8, 0));
        break;
      case 'n':
      case 'j':
        if (!e.ctrlKey) return;
        setActive(active + 1);
        break;
      case 'p':
      case 'k':
        if (!e.ctrlKey) return;
        setActive(active - 1);
        break;
      case 'Tab':
        if (!complete(item)) return e.preventDefault();
        break;
      case 'ArrowRight':
        if (input.selectionStart !== input.value.length || !item?.actions?.length) return;
        openMenu(item);
        break;
      case 'Enter': {
        const term = currentQuery().term;
        if ((isMac ? e.metaKey : e.ctrlKey) && term && data?.aiEnabled)
          vscode.postMessage(data.nlEnabled ? { type: 'ai', text: term } : { type: 'run', id: 'ai:ask', args: term });
        else if (e.shiftKey) openMenu(item);
        else if (e.altKey && item?.actions?.length) run(item, item.actions[0].id);
        else run(item);
        break;
      }
      case 'Escape':
        if (input.value && input.value !== '/') {
          input.value = '';
          update();
        } else vscode.postMessage({ type: 'close' });
        break;
      default:
        if (document.activeElement !== input && e.key.length === 1 && !e.ctrlKey && !e.metaKey) input.focus();
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

results.addEventListener('mousemove', (e) => {
  mouseMoved = true;
  const row = (e.target as HTMLElement).closest<HTMLElement>('.row');
  if (row && Number(row.dataset.i) !== active) setActive(Number(row.dataset.i), false);
});
results.addEventListener('click', (e) => {
  const row = (e.target as HTMLElement).closest<HTMLElement>('.row');
  if (row && mouseMoved) run(selectable[Number(row.dataset.i)]);
  input.focus();
});
actionsEl.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.action');
  if (el && menu) run(menu.item, menu.actions[Number(el.dataset.a)].id);
});
window.addEventListener('focus', () => input.focus());

vscode.postMessage({ type: 'ready' });
