// Custom commands, action packs and registry indexes: types + validation (no JSON-schema runtime needed).

export type StepDef =
  | { command: string; args?: unknown }
  | { slash: string }
  | { terminal: string; name?: string; cwd?: string }
  | { setting: string; value: unknown; target?: 'user' | 'workspace' }
  | { insert: string }
  | { open: string }
  | { ai: string; output?: 'panel' | 'replace' | 'insert' }
  | { notify: string }
  | { input: string; var: string; placeholder?: string }
  | { pick: string[]; var: string; placeholder?: string }
  | { wait: number };

export interface CustomCommandDef {
  name: string;
  title?: string;
  description?: string;
  icon?: string;
  /** Placeholder text; when present the command accepts `${args}`. */
  args?: string;
  /** Only show in these languages (by language ID). */
  languages?: string[];
  steps: StepDef[];
}

export interface PackDef {
  $schema?: string;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  tags?: string[];
  repository?: string;
  commands: CustomCommandDef[];
}

export interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  tags?: string[];
  url: string;
  commands: number;
  /** Pack contains terminal steps. */
  terminal: boolean;
  /** `packDigest` of the pack; installing checks the download against it. */
  sha256?: string;
}

/** Slashi's own registry: the default of `slashi.marketplace.registries`. */
export const OFFICIAL_REGISTRY = 'https://raw.githubusercontent.com/meness/slashi/main/marketplace/index.json';
/** Author name reserved for packs the Slashi maintainers publish in the official registry. */
export const SLASHI_AUTHOR = 'Slashi';

/**
 * Verified = built by Slashi: listed in the official registry under Slashi's name, with a digest that
 * installing checks. Community packs in the same registry are reviewed but not verified.
 */
export function isVerified(registry: string, entry: RegistryEntry): boolean {
  return registry === OFFICIAL_REGISTRY && entry.author === SLASHI_AUTHOR && entry.sha256 !== undefined;
}

/** A pack that claims to be Slashi's but isn't verified. */
export function claimsSlashi(author: string): boolean {
  return /slashi/i.test(author);
}

/**
 * SHA-256 of a pack's parsed JSON, re-serialized: the same in scripts/marketplace.mjs and the extension,
 * whatever the file's whitespace or line endings.
 */
export async function packDigest(raw: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface RegistryIndex {
  version: 1;
  name?: string;
  packs: RegistryEntry[];
}

export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/;
const STEP_KEYS = ['command', 'slash', 'terminal', 'setting', 'insert', 'open', 'ai', 'notify', 'input', 'pick', 'wait'] as const;
export type StepType = (typeof STEP_KEYS)[number];

export function stepType(step: StepDef): StepType {
  for (const key of STEP_KEYS) if (key in step) return key;
  throw new Error('Unknown step');
}

export interface Validation<T> {
  value?: T;
  errors: string[];
}

const isString = (v: unknown): v is string => typeof v === 'string';

export function validateStep(raw: unknown, where: string): Validation<StepDef> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: [`${where}: must be an object`] };
  const s = raw as Record<string, unknown>;
  const kinds = STEP_KEYS.filter((k) => k in s);
  if (kinds.length !== 1) {
    return { errors: [`${where}: must have exactly one of ${STEP_KEYS.join(', ')}`] };
  }
  const kind = kinds[0];
  const errors: string[] = [];
  switch (kind) {
    case 'command':
    case 'slash':
    case 'terminal':
    case 'insert':
    case 'open':
    case 'ai':
    case 'notify':
      if (!isString(s[kind]) || !s[kind].trim()) errors.push(`${where}.${kind}: must be a non-empty string`);
      break;
    case 'setting':
      if (!isString(s.setting) || !/^[\w.-]+$/.test(s.setting)) errors.push(`${where}.setting: must be a setting key`);
      if (!('value' in s)) errors.push(`${where}.value: is required`);
      if (s.target !== undefined && s.target !== 'user' && s.target !== 'workspace')
        errors.push(`${where}.target: must be "user" or "workspace"`);
      break;
    case 'input':
      if (!isString(s.input)) errors.push(`${where}.input: must be a prompt string`);
      if (!isString(s.var) || !/^\w+$/.test(s.var)) errors.push(`${where}.var: must be a variable name`);
      break;
    case 'pick':
      if (!Array.isArray(s.pick) || !s.pick.length || !s.pick.every(isString))
        errors.push(`${where}.pick: must be a non-empty string array`);
      if (!isString(s.var) || !/^\w+$/.test(s.var)) errors.push(`${where}.var: must be a variable name`);
      break;
    case 'wait':
      if (typeof s.wait !== 'number' || s.wait < 0 || s.wait > 60_000) errors.push(`${where}.wait: must be 0–60000 ms`);
      break;
  }
  if (kind === 'ai' && s.output !== undefined && !['panel', 'replace', 'insert'].includes(s.output as string)) {
    errors.push(`${where}.output: must be panel, replace or insert`);
  }
  return errors.length ? { errors } : { value: s as unknown as StepDef, errors };
}

