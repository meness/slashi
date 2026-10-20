// Fuzzy ranking shared by the extension host and the Spotlight webview.
// Pure and dependency-free so it runs in Node and the browser.

import type { FrecencyMap, ItemView, RankedView } from './protocol';
import type { ParsedQuery } from './query';

const SEPARATORS = new Set([' ', '-', '_', '.', '/', '\\', ':', '(', ')', '[', ']', ',', '@']);

export interface FieldMatch {
  score: number;
  positions?: number[];
}

/**
 * Scores `word` (lower-case) against `text`/`lower` (same string, lower-cased once by the caller).
 * Contiguous matches beat scattered ones; matches at word starts and camelCase humps get a bonus.
 * Returns `undefined` when `word` is not a subsequence of `text`.
 */
export function scoreWord(word: string, text: string, lower: string, wantPositions = false): FieldMatch | undefined {
  if (!word.length) return { score: 0 };
  if (word.length > lower.length) return undefined;

  const index = lower.indexOf(word);
  if (index !== -1) {
    // Prefer the first occurrence at a word boundary, if any.
    let at = index;
    if (!isBoundary(text, at)) {
      let next = lower.indexOf(word, at + 1);
      while (next !== -1 && !isBoundary(text, next)) next = lower.indexOf(word, next + 1);
      if (next !== -1) at = next;
    }
    let score = 60 + word.length * 4;
    if (at === 0) score += 30;
    else if (isBoundary(text, at)) score += 20;
    else score -= Math.min(at, 15);
    if (word.length === lower.length) score += 40;
    return { score, positions: wantPositions ? range(at, word.length) : undefined };
  }

  // Subsequence match with boundary/consecutive bonuses.
  let score = 0;
  let ti = 0;
  let prev = -2;
  const positions: number[] | undefined = wantPositions ? [] : undefined;
  for (let wi = 0; wi < word.length; wi++) {
    const ch = word.charCodeAt(wi);
    let found = -1;
    // Prefer a boundary occurrence for this character.
    for (let j = ti; j < lower.length; j++) {
      if (lower.charCodeAt(j) === ch) {
        if (found === -1) found = j;
        if (j === prev + 1 || isBoundary(text, j)) {
          found = j;
          break;
        }
      }
    }
    if (found === -1) return undefined;
    if (found === prev + 1) score += 6;
    else if (isBoundary(text, found)) score += 8;
    else score += 1;
    if (found === 0) score += 6;
    score -= Math.min(found - ti, 6) * 0.5;
    positions?.push(found);
    prev = found;
    ti = found + 1;
  }
  // Scattered matches of short words are mostly noise.
  if (word.length <= 2 && score < 12) return undefined;
  return { score, positions };
}

function isBoundary(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  if (SEPARATORS.has(prev)) return true;
  const cur = text[i];
  // camelCase hump
  return cur >= 'A' && cur <= 'Z' && prev >= 'a' && prev <= 'z';
}

function range(start: number, length: number): number[] {
  const out = new Array<number>(length);
  for (let i = 0; i < length; i++) out[i] = start + i;
  return out;
}

/** Pre-lowered fields so ranking never lower-cases in the hot loop. */
export interface IndexedItem {
  item: ItemView;
  name: string;
  title: string;
  titleLower: string;
  keywords: string;
  category: string;
  description: string;
}

export function indexItems(items: readonly ItemView[]): IndexedItem[] {
  return items.map((item) => ({
    item,
    name: item.name.toLowerCase(),
    title: item.title,
    titleLower: item.title.toLowerCase(),
    keywords: (item.keywords ?? []).join(' ').toLowerCase(),
    category: item.category.toLowerCase(),
    description: (item.description ?? '').toLowerCase(),
  }));
}

const WEIGHT = { name: 1.25, title: 1, keywords: 0.75, category: 0.45, description: 0.35 };

