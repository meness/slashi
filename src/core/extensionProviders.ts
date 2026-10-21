// Validation for providers that other extensions register through `SlashiApi.registerProvider`.
// Everything an extension hands us is checked here, so one bad item can't break the popup.
import { NAME_PATTERN } from './commandSchema';
import type { ExtensionProviderId } from './protocol';

/** `publisher.name`, the form of every VS Code extension ID. */
export const EXTENSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i;
/** Items kept per provider; the rest are dropped with a warning. */
export const MAX_PROVIDER_ITEMS = 2000;

export interface ProviderItemDef {
  id: string;
  title: string;
  name?: string;
  description?: string;
  badge?: string;
  icon?: string;
  keywords?: string[];
  args?: string;
  run(args: string): unknown;
}

const isString = (v: unknown): v is string => typeof v === 'string';
const ICON_PATTERN = /^[a-z0-9-]+$/;

export function extensionProviderId(extensionId: string, id: string): ExtensionProviderId {
  return `ext:${extensionId.toLowerCase()}/${id}`;
}

export function isExtensionProviderId(id: string): id is ExtensionProviderId {
  return id.startsWith('ext:');
}

/** Problems with a provider definition. `taken` holds the scope prefixes already in use. */
export function validateProviderDef(raw: unknown, taken: ReadonlySet<string>): string[] {
  if (!raw || typeof raw !== 'object') return ['provider: must be an object'];
  const d = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (!isString(d.extensionId) || !EXTENSION_ID_PATTERN.test(d.extensionId))
    errors.push('extensionId: must be your extension ID, e.g. acme.jira');
  if (!isString(d.id) || !NAME_PATTERN.test(d.id)) errors.push('id: use 1–40 lower-case letters, digits or dashes');
  if (!isString(d.title) || !d.title.trim()) errors.push('title: is required');
  if (!isString(d.prefix) || !NAME_PATTERN.test(d.prefix)) errors.push('prefix: use 1–40 lower-case letters, digits or dashes');
  else if (taken.has(d.prefix)) errors.push(`prefix: /${d.prefix} is already used by another provider`);
  if (typeof d.items !== 'function') errors.push('items: must be a function');
  if (d.onDidChange !== undefined && typeof d.onDidChange !== 'function') errors.push('onDidChange: must be an event');
  return errors;
}

/** Keeps the valid items an extension returned, with a reason for each one dropped. */
export function normalizeProviderItems(raw: unknown, max = MAX_PROVIDER_ITEMS): { items: ProviderItemDef[]; errors: string[] } {
  if (!Array.isArray(raw)) return { items: [], errors: ['items() must return an array'] };
  const items: ProviderItemDef[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const [i, entry] of raw.entries()) {
    const e = (entry ?? {}) as Record<string, unknown>;
    if (!isString(e.id) || !e.id || !isString(e.title) || !e.title.trim() || typeof e.run !== 'function') {
      errors.push(`items[${i}]: id, title and run are required`);
      continue;
    }
    if (ids.has(e.id)) {
      errors.push(`items[${i}]: duplicate id “${e.id}”`);
      continue;
    }
    if (items.length === max) {
      errors.push(`only the first ${max} items are shown`);
      break;
    }
    if (e.name !== undefined && (!isString(e.name) || !NAME_PATTERN.test(e.name)))
      errors.push(`items[${i}]: name ${JSON.stringify(e.name)} is not a valid slash name, so it is only reachable by search`);
    ids.add(e.id);
    items.push({
      id: e.id,
      title: e.title,
      name: isString(e.name) && NAME_PATTERN.test(e.name) ? e.name : undefined,
      description: isString(e.description) ? e.description : undefined,
      badge: isString(e.badge) ? e.badge : undefined,
      icon: isString(e.icon) && ICON_PATTERN.test(e.icon) ? e.icon : undefined,
      keywords: Array.isArray(e.keywords) ? e.keywords.filter(isString) : undefined,
      args: isString(e.args) && e.args.trim() ? e.args : undefined,
      run: e.run as ProviderItemDef['run'],
    });
  }
  return { items, errors };
}
