import { describe, expect, it } from 'vitest';
import type { ItemView } from '../../src/core/protocol';
import { parseQuery } from '../../src/core/query';
import { frecencyBonus, indexItems, mergeRanked, rank, scoreWord } from '../../src/core/search';

const item = (id: string, name: string, title: string, extra: Partial<ItemView> = {}): ItemView => ({
  id,
  name,
  title,
  icon: 'lightning',
  providerId: 'commands',
  category: 'Commands',
  ...extra,
});

const items: ItemView[] = [
  item('format', 'format', 'Format Document'),
  item('formatWith', 'format-with', 'Format Document With…'),
  item('fontSize', '', 'Editor: Font Size', { providerId: 'settings', category: 'Settings', keywords: ['editor.fontSize'] }),
  item('run', 'run', 'Run in Terminal', { args: { placeholder: 'command' }, providerId: 'terminal', category: 'Terminal' }),
  item('upper', 'upper', 'UPPERCASE', { category: 'Text', description: 'Convert selection to upper case' }),
  item('toggleTerm', '', 'View: Toggle Terminal'),
];
const index = indexItems(items);
const q = (s: string) => parseQuery(s, []);

describe('scoreWord', () => {
  it('prefers contiguous and boundary matches', () => {
    const contiguous = scoreWord('font', 'Editor: Font Size', 'editor: font size')!;
    const scattered = scoreWord('fsz', 'Editor: Font Size', 'editor: font size')!;
    expect(contiguous.score).toBeGreaterThan(scattered.score);
  });

  it('returns positions for highlighting', () => {
    expect(scoreWord('font', 'Editor: Font Size', 'editor: font size', true)!.positions).toEqual([8, 9, 10, 11]);
  });

  it('matches camelCase humps', () => {
    expect(scoreWord('fs', 'fontSize', 'fontsize')).toBeDefined();
  });

  it('rejects non-subsequences', () => {
    expect(scoreWord('xyz', 'Format', 'format')).toBeUndefined();
  });
});

describe('rank', () => {
  it('ranks exact slash names first', () => {
    const results = rank(index, q('/format'), { limit: 10 });
    expect(results[0].id).toBe('format');
    expect(results[1].id).toBe('formatWith');
  });

  it('requires every word to match', () => {
    const results = rank(index, q('font size'), { limit: 10 });
    expect(results.map((r) => r.id)).toEqual(['fontSize']);
  });

  it('finds settings by key keywords', () => {
    expect(rank(index, q('fontsize'), { limit: 10 })[0].id).toBe('fontSize');
  });

  it('passes arguments to items that accept them', () => {
    const [top] = rank(index, q('/run npm test'), { limit: 10 });
    expect(top.id).toBe('run');
    expect(top.argText).toBe('npm test');
  });

  it('boosts frequently used items', () => {
    const now = Date.now();
    const plain = rank(index, q('term'), { limit: 10 });
    expect(plain[0].id).toBe('run');
    const boosted = rank(index, q('term'), { limit: 10, now, frecency: { toggleTerm: { c: 20, t: now } } });
    expect(boosted[0].id).toBe('toggleTerm');
  });

  it('matches descriptions as a last resort', () => {
    expect(rank(index, q('selection'), { limit: 10 })[0].id).toBe('upper');
  });

  it('returns all items sorted by frecency for an empty query', () => {
    const now = Date.now();
    const results = rank(index, q('/'), { limit: 3, now, frecency: { upper: { c: 3, t: now } } });
    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('upper');
  });

  it('supports any-word mode for recall', () => {
    const results = rank(index, q('font banana'), { limit: 10, mode: 'any' });
    expect(results.map((r) => r.id)).toContain('fontSize');
  });

  it('ranks 20k items quickly', () => {
    const big = indexItems(
      Array.from({ length: 20_000 }, (_, i) => item(`i${i}`, `cmd-${i}`, `Some Command Number ${i} ${i % 7 ? 'alpha' : 'beta'}`)),
    );
    const start = performance.now();
    rank(big, q('some beta 19'), { limit: 60 });
    expect(performance.now() - start).toBeLessThan(250);
  });
});

describe('frecency + merge', () => {
  it('decays with age', () => {
    const now = Date.now();
    expect(frecencyBonus({ c: 5, t: now }, now)).toBeGreaterThan(frecencyBonus({ c: 5, t: now - 30 * 864e5 }, now));
    expect(frecencyBonus(undefined, now)).toBe(0);
  });

  it('merges by best score', () => {
    const a = { ...items[0], score: 5 };
    const b = { ...items[0], score: 9 };
    const c = { ...items[1], score: 7 };
    expect(mergeRanked([[a, c], [b]], 10).map((r) => [r.id, r.score])).toEqual([
      ['format', 9],
      ['formatWith', 7],
    ]);
  });
});