export function validateCommand(raw: unknown, where = 'command'): Validation<CustomCommandDef> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: [`${where}: must be an object`] };
  const c = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (!isString(c.name) || !NAME_PATTERN.test(c.name)) {
    errors.push(`${where}.name: use 1–40 lower-case letters, digits or dashes (got ${JSON.stringify(c.name)})`);
  }
  for (const key of ['title', 'description', 'icon', 'args'] as const) {
    if (c[key] !== undefined && !isString(c[key])) errors.push(`${where}.${key}: must be a string`);
  }
  if (c.languages !== undefined && (!Array.isArray(c.languages) || !c.languages.every(isString))) {
    errors.push(`${where}.languages: must be a string array`);
  }
  if (!Array.isArray(c.steps) || !c.steps.length) {
    errors.push(`${where}.steps: must be a non-empty array`);
  } else {
    c.steps.forEach((step, i) => errors.push(...validateStep(step, `${where}.steps[${i}]`).errors));
  }
  return errors.length ? { errors } : { value: c as unknown as CustomCommandDef, errors };
}

export function validateCommands(raw: unknown, where = 'commands'): { commands: CustomCommandDef[]; errors: string[] } {
  if (!Array.isArray(raw)) return { commands: [], errors: raw === undefined ? [] : [`${where}: must be an array`] };
  const commands: CustomCommandDef[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const result = validateCommand(item, `${where}[${i}]`);
    if (result.value) {
      if (seen.has(result.value.name)) errors.push(`${where}[${i}].name: duplicate name "${result.value.name}"`);
      else {
        seen.add(result.value.name);
        commands.push(result.value);
      }
    }
    errors.push(...result.errors);
  });
  return { commands, errors };
}

export function validatePack(raw: unknown): Validation<PackDef> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['pack: must be a JSON object'] };
  const p = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (!isString(p.id) || !PACK_ID_PATTERN.test(p.id)) errors.push('id: use 2–50 lower-case letters, digits or dashes');
  for (const key of ['name', 'version', 'description', 'author'] as const) {
    if (!isString(p[key]) || !p[key].trim()) errors.push(`${key}: is required`);
  }
  if (isString(p.version) && !/^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/.test(p.version)) errors.push('version: must be semver, e.g. 1.0.0');
  if (p.tags !== undefined && (!Array.isArray(p.tags) || !p.tags.every(isString))) errors.push('tags: must be a string array');
  const { commands, errors: commandErrors } = validateCommands(p.commands, 'commands');
  errors.push(...commandErrors);
  if (!commands.length && !commandErrors.length) errors.push('commands: must contain at least one command');
  return errors.length ? { errors } : { value: { ...(p as unknown as PackDef), commands }, errors };
}

