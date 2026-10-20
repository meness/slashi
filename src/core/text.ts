// Small text helpers shared by the host and the webviews.

/** Removes a single wrapping Markdown code fence from model output meant to be code. */
export function stripFences(text: string): string {
  const m = /^\s*```[\w+-]*\s*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return m ? m[1] : text.trim();
}

/** JSON.parse that tolerates whole-line `//` comments (team files, deno.jsonc…). Throws on invalid JSON. */
export function parseJsonc(text: string): unknown {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
}
