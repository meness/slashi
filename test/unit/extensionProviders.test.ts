import { describe, expect, it } from 'vitest';
import { extensionProviderId, isExtensionProviderId, normalizeProviderItems, validateProviderDef } from '../../src/core/extensionProviders';

const run = () => undefined;
const valid = { extensionId: 'acme.jira', id: 'issues', title: 'Jira', prefix: 'jira', items: () => [] };

describe('extension provider ids', () => {
  it('namespaces the id by extension, lower-cased', () => {
    expect(extensionProviderId('Acme.Jira', 'issues')).toBe('ext:acme.jira/issues');
    expect(isExtensionProviderId('ext:acme.jira/issues')).toBe(true);
    expect(isExtensionProviderId('files')).toBe(false);
  });
});

describe('validateProviderDef', () => {
  it('accepts a minimal provider', () => {
    expect(validateProviderDef(valid, new Set(['git']))).toEqual([]);
  });

  it('rejects a taken prefix', () => {
    expect(validateProviderDef(valid, new Set(['jira']))).toEqual(['prefix: /jira is already used by another provider']);
  });

  it('reports every problem at once', () => {
    const errors = validateProviderDef({ extensionId: 'jira', id: 'Issues!', title: ' ', prefix: 'a b', items: [] }, new Set());
    expect(errors.map((e) => e.split(':')[0])).toEqual(['extensionId', 'id', 'title', 'prefix', 'items']);
  });

  it('rejects non-objects and a non-function onDidChange', () => {
    expect(validateProviderDef(undefined, new Set())).toEqual(['provider: must be an object']);
    expect(validateProviderDef({ ...valid, onDidChange: 1 }, new Set())).toEqual(['onDidChange: must be an event']);
  });
});

describe('normalizeProviderItems', () => {
  it('keeps valid items and their optional fields', () => {
    const { items, errors } = normalizeProviderItems([
      { id: 'a', title: 'A', name: 'deploy', icon: 'rocket', keywords: ['x', 1], args: 'env', badge: 'b', description: 'd', run },
    ]);
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({ id: 'a', name: 'deploy', icon: 'rocket', keywords: ['x'], args: 'env', badge: 'b', description: 'd' });
  });

  it('drops broken and duplicate items with a reason', () => {
    const { items, errors } = normalizeProviderItems([
      { id: 'a', title: 'A', run },
      null,
      { id: 'b', title: 'B' },
      { id: 'a', title: 'A2', run },
    ]);
    expect(items.map((i) => i.id)).toEqual(['a']);
    expect(errors).toEqual([
      'items[1]: id, title and run are required',
      'items[2]: id, title and run are required',
      'items[3]: duplicate id “a”',
    ]);
  });

  it('keeps an item with an invalid slash name, searchable only', () => {
    const { items, errors } = normalizeProviderItems([{ id: 'a', title: 'A', name: 'Not Valid', icon: '<b>', args: ' ', run }]);
    expect(items[0]).toMatchObject({ name: undefined, icon: undefined, args: undefined });
    expect(errors).toHaveLength(1);
  });

  it('caps the number of items', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: String(i), title: 'x', run }));
    const { items, errors } = normalizeProviderItems(many, 3);
    expect(items).toHaveLength(3);
    expect(errors).toEqual(['only the first 3 items are shown']);
  });

  it('rejects a non-array result', () => {
    expect(normalizeProviderItems(undefined)).toEqual({ items: [], errors: ['items() must return an array'] });
  });
});
