// Incremental Server-Sent Events parser (used by the OpenAI-compatible backend).

export interface SseEvent {
  event?: string;
  data: string;
}

export class SseParser {
  private buffer = '';

  /** Feeds a decoded text chunk and returns the complete events it finished. */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    let boundary: RegExpExecArray | null;
    const separator = /\r?\n\r?\n/g;
    let consumed = 0;
    while ((boundary = separator.exec(this.buffer))) {
      const block = this.buffer.slice(consumed, boundary.index);
      consumed = boundary.index + boundary[0].length;
      const event = parseBlock(block);
      if (event) events.push(event);
    }
    this.buffer = this.buffer.slice(consumed);
    return events;
  }

  /** Returns a trailing event without a final blank line, if any. */
  flush(): SseEvent[] {
    const rest = this.buffer;
    this.buffer = '';
    const event = rest.trim() ? parseBlock(rest) : undefined;
    return event ? [event] : [];
  }
}

function parseBlock(block: string): SseEvent | undefined {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (!data.length && !event) return undefined;
  return { event, data: data.join('\n') };
}

/** Extracts the text delta from an OpenAI-style chat completion chunk. */
export function openAiDelta(data: string): string | undefined {
  if (data === '[DONE]') return undefined;
  try {
    const json = JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[] };
    return json.choices?.[0]?.delta?.content ?? undefined;
  } catch {
    return undefined;
  }
}
