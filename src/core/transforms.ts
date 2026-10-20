// Pure text tools used by the Text provider.

import { createHash, randomUUID } from 'node:crypto';

export type TransformKind = 'replace' | 'insert' | 'info';
export type TransformGroup = 'case' | 'lines' | 'encode' | 'json' | 'generate' | 'stats';

export interface TextTransform {
  name: string;
  title: string;
  description: string;
  icon: string;
  group: TransformGroup;
  kind: TransformKind;
  keywords?: string[];
  /** Whole document when the selection is empty (line tools), instead of the word under the cursor. */
  wholeDocument?: boolean;
  /** Accepts arguments, e.g. `/lorem 3`. */
  args?: string;
  apply: (text: string, args: string) => string;
}

/** Splits identifiers and phrases into lower-case words: `fooBar-baz qux` → foo bar baz qux. */
export function splitWords(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);

/** Applies a word-level case conversion to each line separately so multi-line selections keep their shape. */
function perLine(text: string, fn: (line: string) => string): string {
  return text
    .split('\n')
    .map((line) => {
      const m = /^(\s*)(.*?)(\s*)$/.exec(line)!;
      return m[2] ? m[1] + fn(m[2]) + m[3] : line;
    })
    .join('\n');
}

export const toCamel = (t: string) =>
  perLine(t, (s) =>
    splitWords(s)
      .map((w, i) => (i ? cap(w) : w))
      .join(''),
  );
export const toPascal = (t: string) => perLine(t, (s) => splitWords(s).map(cap).join(''));
export const toSnake = (t: string) => perLine(t, (s) => splitWords(s).join('_'));
export const toKebab = (t: string) => perLine(t, (s) => splitWords(s).join('-'));
export const toConstant = (t: string) => perLine(t, (s) => splitWords(s).join('_').toUpperCase());
export const toDot = (t: string) => perLine(t, (s) => splitWords(s).join('.'));
export const toTitle = (t: string) => t.replace(/\b([a-z])([a-z]*)/gi, (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase());
export const toSentence = (t: string) => {
  const lower = t.toLowerCase();
  return lower.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
};

function lines(t: string): string[] {
  return t.split(/\r?\n/);
}

export function sortLines(t: string, descending = false): string {
  const out = lines(t).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return (descending ? out.reverse() : out).join('\n');
}

export function uniqueLines(t: string): string {
  return Array.from(new Set(lines(t))).join('\n');
}

export function removeBlankLines(t: string): string {
  return lines(t)
    .filter((l) => l.trim().length)
    .join('\n');
}

export function trimLines(t: string): string {
  return lines(t)
    .map((l) => l.trimEnd())
    .join('\n');
}

export function reverseLines(t: string): string {
  return lines(t).reverse().join('\n');
}

export function numberLines(t: string): string {
  const all = lines(t);
  const width = String(all.length).length;
  return all.map((l, i) => `${String(i + 1).padStart(width, ' ')}. ${l}`).join('\n');
}

export function joinLines(t: string, sep: string): string {
  return lines(t)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(sep || ' ');
}

export function base64Encode(t: string): string {
  return Buffer.from(t, 'utf8').toString('base64');
}

export function base64Decode(t: string): string {
  const clean = t.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('Selection is not valid Base64.');
  return Buffer.from(clean, 'base64').toString('utf8');
}

export function jsonPretty(t: string, indent = 2): string {
  return JSON.stringify(JSON.parse(t), null, indent);
}

export function jsonMinify(t: string): string {
  return JSON.stringify(JSON.parse(t));
}

export function jsonSortKeys(t: string): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(JSON.parse(t)), null, 2);
}

export function escapeJsonString(t: string): string {
  return JSON.stringify(t).slice(1, -1);
}

export function unescapeJsonString(t: string): string {
  return JSON.parse(`"${t.replace(/(^|[^\\])"/g, '$1\\"')}"`) as string;
}

