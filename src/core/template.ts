// `${variable}` expansion for custom commands and packs.

export type VariableResolver = (name: string) => string | undefined;

/** Quotes a value for POSIX shells and PowerShell alike (single quotes, doubled/escaped). */
export function shellQuote(value: string, shell: 'posix' | 'powershell' | 'cmd' = 'posix'): string {
  if (shell === 'powershell') return `'${value.replace(/'/g, "''")}'`;
  if (shell === 'cmd') return `"${value.replace(/"/g, '""')}"`;
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Expands `${name}`, `${name:default}` and `${q:name}` (shell-quoted).
 * Unknown variables expand to their default or an empty string. `$${x}` escapes to a literal `${x}`.
 */
export function expandTemplate(
  template: string,
  resolve: VariableResolver,
  quote: (value: string) => string = (v) => shellQuote(v),
): string {
  return template.replace(/\$?\$\{([^}]+)\}/g, (match, body: string) => {
    if (match.startsWith('$$')) return match.slice(1);
    let quoted = false;
    let expr = body.trim();
    if (expr.startsWith('q:')) {
      quoted = true;
      expr = expr.slice(2);
    }
    // `env:NAME` and `input:NAME` keep their colon; anything else may carry a default.
    let name = expr;
    let fallback = '';
    const prefixed = /^(env|input|config):/.test(expr);
    const colon = prefixed ? expr.indexOf(':', expr.indexOf(':') + 1) : expr.indexOf(':');
    if (colon !== -1) {
      name = expr.slice(0, colon);
      fallback = expr.slice(colon + 1);
    }
    const value = resolve(name) ?? fallback;
    return quoted ? quote(value) : value;
  });
}

/** Names referenced by a template, e.g. to know whether `${args}` must be asked for. */
export function templateVariables(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(/(?<!\$)\$\{(?:q:)?([^}:]+(?::[^}:]+)?)/g)) {
    const raw = m[1];
    names.add(/^(env|input|config):/.test(raw) ? raw : raw.split(':')[0]);
  }
  return Array.from(names);
}
