import { describe, expect, it } from 'vitest';
import { coreSettingsFromSchema } from '../../src/core/settingsSchema';

const schema = {
  properties: {
    '[plaintext]': { type: 'object', $ref: 'vscode://schemas/settings/resourceLanguage' },
    'editor.fontSize': { $ref: '#/$defs/_1' },
    'editor.formatOnSave': { type: 'boolean', description: 'Format on save.', scope: 6 },
    'editor.old': { type: 'boolean', deprecationMessage: 'Use something else.' },
    'git.enabled': { type: 'boolean', source: { id: 'vscode.git' } },
  },
  $defs: { _1: { $ref: '#/$defs/_2' }, _2: { type: 'number', description: 'Font size.' } },
};

describe('coreSettingsFromSchema', () => {
  it('keeps core settings and resolves $ref chains', () => {
    expect(coreSettingsFromSchema(JSON.stringify(schema))).toEqual({
      'editor.fontSize': { type: 'number', description: 'Font size.' },
      'editor.formatOnSave': { type: 'boolean', description: 'Format on save.', scope: 6 },
    });
  });

  it('skips language blocks, deprecated and extension settings', () => {
    const keys = Object.keys(coreSettingsFromSchema(JSON.stringify(schema)));
    expect(keys).not.toContain('[plaintext]');
    expect(keys).not.toContain('editor.old');
    expect(keys).not.toContain('git.enabled');
  });

  it('returns nothing for malformed or cyclic schemas', () => {
    expect(coreSettingsFromSchema('not json')).toEqual({});
    expect(coreSettingsFromSchema('{"properties":{"a.b":{"$ref":"#/$defs/x"}},"$defs":{"x":{"$ref":"#/$defs/x"}}}')).toEqual({});
  });
});
