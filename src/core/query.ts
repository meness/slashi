// Parses what the user typed into the popup.

export interface ParsedQuery {
  /** Original input. */
  raw: string;
  /** Input started with `/`. */
  isSlash: boolean;
  /** Matched scope prefix (lower-case), e.g. `set`. */
  scope?: string;
  /** Search text after the slash and scope. */
  term: string;
  /** First word of the term, lower-case, e.g. `run` for `/run npm test`. */
  head: string;
  /** Everything after the first word, trimmed, e.g. `npm test`. */
  rest: string;
  /** Lower-cased whitespace-separated words of the term. */
  words: string[];
}

/**
 * `/set font size` → scope `set`, term `font size`.
 * A scope only applies when followed by a space so that `/settings` still searches globally.
 */
export function parseQuery(input: string, scopePrefixes: readonly string[]): ParsedQuery {
  const raw = input;
  const trimmed = input.replace(/^\s+/, '');
  const isSlash = trimmed.startsWith('/');
  let body = isSlash ? trimmed.slice(1) : trimmed;
  let scope: string | undefined;

  const scopeMatch = /^(\S+)\s([\s\S]*)$/.exec(body);
  if (scopeMatch) {
    const candidate = scopeMatch[1].toLowerCase();
    if (scopePrefixes.includes(candidate)) {
      scope = candidate;
      body = scopeMatch[2].replace(/^\s+/, '');
    }
  }

  const term = body.trim();
  const headMatch = /^(\S+)(?:\s+([\s\S]*))?$/.exec(term);
  const head = headMatch ? headMatch[1].toLowerCase() : '';
  const rest = headMatch?.[2]?.trim() ?? '';
  const words = term.length ? term.toLowerCase().split(/\s+/) : [];
  return { raw, isSlash, scope, term, head, rest, words };
}

/** Builds the input text for a scope, e.g. `/set `. */
export function scopeInput(prefix: string): string {
  return `/${prefix} `;
}
