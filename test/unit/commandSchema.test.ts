import { describe, expect, it } from 'vitest';
import { compareVersions, describeStep, resolvePackUrl, validateCommand, validateCommands, validatePack, validateRegistry } from '../../src/core/commandSchema';

describe('validateCommand', () => {
  it('accepts every step type', () => {
    const { value, errors } = validateCommand({
      name: 'ship',
      steps: [
        { command: 'workbench.action.files.saveAll' },
        { slash: '/upper' },
        { terminal: 'npm test' },
        { setting: 'editor.fontSize', value: 14 },
        { insert: '${date}' },
        { open: 'https://example.com' },
        { ai: 'Explain ${selection}', output: 'panel' },
        { notify: 'Done' },
        { input: 'Name?', var: 'name' },
        { pick: ['a', 'b'], var: 'choice' },
        { wait: 100 },
      ],
    });
    expect(errors).toEqual([]);
    expect(value?.steps).toHaveLength(11);
  });

  it('rejects bad names and steps with clear messages', () => {
    const { errors } = validateCommand({ name: 'Bad Name', steps: [{ command: 'a', terminal: 'b' }, { wait: -1 }, { setting: 'x' }] });
    expect(errors.join('\n')).toMatch(/name/);
    expect(errors.join('\n')).toMatch(/exactly one/);
    expect(errors.join('\n')).toMatch(/wait/);
    expect(errors.join('\n')).toMatch(/value: is required/);
  });

  it('flags duplicate names in a list', () => {
    const { commands, errors } = validateCommands([
      { name: 'a', steps: [{ notify: 'x' }] },
      { name: 'a', steps: [{ notify: 'y' }] },
    ]);
    expect(commands).toHaveLength(1);
    expect(errors[0]).toMatch(/duplicate/);
  });
});

describe('packs and registries', () => {
  const pack = { id: 'demo', name: 'Demo', version: '1.2.0', description: 'd', author: 'me', commands: [{ name: 'hi', steps: [{ notify: 'hi' }] }] };

  it('validates packs', () => {
    expect(validatePack(pack).errors).toEqual([]);
    expect(validatePack({ ...pack, version: 'one' }).errors[0]).toMatch(/semver/);
    expect(validatePack({ ...pack, commands: [] }).errors[0]).toMatch(/at least one/);
  });

  it('validates registries leniently', () => {
    const { value, errors } = validateRegistry({ version: 1, packs: [{ id: 'demo', name: 'Demo', version: '1.0.0', url: 'packs/demo.json' }, { id: 'broken' }] });
    expect(value?.packs).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('resolves relative pack URLs and refuses plain HTTP', () => {
    expect(resolvePackUrl('https://x.dev/market/index.json', 'packs/a.json')).toBe('https://x.dev/market/packs/a.json');
    expect(() => resolvePackUrl('https://x.dev/index.json', 'http://evil.dev/a.json')).toThrow();
    expect(() => resolvePackUrl('https://x.dev/index.json', 'file:///etc/passwd')).toThrow();
    expect(resolvePackUrl('file:///repo/marketplace/index.json', 'packs/a.json')).toBe('file:///repo/marketplace/packs/a.json');
  });

  it('compares versions', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
  });

  it('describes steps for previews', () => {
    expect(describeStep({ terminal: 'rm -rf build' })).toBe('Terminal: rm -rf build');
    expect(describeStep({ setting: 'a.b', value: true })).toBe('Set a.b = true');
  });
});