export function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function unescapeHtml(t: string): string {
  return t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

export function lorem(paragraphs: number): string {
  const n = Math.max(1, Math.min(20, Number.isFinite(paragraphs) ? Math.floor(paragraphs) : 1));
  return Array.from({ length: n }, () => LOREM).join('\n\n');
}

export function textStats(t: string): string {
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const lineCount = t.length ? lines(t).length : 0;
  const minutes = Math.max(1, Math.round(words / 230));
  return `${words.toLocaleString()} words · ${t.length.toLocaleString()} characters · ${lineCount.toLocaleString()} lines · ~${minutes} min read`;
}

export const TRANSFORMS: readonly TextTransform[] = [
  {
    name: 'upper',
    title: 'UPPERCASE',
    description: 'Convert selection to upper case',
    icon: 'text-aa',
    group: 'case',
    kind: 'replace',
    apply: (t) => t.toUpperCase(),
  },
  {
    name: 'lower',
    title: 'lowercase',
    description: 'Convert selection to lower case',
    icon: 'text-aa',
    group: 'case',
    kind: 'replace',
    apply: (t) => t.toLowerCase(),
  },
  {
    name: 'title',
    title: 'Title Case',
    description: 'Capitalize Each Word',
    icon: 'text-t',
    group: 'case',
    kind: 'replace',
    apply: toTitle,
  },
  {
    name: 'sentence',
    title: 'Sentence case',
    description: 'Capitalize the first letter of each sentence',
    icon: 'text-align-left',
    group: 'case',
    kind: 'replace',
    apply: toSentence,
  },
  {
    name: 'camel',
    title: 'camelCase',
    description: 'Convert to camelCase',
    icon: 'text-a-underline',
    group: 'case',
    kind: 'replace',
    apply: toCamel,
  },
  {
    name: 'pascal',
    title: 'PascalCase',
    description: 'Convert to PascalCase',
    icon: 'text-a-underline',
    group: 'case',
    kind: 'replace',
    apply: toPascal,
  },
  {
    name: 'snake',
    title: 'snake_case',
    description: 'Convert to snake_case',
    icon: 'text-underline',
    group: 'case',
    kind: 'replace',
    apply: toSnake,
  },
  {
    name: 'kebab',
    title: 'kebab-case',
    description: 'Convert to kebab-case',
    icon: 'minus',
    group: 'case',
    kind: 'replace',
    apply: toKebab,
  },
  {
    name: 'constant',
    title: 'CONSTANT_CASE',
    description: 'Convert to CONSTANT_CASE',
    icon: 'text-b',
    group: 'case',
    kind: 'replace',
    apply: toConstant,
  },
  { name: 'dot', title: 'dot.case', description: 'Convert to dot.case', icon: 'dots-three', group: 'case', kind: 'replace', apply: toDot },
  {
    name: 'sort',
    title: 'Sort Lines',
    description: 'Sort lines A→Z (natural order)',
    icon: 'sort-ascending',
    group: 'lines',
    kind: 'replace',
    wholeDocument: true,
    apply: (t) => sortLines(t),
  },
  {
    name: 'sort-desc',
    title: 'Sort Lines Descending',
    description: 'Sort lines Z→A',
    icon: 'sort-descending',
    group: 'lines',
    kind: 'replace',
    wholeDocument: true,
    apply: (t) => sortLines(t, true),
  },
  {
    name: 'unique',
    title: 'Unique Lines',
    description: 'Remove duplicate lines',
    icon: 'funnel',
    group: 'lines',
    kind: 'replace',
    wholeDocument: true,
    keywords: ['dedupe', 'duplicates'],
    apply: uniqueLines,
  },
  {
    name: 'reverse-lines',
    title: 'Reverse Lines',
    description: 'Reverse line order',
    icon: 'arrows-down-up',
    group: 'lines',
    kind: 'replace',
    wholeDocument: true,
    apply: reverseLines,
  },
  {
    name: 'no-blank',
    title: 'Remove Blank Lines',
    description: 'Delete empty lines',
    icon: 'eraser',
    group: 'lines',
    kind: 'replace',
    wholeDocument: true,
    apply: removeBlankLines,
  },
  {
    name: 'trim',
    title: 'Trim Trailing Whitespace',
    description: 'Remove whitespace at line ends',
    icon: 'scissors',
    group: 'lines',
    kind: 'replace',
    wholeDocument: true,
    apply: trimLines,
  },
  {
    name: 'number-lines',
    title: 'Number Lines',
    description: 'Prefix each line with its number',
    icon: 'list-numbers',
    group: 'lines',
    kind: 'replace',
    apply: numberLines,
  },
  {
    name: 'join',
    title: 'Join Lines',
    description: 'Join lines with a separator (default space)',
    icon: 'arrows-in-line-vertical',
    group: 'lines',
    kind: 'replace',
    args: 'separator, e.g. ", "',
    apply: (t, a) => joinLines(t, a),
  },
  {
    name: 'base64',
    title: 'Base64 Encode',
    description: 'Encode selection as Base64',
    icon: 'binary',
    group: 'encode',
    kind: 'replace',
    apply: base64Encode,
  },
  {
    name: 'unbase64',
    title: 'Base64 Decode',
    description: 'Decode Base64 selection',
    icon: 'binary',
    group: 'encode',
    kind: 'replace',
    apply: base64Decode,
  },
  {
    name: 'urlencode',
    title: 'URL Encode',
    description: 'Percent-encode selection',
    icon: 'link',
    group: 'encode',
    kind: 'replace',
    apply: (t) => encodeURIComponent(t),
  },
  {
    name: 'urldecode',
    title: 'URL Decode',
    description: 'Decode percent-encoded selection',
    icon: 'link-break',
    group: 'encode',
    kind: 'replace',
    apply: (t) => decodeURIComponent(t),
  },
  {
    name: 'html-escape',
    title: 'Escape HTML',
    description: 'Escape <, >, &, quotes',
    icon: 'code',
    group: 'encode',
    kind: 'replace',
    apply: escapeHtml,
  },
  {
    name: 'html-unescape',
    title: 'Unescape HTML',
    description: 'Turn HTML entities back into characters',
    icon: 'code-simple',
    group: 'encode',
    kind: 'replace',
    apply: unescapeHtml,
  },
  {
    name: 'escape',
    title: 'Escape as JSON String',
    description: 'Escape quotes, newlines and backslashes',
    icon: 'quotes',
    group: 'encode',
    kind: 'replace',
    apply: escapeJsonString,
  },
  {
    name: 'unescape',
    title: 'Unescape JSON String',
    description: 'Turn \\n, \\" etc. back into characters',
    icon: 'quotes',
    group: 'encode',
    kind: 'replace',
    apply: unescapeJsonString,
  },
  {
    name: 'sha256',
    title: 'SHA-256 Hash',
    description: 'Replace selection with its SHA-256 hex digest',
    icon: 'fingerprint',
    group: 'encode',
    kind: 'replace',
    keywords: ['hash', 'digest'],
    apply: (t) => createHash('sha256').update(t).digest('hex'),
  },
  {
    name: 'md5',
    title: 'MD5 Hash',
    description: 'Replace selection with its MD5 hex digest',
    icon: 'hash',
    group: 'encode',
    kind: 'replace',
    keywords: ['hash', 'digest'],
    apply: (t) => createHash('md5').update(t).digest('hex'),
  },
  {
    name: 'json',
    title: 'Format JSON',
    description: 'Pretty-print JSON (selection or document)',
    icon: 'brackets-curly',
    group: 'json',
    kind: 'replace',
    wholeDocument: true,
    keywords: ['pretty', 'beautify'],
    apply: (t) => jsonPretty(t),
  },
  {
    name: 'json-min',
    title: 'Minify JSON',
    description: 'Compact JSON onto one line',
    icon: 'brackets-curly',
    group: 'json',
    kind: 'replace',
    wholeDocument: true,
    apply: jsonMinify,
  },
  {
    name: 'json-sort',
    title: 'Sort JSON Keys',
    description: 'Sort object keys recursively',
    icon: 'sort-ascending',
    group: 'json',
    kind: 'replace',
    wholeDocument: true,
    apply: jsonSortKeys,
  },
  {
    name: 'uuid',
    title: 'Insert UUID',
    description: 'Insert a random UUID v4',
    icon: 'identification-badge',
    group: 'generate',
    kind: 'insert',
    keywords: ['guid', 'id'],
    apply: () => randomUUID(),
  },
  {
    name: 'date',
    title: 'Insert Date',
    description: 'Insert today’s date (YYYY-MM-DD)',
    icon: 'calendar-blank',
    group: 'generate',
    kind: 'insert',
    apply: () => new Date().toISOString().slice(0, 10),
  },
  {
    name: 'now',
    title: 'Insert Date & Time',
    description: 'Insert the current ISO timestamp',
    icon: 'clock',
    group: 'generate',
    kind: 'insert',
    keywords: ['timestamp', 'iso'],
    apply: () => new Date().toISOString(),
  },
  {
    name: 'epoch',
    title: 'Insert Unix Timestamp',
    description: 'Insert seconds since epoch',
    icon: 'timer',
    group: 'generate',
    kind: 'insert',
    apply: () => String(Math.floor(Date.now() / 1000)),
  },
  {
    name: 'lorem',
    title: 'Insert Lorem Ipsum',
    description: 'Insert placeholder paragraphs',
    icon: 'article',
    group: 'generate',
    kind: 'insert',
    args: 'paragraphs (default 1)',
    apply: (_t, a) => lorem(Number(a || 1)),
  },
  {
    name: 'count',
    title: 'Count Words & Characters',
    description: 'Word, character and line count of selection or document',
    icon: 'chart-bar',
    group: 'stats',
    kind: 'info',
    wholeDocument: true,
    keywords: ['stats', 'length'],
    apply: textStats,
  },
];
