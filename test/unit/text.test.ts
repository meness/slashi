import { describe, expect, it } from 'vitest';
import { gitignoreGlobs, innermostRoot } from '../../src/core/paths';
import { addCommand, parseJsonc } from '../../src/core/jsonc';
import { stripFences } from '../../src/core/text';

describe('stripFences', () => {
  it('removes one wrapping fence and keeps the code inside as is', () => {
    expect(stripFences('```bash\nls -la\n```')).toBe('ls -la');
    expect(stripFences('  ```ts\nconst a = 1;\n  b();\n```\n')).toBe('const a = 1;\n  b();');
  });

  it('leaves unfenced or partly fenced text alone, apart from trimming', () => {
    expect(stripFences('  feat: add x\n\nbody  ')).toBe('feat: add x\n\nbody');
    expect(stripFences('see ```a``` and ```b```')).toBe('see ```a``` and ```b```');
  });
});

describe('parseJsonc', () => {
  it('ignores whole-line comments', () => {
    expect(parseJsonc('// team commands\n{\n  // one\n  "commands": [1]\n}')).toEqual({ commands: [1] });
  });

  it('accepts trailing and block comments and trailing commas, like VS Code', () => {
    expect(parseJsonc('{\n  "a": 1, // one\n  /* two */ "b": [2,],\n}')).toEqual({ a: 1, b: [2] });
  });

  it('keeps // inside strings and throws on invalid JSON', () => {
    expect(parseJsonc('{"url": "https://x.dev"}')).toEqual({ url: 'https://x.dev' });
    expect(() => parseJsonc('{"commands": [1}')).toThrow(SyntaxError);
  });
});

describe('addCommand', () => {
  const ship = { name: 'ship', steps: [{ notify: 'x' }] };

  it('appends to the commands array and keeps comments', () => {
    const out = addCommand('// team\n{\n  "commands": [\n    // first\n    { "name": "a", "steps": [] }\n  ]\n}\n', ship);
    expect(out).toContain('// team');
    expect(out).toContain('// first');
    expect((parseJsonc(out) as { commands: { name: string }[] }).commands.map((c) => c.name)).toEqual(['a', 'ship']);
  });

  it('replaces a command with the same name in place', () => {
    const out = addCommand('{"commands": [{"name": "ship", "steps": []}, {"name": "b", "steps": []}]}', ship);
    expect(parseJsonc(out)).toEqual({ commands: [ship, { name: 'b', steps: [] }] });
  });

  it('handles a bare array and a file without commands', () => {
    expect(parseJsonc(addCommand('[]', ship))).toEqual([ship]);
    expect(parseJsonc(addCommand('{"$schema": "x"}', ship))).toEqual({ $schema: 'x', commands: [ship] });
  });
});

describe('innermostRoot', () => {
  const roots = ['/a/app', '/a/app/packages/web', '/a/app-web', 'C:\\repo'];
  const pick = (file: string | undefined) => innermostRoot(file, roots, (r) => r);

  it('matches whole path segments, not string prefixes', () => {
    expect(pick('/a/app-web/src/x.ts')).toBe('/a/app-web');
    expect(pick('/a/app/src/x.ts')).toBe('/a/app');
    expect(innermostRoot('/a/app-web/x.ts', ['/a/app'], (r) => r)).toBeUndefined();
  });

  it('prefers the innermost (nested) root and handles Windows separators', () => {
    expect(pick('/a/app/packages/web/index.ts')).toBe('/a/app/packages/web');
    expect(pick('C:\\repo\\src\\a.ts')).toBe('C:\\repo');
    expect(pick('/a/app')).toBe('/a/app');
  });

  it('returns undefined when nothing contains the file', () => {
    expect(pick('/b/x.ts')).toBeUndefined();
    expect(pick(undefined)).toBeUndefined();
  });
});

describe('gitignoreGlobs', () => {
  it('turns .gitignore lines into exclude globs', () => {
    expect(gitignoreGlobs('# build\n/dist\ntarget/\n*.log\nsrc/gen\n\n!keep.log\n')).toEqual([
      'dist/**',
      'dist',
      '**/target/**',
      '**/*.log/**',
      '**/*.log',
      'src/gen/**',
      'src/gen',
    ]);
  });

  it('skips patterns that would break a {a,b} glob', () => {
    expect(gitignoreGlobs('a,b\n{x}\nweird\\#\n')).toEqual([]);
  });
});
