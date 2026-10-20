import { describe, expect, it } from 'vitest';
import { recentIds, recordUse } from '../../src/core/frecency';

describe('frecency', () => {
  it('counts uses and tracks recency', () => {
    let map = recordUse({}, 'a', 1);
    map = recordUse(map, 'b', 2);
    map = recordUse(map, 'a', 3);
    expect(map.a).toEqual({ c: 2, t: 3 });
    expect(recentIds(map, 5)).toEqual(['a', 'b']);
  });

  it('prunes to the most recent 400 entries', () => {
    let map = {};
    for (let i = 0; i < 450; i++) map = recordUse(map, `id${i}`, i);
    expect(Object.keys(map)).toHaveLength(400);
    expect(map).not.toHaveProperty('id0');
    expect(map).toHaveProperty('id449');
  });
});
