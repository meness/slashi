export interface DebugEntry {
  name: string;
  detail: string;
}

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)) : [];

/** Named debug configurations and compounds from `launch.json` (the `launch` configuration section). */
export function parseLaunchConfigs(configurations: unknown, compounds: unknown): DebugEntry[] {
  const seen = new Set<string>();
  const out: DebugEntry[] = [];
  const add = (raw: unknown, detail: string) => {
    // The debugger matches names verbatim, so keep them untrimmed; only blank ones are dropped.
    const name = typeof raw === 'string' && raw.trim() ? raw : '';
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ name, detail });
  };
  for (const c of list(configurations)) add(c.name, [c.type, c.request].filter((s) => typeof s === 'string').join(' · '));
  for (const c of list(compounds)) {
    const n = Array.isArray(c.configurations) ? c.configurations.length : 0;
    add(c.name, `compound · ${n} configuration${n === 1 ? '' : 's'}`);
  }
  return out;
}
