import { describe, expect, it } from 'vitest';
import { buildIntentPrompt, extractJson, parseIntentResponse, validatePlan } from '../../src/core/intent';

describe('intent', () => {
  it('builds a prompt listing the catalog and context', () => {
    const { system, user } = buildIntentPrompt('make the font bigger', [{ id: 'set:editor.fontSize', title: 'Editor: Font Size', kind: 'setting', hint: 'number' }], {
      os: 'macOS',
      languageId: 'typescript',
      hasSelection: false,
      stack: ['pnpm', 'Next.js'],
    });
    expect(system).toContain('macOS');
    expect(system).toContain('pnpm, Next.js');
    expect(user).toContain('- set:editor.fontSize | setting | Editor: Font Size (number)');
    expect(user).toContain('Request: make the font bigger');
  });

  it('extracts JSON from fenced or chatty output', () => {
    expect(extractJson('Sure!\n```json\n{"a": "}"}\n```')).toEqual({ a: '}' });
    expect(extractJson('Plan: {"a": {"b": 1}} done')).toEqual({ a: { b: 1 } });
    expect(() => extractJson('no json here')).toThrow();
    expect(() => extractJson('{"a": 1')).toThrow();
  });

  it('parses and filters malformed steps', () => {
    const plan = parseIntentResponse(
      JSON.stringify({
        reply: 'ok',
        steps: [
          { type: 'item', id: 'cmd:a', args: '' },
          { type: 'setting', key: 'editor.fontSize', value: 16 },
          { type: 'terminal', command: '  npm test ' },
          { type: 'terminal', command: '' },
          { type: 'bogus' },
          null,
        ],
      }),
    );
    expect(plan.steps).toEqual([
      { type: 'item', id: 'cmd:a', args: undefined, why: undefined },
      { type: 'setting', key: 'editor.fontSize', value: 16, why: undefined },
      { type: 'terminal', command: 'npm test', why: undefined },
    ]);
  });

  it('drops invented ids and settings', () => {
    const result = validatePlan(
      { reply: '', steps: [{ type: 'item', id: 'cmd:real' }, { type: 'item', id: 'cmd:fake' }, { type: 'setting', key: 'nope', value: 1 }] },
      new Set(['cmd:real']),
      new Set(['editor.fontSize']),
    );
    expect(result.steps).toHaveLength(1);
    expect(result.dropped).toHaveLength(2);
  });
});

describe('model output edge cases', () => {
  it('ignores braces and escaped quotes inside strings', () => {
    expect(extractJson('{"reply": "use \\"}\\" here", "steps": []} trailing }')).toEqual({ reply: 'use "}" here', steps: [] });
  });

  it('keeps at most 10 steps from a plan', () => {
    const steps = Array.from({ length: 12 }, (_, i) => ({ type: 'item' as const, id: `i${i}` }));
    const plan = validatePlan({ reply: '', steps }, new Set(steps.map((s) => s.id)), new Set());
    expect(plan.steps).toHaveLength(10);
  });
});
