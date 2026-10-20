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
