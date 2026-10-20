import { describe, expect, it } from 'vitest';
import { innermostRoot } from '../../src/core/paths';
import { parseJsonc, stripFences } from '../../src/core/text';

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

  it('keeps // inside strings and throws on invalid JSON', () => {
    expect(parseJsonc('{"url": "https://x.dev"}')).toEqual({ url: 'https://x.dev' });
    expect(() => parseJsonc('{"commands": [1,]}')).toThrow();
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
