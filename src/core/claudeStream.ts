// Incremental parser for `claude -p --output-format stream-json --include-partial-messages` (one JSON event per line).

export interface ClaudeStreamUpdate {
  /** Text deltas finished by this chunk. */
  text: string;
  /** Final answer from the `result` event, for when no deltas were streamed. */
  result?: string;
  error?: string;
}

export class ClaudeStreamParser {
  private buffer = '';

  push(chunk: string): ClaudeStreamUpdate {
    const lines = (this.buffer + chunk).split('\n');
    this.buffer = lines.pop() ?? '';
    return parseLines(lines);
  }

  /** Parses a last event that arrived without a trailing newline. */
  flush(): ClaudeStreamUpdate {
    const rest = this.buffer;
    this.buffer = '';
    return parseLines([rest]);
  }
}

function parseLines(lines: string[]): ClaudeStreamUpdate {
  const update: ClaudeStreamUpdate = { text: '' };
  for (const line of lines) {
    const event = parse(line);
    if (event?.type === 'stream_event' && event.event?.delta?.type === 'text_delta' && typeof event.event.delta.text === 'string') {
      update.text += event.event.delta.text;
    } else if (event?.type === 'result') {
      if (event.is_error) update.error = typeof event.result === 'string' && event.result ? event.result : 'Claude Code request failed.';
      else if (typeof event.result === 'string') update.result = event.result;
    }
  }
  return update;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(line: string): any {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}
