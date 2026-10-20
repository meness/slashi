import { describe, expect, it } from 'vitest';
import { parseQuery } from '../../src/core/query';

const scopes = ['set', 'ext', 'f', 'git'];

describe('parseQuery', () => {
  it('parses a plain slash query', () => {
    const q = parseQuery('/format doc', scopes);
    expect(q).toMatchObject({ isSlash: true, scope: undefined, term: 'format doc', head: 'format', rest: 'doc', words: ['format', 'doc'] });
  });

  it('detects a scope only when followed by a space', () => {
    expect(parseQuery('/set font size', scopes)).toMatchObject({ scope: 'set', term: 'font size' });
    expect(parseQuery('/set ', scopes)).toMatchObject({ scope: 'set', term: '', words: [] });
    expect(parseQuery('/settings', scopes).scope).toBeUndefined();
  });

  it('is case-insensitive for scopes and keeps args verbatim', () => {
    const q = parseQuery('/GIT commit -m "Hi There"', scopes);
    expect(q.scope).toBe('git');
    expect(q.rest).toBe('-m "Hi There"');
  });

  it('handles text without a slash', () => {
    expect(parseQuery('  open readme', scopes)).toMatchObject({ isSlash: false, term: 'open readme', head: 'open' });
  });

  it('handles empty input', () => {
    expect(parseQuery('/', scopes)).toMatchObject({ isSlash: true, term: '', head: '', words: [] });
  });
});
