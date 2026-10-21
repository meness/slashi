import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { claimsSlashi, isVerified, OFFICIAL_REGISTRY, packDigest, validateRegistry } from '../../src/core/commandSchema';

const entry = {
  id: 'x',
  name: 'X',
  version: '1.0.0',
  description: '',
  author: 'Slashi',
  url: 'packs/x.json',
  commands: 1,
  terminal: false,
};
const digest = 'a'.repeat(64);

describe('verified packs', () => {
  it('hashes the re-serialized JSON, so whitespace and line endings do not matter', async () => {
    const pack = JSON.parse('{\r\n  "id": "x",\r\n  "n": [1, 2]\r\n}');
    expect(await packDigest(pack)).toBe(createHash('sha256').update('{"id":"x","n":[1,2]}').digest('hex'));
  });

  it('verifies only listings from the official registry that carry a digest', () => {
    expect(isVerified(OFFICIAL_REGISTRY, { ...entry, sha256: digest })).toBe(true);
    expect(isVerified(OFFICIAL_REGISTRY, entry)).toBe(false);
    expect(isVerified('https://example.com/index.json', { ...entry, sha256: digest })).toBe(false);
    expect(isVerified(`${OFFICIAL_REGISTRY}?x`, { ...entry, sha256: digest })).toBe(false);
    expect(isVerified(OFFICIAL_REGISTRY, { ...entry, author: 'Jane', sha256: digest })).toBe(false);
  });

  it('flags packs that only claim to be Slashi’s', () => {
    expect(claimsSlashi('Slashi Team')).toBe(true);
    expect(claimsSlashi('Acme')).toBe(false);
  });

  it('reads a registry digest and drops a malformed one', () => {
    const { value } = validateRegistry({
      version: 1,
      packs: [
        { ...entry, sha256: digest },
        { ...entry, id: 'y', sha256: 'nope' },
      ],
    });
    expect(value?.packs.map((p) => p.sha256)).toEqual([digest, undefined]);
  });

  it('the official registry is the default registry', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const setting = pkg.contributes.configuration
      .map((c: { properties: Record<string, { default?: unknown }> }) => c.properties['slashi.marketplace.registries'])
      .find(Boolean);
    expect(setting.default).toEqual([OFFICIAL_REGISTRY]);
  });

  it('every pack in marketplace/index.json matches its digest', async () => {
    const index = JSON.parse(readFileSync('marketplace/index.json', 'utf8'));
    expect(index.packs.length).toBeGreaterThan(0);
    for (const p of index.packs) {
      const pack = JSON.parse(readFileSync(`marketplace/${p.url}`, 'utf8'));
      expect({ id: p.id, sha256: await packDigest(pack) }).toEqual({ id: p.id, sha256: p.sha256 });
    }
  });
});
