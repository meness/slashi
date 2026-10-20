import { describe, expect, it } from 'vitest';
import { ClaudeStreamParser } from '../../src/core/claudeStream';

const line = (event: object) => `${JSON.stringify(event)}\n`;
const delta = (text: string) => line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });

describe('ClaudeStreamParser', () => {
  it('streams text deltas, including events split across chunks', () => {
    const p = new ClaudeStreamParser();
    const first = delta('Hel');
    expect(p.push(first.slice(0, 20))).toEqual({ text: '' });
    expect(p.push(first.slice(20) + delta('lo'))).toEqual({ text: 'Hello' });
  });

  it('parses a final event that has no trailing newline', () => {
    const p = new ClaudeStreamParser();
    p.push(delta('Hi'));
    expect(p.push(line({ type: 'result', is_error: true, result: 'Not logged in' }).trimEnd())).toEqual({ text: '' });
    expect(p.flush()).toEqual({ text: '', error: 'Not logged in' });
  });

  it('falls back to the result text when no deltas arrived', () => {
    const p = new ClaudeStreamParser();
    expect(p.push(line({ type: 'result', is_error: false, result: 'Whole answer' }))).toEqual({ text: '', result: 'Whole answer' });
  });

  it('ignores non-JSON lines and other event types', () => {
    const p = new ClaudeStreamParser();
    expect(
      p.push(
        'warning: something\n' +
          line({ type: 'system', subtype: 'init' }) +
          line({ type: 'stream_event', event: { delta: { type: 'input_json_delta', partial_json: '{' } } }),
      ),
    ).toEqual({ text: '' });
    expect(p.flush()).toEqual({ text: '' });
  });

  it('uses a generic message when an error result has no text', () => {
    expect(new ClaudeStreamParser().push(line({ type: 'result', is_error: true }))).toEqual({
      text: '',
      error: 'Claude Code request failed.',
    });
  });
});