/** Bonus for things you run often and recently. Max ≈ 45. */
export function frecencyBonus(entry: { c: number; t: number } | undefined, now: number): number {
  if (!entry) return 0;
  const ageHours = (now - entry.t) / 3_600_000;
  const recency = ageHours < 1 ? 4 : ageHours < 24 ? 2.5 : ageHours < 24 * 7 ? 1.5 : 1;
  return Math.min(45, Math.log2(1 + entry.c) * 6 * recency);
}

export interface RankOptions {
  limit: number;
  frecency?: FrecencyMap;
  now?: number;
  /** Require every word to match (default) or any word (used for AI candidate recall). */
  mode?: 'all' | 'any';
}

/** Ranks indexed items against a parsed query. Items matching no word are dropped. */
export function rank(index: readonly IndexedItem[], query: ParsedQuery, options: RankOptions): RankedView[] {
  const { limit, frecency, now = Date.now(), mode = 'all' } = options;
  const words = query.words;
  const results: RankedView[] = [];

  if (!words.length) {
    for (const entry of index) {
      const bonus = frecencyBonus(frecency?.[entry.item.id], now) + (entry.item.boost ?? 0);
      results.push({ ...entry.item, score: bonus });
    }
    return topN(results, limit);
  }

  for (const entry of index) {
    let total = 0;
    let matched = 0;
    let highlights: number[] | undefined;
    let argText: string | undefined;

    // `/run npm test` — exact name match for an item that takes arguments.
    if (entry.item.args && entry.name && entry.name === query.head) {
      total = 400;
      argText = query.rest;
      matched = words.length;
      highlights = undefined;
    } else {
      for (let w = 0; w < words.length; w++) {
        const word = words[w];
        let best = 0;
        let bestPositions: number[] | undefined;
        // An exact or prefix name match is the strongest signal.
        if (entry.name) {
          if (entry.name === word) best = 220;
          else if (entry.name.startsWith(word)) best = 140 + word.length * 4;
          else {
            const m = scoreWord(word, entry.name, entry.name);
            if (m) best = m.score * WEIGHT.name;
          }
        }
        const t = scoreWord(word, entry.title, entry.titleLower, true);
        if (t && t.score * WEIGHT.title >= best) {
          best = t.score * WEIGHT.title;
          bestPositions = t.positions;
        } else if (t && t.positions) {
          bestPositions = t.positions;
        }
        const k = entry.keywords ? scoreWord(word, entry.keywords, entry.keywords) : undefined;
        if (k && k.score * WEIGHT.keywords > best) best = k.score * WEIGHT.keywords;
        const c = scoreWord(word, entry.category, entry.category);
        if (c && c.score * WEIGHT.category > best) best = c.score * WEIGHT.category;
        if (best === 0 && entry.description && word.length > 2) {
          const idx = entry.description.indexOf(word);
          if (idx !== -1) best = (40 + word.length * 2) * WEIGHT.description;
        }
        if (best > 0) {
          matched++;
          total += best;
          if (bestPositions) highlights = highlights ? highlights.concat(bestPositions) : bestPositions;
        } else if (mode === 'all') {
          total = -1;
          break;
        }
      }
    }

    if (total <= 0 || matched === 0) continue;
    total += frecencyBonus(frecency?.[entry.item.id], now) + (entry.item.boost ?? 0);
    // Shorter titles win ties: "Format Document" over "Format Document With…".
    total -= entry.title.length * 0.05;
    results.push({ ...entry.item, score: total, highlights: dedupe(highlights), argText });
  }
  return topN(results, limit);
}

function dedupe(values: number[] | undefined): number[] | undefined {
  if (!values || values.length < 2) return values;
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function topN(results: RankedView[], limit: number): RankedView[] {
  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return results.length > limit ? results.slice(0, limit) : results;
}

/** Merges already-ranked lists, keeping the best score per id. */
export function mergeRanked(lists: readonly RankedView[][], limit: number): RankedView[] {
  const byId = new Map<string, RankedView>();
  for (const list of lists) {
    for (const item of list) {
      const existing = byId.get(item.id);
      if (!existing || existing.score < item.score) byId.set(item.id, item);
    }
  }
  return topN(Array.from(byId.values()), limit);
}
