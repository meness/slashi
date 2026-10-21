/** The item whose root folder most closely contains `file` (whole path segments only, `/` or `\`). */
export function innermostRoot<T>(file: string | undefined, items: readonly T[], root: (item: T) => string): T | undefined {
  let best: T | undefined;
  let bestLength = -1;
  for (const item of items) {
    const r = root(item).replace(/[\\/]+$/, '');
    const inside = !!file && (file === r || file.startsWith(`${r}/`) || file.startsWith(`${r}\\`));
    if (inside && r.length > bestLength) {
      best = item;
      bestLength = r.length;
    }
  }
  return best;
}

/**
 * Exclude globs for a `.gitignore`, for `workspace.findFiles`.
 * shortcut: negations (`!x`), escapes and nested .gitignore files are ignored, and in a multi-root workspace every
 * folder's patterns apply to all folders; read real git status if users hit them.
 */
export function gitignoreGlobs(text: string): string[] {
  const globs: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    // `,`, braces and escapes would break the `{a,b}` glob the patterns are joined into.
    if (!line || line.startsWith('#') || line.startsWith('!') || /[{},\\]/.test(line)) continue;
    const dirOnly = line.endsWith('/');
    const pattern = line.replace(/\/+$/, '');
    const anchored = pattern.includes('/');
    const clean = pattern.replace(/^\/+/, '');
    if (!clean) continue;
    const base = anchored ? clean : `**/${clean}`;
    globs.push(`${base}/**`);
    if (!dirOnly) globs.push(base);
  }
  return globs;
}
