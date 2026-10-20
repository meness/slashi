import type { FrecencyMap } from './protocol';

const MAX_ENTRIES = 400;

/** Returns a new map with `id` recorded as run at `now`, pruned to the most useful entries. */
export function recordUse(map: FrecencyMap, id: string, now: number): FrecencyMap {
  const next: FrecencyMap = { ...map };
  const prev = next[id];
  next[id] = { c: (prev?.c ?? 0) + 1, t: now };
  const ids = Object.keys(next);
  if (ids.length <= MAX_ENTRIES) return next;
  ids.sort((a, b) => next[b].t - next[a].t);
  const pruned: FrecencyMap = {};
  for (const key of ids.slice(0, MAX_ENTRIES)) pruned[key] = next[key];
  return pruned;
}

/** Most recently used ids, newest first. */
export function recentIds(map: FrecencyMap, limit: number): string[] {
  return Object.keys(map)
    .sort((a, b) => map[b].t - map[a].t)
    .slice(0, limit);
}
