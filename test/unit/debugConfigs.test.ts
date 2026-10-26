import { describe, expect, it } from 'vitest';
import { parseLaunchConfigs } from '../../src/core/debugConfigs';

describe('parseLaunchConfigs', () => {
  it('lists configurations and compounds with their type and request', () => {
    expect(
      parseLaunchConfigs(
        [
          { name: 'Server', type: 'node', request: 'launch' },
          { name: 'Attach', type: 'node', request: 'attach' },
        ],
        [{ name: 'All', configurations: ['Server', 'Attach'] }],
      ),
    ).toEqual([
      { name: 'Server', detail: 'node · launch' },
      { name: 'Attach', detail: 'node · attach' },
      { name: 'All', detail: 'compound · 2 configurations' },
    ]);
  });

  it('skips entries without a usable name, and repeated names', () => {
    expect(
      parseLaunchConfigs([{ type: 'node' }, { name: '  ' }, { name: 42 }, null, 'x', { name: 'A' }, { name: 'A' }], undefined),
    ).toEqual([{ name: 'A', detail: '' }]);
  });

  it('returns nothing for missing or malformed input', () => {
    expect(parseLaunchConfigs(undefined, undefined)).toEqual([]);
    expect(parseLaunchConfigs({}, 'nope')).toEqual([]);
  });

  it('describes a one-configuration compound in the singular', () => {
    expect(parseLaunchConfigs([], [{ name: 'Solo', configurations: [{ name: 'A', folder: 'f' }] }])).toEqual([
      { name: 'Solo', detail: 'compound · 1 configuration' },
    ]);
  });

  it('keeps the exact name, since the debugger matches it verbatim', () => {
    expect(parseLaunchConfigs([{ name: ' Padded ' }], undefined)).toEqual([{ name: ' Padded ', detail: '' }]);
  });
});
