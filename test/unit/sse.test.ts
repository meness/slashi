import { describe, expect, it } from 'vitest';
import { openAiDelta, SseParser } from '../../src/core/sse';

describe('SseParser', () => {
  it('parses events split across chunks', () => {
    const p = new SseParser();
    expect(p.push('data: {"a":')).toEqual([]);
    expect(p.push('1}\n\nevent: x\ndata: one\ndata: two\n\n: comment\n\n')).toEqual([
      { event: undefined, data: '{"a":1}' },
      { event: 'x', data: 'one\ntwo' },
    ]);
    expect(p.push('data: tail')).toEqual([]);
    expect(p.flush()).toEqual([{ event: undefined, data: 'tail' }]);
  });

  it('handles CRLF', () => {
    expect(new SseParser().push('data: hi\r\n\r\n')).toEqual([{ event: undefined, data: 'hi' }]);
  });
});

describe('openAiDelta', () => {
  it('extracts content deltas', () => {
    expect(openAiDelta('{"choices":[{"delta":{"content":"Hi"}}]}')).toBe('Hi');
    expect(openAiDelta('[DONE]')).toBeUndefined();
    expect(openAiDelta('garbage')).toBeUndefined();
  });
});
