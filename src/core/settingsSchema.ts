// Reads VS Code's settings schema (vscode://schemas/settings/default) into plain setting properties.

/** A setting property as it appears in an extension's `contributes.configuration` or the settings schema. */
export interface SettingProperty {
  type?: string | string[];
  enum?: unknown[];
  enumDescriptions?: string[];
  markdownEnumDescriptions?: string[];
  description?: string;
  markdownDescription?: string;
  deprecationMessage?: string;
  markdownDeprecationMessage?: string;
  /** `6` in the schema, `"language-overridable"` in an extension manifest. */
  scope?: number | string;
}

type Raw = SettingProperty & { $ref?: string; source?: unknown };

/** Core (non-extension, non-deprecated) settings by key. Extension settings carry a `source`. */
export function coreSettingsFromSchema(text: string): Record<string, SettingProperty> {
  let schema: { properties?: Record<string, Raw>; $defs?: Record<string, Raw> };
  try {
    schema = JSON.parse(text);
  } catch {
    return {};
  }
  const resolve = (prop: Raw | undefined): Raw | undefined => {
    // A few hops at most; a deeper chain is a cycle.
    for (let i = 0; i < 8 && prop?.$ref?.startsWith('#/$defs/'); i++) prop = schema.$defs?.[prop.$ref.slice(8)];
    return prop?.$ref ? undefined : prop;
  };
  const out: Record<string, SettingProperty> = {};
  for (const [key, raw] of Object.entries(schema.properties ?? {})) {
    if (key.startsWith('[')) continue;
    const prop = resolve(raw);
    if (!prop || prop.source || prop.deprecationMessage || prop.markdownDeprecationMessage) continue;
    out[key] = prop;
  }
  return out;
}