export function validateRegistry(raw: unknown): Validation<RegistryIndex> {
  if (!raw || typeof raw !== 'object') return { errors: ['registry: must be a JSON object'] };
  const r = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (r.version !== 1) errors.push('registry.version: must be 1');
  if (!Array.isArray(r.packs)) errors.push('registry.packs: must be an array');
  const packs: RegistryEntry[] = [];
  if (Array.isArray(r.packs)) {
    r.packs.forEach((e: Record<string, unknown>, i) => {
      if (!e || !isString(e.id) || !isString(e.name) || !isString(e.url) || !isString(e.version)) {
        errors.push(`registry.packs[${i}]: id, name, version and url are required`);
        return;
      }
      packs.push({
        id: e.id,
        name: e.name,
        version: e.version,
        description: isString(e.description) ? e.description : '',
        author: isString(e.author) ? e.author : 'unknown',
        icon: isString(e.icon) ? e.icon : undefined,
        tags: Array.isArray(e.tags) ? e.tags.filter(isString) : [],
        url: e.url,
        commands: typeof e.commands === 'number' ? e.commands : 0,
        terminal: e.terminal === true,
        sha256: isString(e.sha256) && /^[0-9a-f]{64}$/.test(e.sha256) ? e.sha256 : undefined,
      });
    });
  }
  return errors.length && !packs.length
    ? { errors }
    : { value: { version: 1, name: isString(r.name) ? r.name : undefined, packs }, errors };
}

/** Resolves a pack URL relative to its registry index URL. Only HTTPS is allowed (file: only inside a local registry). */
export function resolvePackUrl(indexUrl: string, packUrl: string): string {
  const base = new URL(indexUrl);
  const url = new URL(packUrl, base);
  // Local files are only allowed for local registries (testing), never from a remote index.
  const allowed = base.protocol === 'file:' ? ['file:', 'https:'] : ['https:'];
  if (!allowed.includes(url.protocol)) throw new Error(`Refusing pack URL with protocol ${url.protocol} — ${url.href}`);
  return url.href;
}

/** Compares two semver strings (major.minor.patch only). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[-+]/)[0].split('.').map(Number);
  const pb = b.split(/[-+]/)[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Not just 'terminal': slash (/run), commands (terminal.sendSequence), settings (slashi.customCommands) and
// vscode: URIs can all reach a shell.
const APPROVAL_STEPS: ReadonlySet<StepType> = new Set(['terminal', 'slash', 'command', 'setting', 'open']);

/** Steps a team file or pack may only run after the user approves them. */
export function approvalSteps(def: CustomCommandDef): StepDef[] {
  return def.steps.filter((s) => APPROVAL_STEPS.has(stepType(s)));
}

/**
 * Whether a team file or pack step may expand `${name}`. `${env:…}`, `${config:…}` and `${clipboard}` can hold
 * secrets the approval prompt doesn't show, so they only expand in steps that stay in the editor.
 */
export function sharedVariableAllowed(step: StepDef, name: string): boolean {
  if (!name.startsWith('env:') && !name.startsWith('config:') && name !== 'clipboard') return true;
  const kind = stepType(step);
  return kind === 'insert' || kind === 'notify';
}

/** Human-readable one-liner per step, for install previews and confirmations. */
export function describeStep(step: StepDef): string {
  switch (stepType(step)) {
    case 'command': {
      const s = step as { command: string; args?: unknown };
      return `Run VS Code command ${s.command}${s.args === undefined ? '' : ` with ${JSON.stringify(s.args)}`}`;
    }
    case 'slash':
      return `Run ${(step as { slash: string }).slash}`;
    case 'terminal':
      return `Terminal: ${(step as { terminal: string }).terminal}`;
    case 'setting': {
      const s = step as { setting: string; value: unknown };
      return `Set ${s.setting} = ${JSON.stringify(s.value)}`;
    }
    case 'insert':
      return 'Insert text';
    case 'open':
      return `Open ${(step as { open: string }).open}`;
    case 'ai':
      return `Ask AI: ${(step as { ai: string }).ai.slice(0, 60)}`;
    case 'notify':
      return `Show message`;
    case 'input':
      return `Ask: ${(step as { input: string }).input}`;
    case 'pick':
      return `Pick one of ${(step as { pick: string[] }).pick.length} options`;
    case 'wait':
      return `Wait ${(step as { wait: number }).wait} ms`;
  }
}
