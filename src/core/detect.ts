// Detects the technologies a repository uses and generates matching slash commands.
// Pure: the extension host scans the workspace and passes file names + manifest contents in.

export interface DirectoryScan {
  /** Path relative to the workspace folder, '' for the root. Uses forward slashes. */
  dir: string;
  /** File names directly inside `dir`. */
  files: string[];
  /** Contents of manifests we know how to read, keyed by file name. */
  read: Record<string, string>;
}

export type ProjectGroup = 'scripts' | 'packageManager' | 'tools';

export interface ProjectCommand {
  id: string;
  /** Slash name, prefixed with the folder name outside the root: `web:dev`. */
  name: string;
  title: string;
  description: string;
  icon: string;
  tech: string;
  group: ProjectGroup;
  /** Shell command; may contain `${args}` / `${q:args}` / `${file}`. */
  command: string;
  cwd: string;
  /** Placeholder when the command needs arguments. */
  args?: string;
}

export interface DetectionResult {
  /** Human-readable technology names, e.g. `pnpm`, `Next.js`, `Docker`. */
  techs: string[];
  commands: ProjectCommand[];
}

/** Files the scanner should read when present. */
export const MANIFESTS = [
  'package.json',
  'deno.json',
  'deno.jsonc',
  'Makefile',
  'makefile',
  'justfile',
  'Justfile',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'Cargo.toml',
  'go.mod',
  'composer.json',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'mix.exs',
  'pubspec.yaml',
  'Chart.yaml',
] as const;

type Pm = 'npm' | 'pnpm' | 'yarn' | 'bun';

interface Ctx {
  scan: DirectoryScan;
  prefix: string;
  out: ProjectCommand[];
  techs: Set<string>;
}

function add(ctx: Ctx, tech: string, group: ProjectGroup, name: string, title: string, command: string, opts: { icon?: string; description?: string; args?: string } = {}): void {
  // Script and task names from repo files end up in the shell command; skip any that could inject.
  if (!/^[\w:.@/+-]+$/.test(name)) return;
  const fullName = ctx.prefix + name;
  ctx.out.push({
    id: `project:${ctx.scan.dir || '.'}:${tech}:${name}`,
    name: fullName,
    title: ctx.scan.dir ? `${title} — ${ctx.scan.dir}` : title,
    description: opts.description ?? command,
    icon: opts.icon ?? 'terminal-window',
    tech,
    group,
    command,
    cwd: ctx.scan.dir,
    args: opts.args,
  });
}

function has(scan: DirectoryScan, ...names: string[]): boolean {
  return names.some((n) => scan.files.includes(n));
}

function hasExt(scan: DirectoryScan, ...exts: string[]): boolean {
  return scan.files.some((f) => exts.some((e) => f.endsWith(e)));
}

function safeJson(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    // Tolerate JSONC comments in deno.jsonc and friends.
    const cleaned = text.replace(/^\s*\/\/.*$/gm, '');
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function detectPackageManager(scan: DirectoryScan, pkg?: Record<string, unknown>, rootScan?: DirectoryScan): Pm {
  const field = typeof pkg?.packageManager === 'string' ? pkg.packageManager : '';
  for (const pm of ['pnpm', 'yarn', 'bun', 'npm'] as const) if (field.startsWith(pm)) return pm;
  for (const s of [scan, rootScan]) {
    if (!s) continue;
    if (has(s, 'pnpm-lock.yaml', 'pnpm-workspace.yaml')) return 'pnpm';
    if (has(s, 'yarn.lock', '.yarnrc.yml')) return 'yarn';
    if (has(s, 'bun.lockb', 'bun.lock')) return 'bun';
    if (has(s, 'package-lock.json', 'npm-shrinkwrap.json')) return 'npm';
  }
  return 'npm';
}

const RUN: Record<Pm, string> = { npm: 'npm run', pnpm: 'pnpm run', yarn: 'yarn', bun: 'bun run' };
const EXEC: Record<Pm, string> = { npm: 'npx', pnpm: 'pnpm exec', yarn: 'yarn', bun: 'bunx' };
const DLX: Record<Pm, string> = { npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx' };

function nodeProject(ctx: Ctx, pkg: Record<string, unknown>, rootScan: DirectoryScan | undefined): void {
  const pm = detectPackageManager(ctx.scan, pkg, rootScan);
  ctx.techs.add(pm);
  const scripts = (pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {}) as Record<string, string>;
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
  const dep = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);

  // package.json scripts
  for (const [script, body] of Object.entries(scripts)) {
    if (typeof body !== 'string' || /^(pre|post)/.test(script) && scripts[script.replace(/^(pre|post)/, '')]) continue;
    add(ctx, pm, 'scripts', script, `${pm}: ${script}`, `${RUN[pm]} ${script}`, { icon: scriptIcon(script), description: body });
  }

  // Package manager commands
  const P = (name: string, title: string, cmd: string, icon: string, args?: string) =>
    add(ctx, pm, 'packageManager', `${pm}-${name}`, `${pm} ${title}`, cmd, { icon, args });
  const addCmd = { npm: 'npm install', pnpm: 'pnpm add', yarn: 'yarn add', bun: 'bun add' }[pm];
  P('install', 'install', pm === 'yarn' ? 'yarn install' : `${pm} install`, 'download-simple');
  P('ci', 'clean install (frozen lockfile)', { npm: 'npm ci', pnpm: 'pnpm install --frozen-lockfile', yarn: 'yarn install --immutable', bun: 'bun install --frozen-lockfile' }[pm], 'lock-key');
  P('add', 'add package', `${addCmd} \${args}`, 'plus-circle', 'package names, e.g. zod react-query');
  P('add-dev', 'add dev dependency', `${addCmd} -D \${args}`, 'plus-circle', 'package names');
  P('remove', 'remove package', `${{ npm: 'npm uninstall', pnpm: 'pnpm remove', yarn: 'yarn remove', bun: 'bun remove' }[pm]} \${args}`, 'minus-circle', 'package names');
  P('update', 'update packages', `${pm === 'npm' ? 'npm update' : pm === 'yarn' ? 'yarn up' : `${pm} update`}`, 'arrow-circle-up');
  P('outdated', 'list outdated', `${pm === 'yarn' ? 'yarn outdated' : `${pm} outdated`}`, 'list-magnifying-glass');
  if (pm !== 'bun') P('audit', 'security audit', `${pm === 'yarn' ? 'yarn npm audit' : `${pm} audit`}`, 'shield-check');
  if (pm !== 'bun') P('why', 'why is a package installed', `${pm === 'npm' ? 'npm explain' : `${pm} why`} \${args}`, 'question', 'package name');
  P('list', 'list top-level dependencies', `${pm === 'yarn' ? 'yarn info --name-only' : pm === 'bun' ? 'bun pm ls' : `${pm} ls --depth=0`}`, 'list-bullets');
  P('dlx', 'run a package binary (dlx/npx)', `${DLX[pm]} \${args}`, 'rocket-launch', 'command, e.g. create-vite@latest');
  P('exec', 'run a local binary', `${EXEC[pm]} \${args}`, 'terminal-window', 'binary and args');
  if (pm === 'npm') {
    P('version', 'bump version', 'npm version ${args:patch}', 'tag', 'patch | minor | major');
    P('publish', 'publish package', 'npm publish', 'cloud-arrow-up');
    P('info', 'show package info', 'npm view ${args}', 'info', 'package name');
    P('cache-clean', 'clean cache', 'npm cache clean --force', 'broom');
  }

  // Tools inferred from dependencies
  const X = EXEC[pm];
  const T = (tech: string, name: string, title: string, cmd: string, icon: string, args?: string) => {
    ctx.techs.add(tech);
    add(ctx, tech, 'tools', name, `${tech}: ${title}`, cmd, { icon, args });
  };
  if (dep('typescript')) {
    T('TypeScript', 'tsc', 'type-check', `${X} tsc --noEmit`, 'file-ts');
    T('TypeScript', 'tsc-watch', 'type-check (watch)', `${X} tsc --noEmit --watch`, 'file-ts');
  }
  if (dep('tsx')) T('tsx', 'tsx-file', 'run current file', `${X} tsx \${q:file}`, 'play');
  if (dep('eslint')) {
    T('ESLint', 'eslint', 'lint project', `${X} eslint .`, 'warning-circle');
    T('ESLint', 'eslint-fix', 'lint & auto-fix', `${X} eslint . --fix`, 'wrench');
    T('ESLint', 'eslint-file', 'lint current file', `${X} eslint \${q:file}`, 'warning-circle');
  }
  if (dep('@biomejs/biome')) {
    T('Biome', 'biome-check', 'check', `${X} biome check .`, 'warning-circle');
    T('Biome', 'biome-fix', 'check & fix', `${X} biome check --write .`, 'wrench');
  }
  if (dep('prettier')) {
    T('Prettier', 'prettier', 'format all files', `${X} prettier --write .`, 'magic-wand');
    T('Prettier', 'prettier-check', 'check formatting', `${X} prettier --check .`, 'check-circle');
  }
  if (dep('vitest')) {
    T('Vitest', 'vitest', 'run tests', `${X} vitest run`, 'flask');
    T('Vitest', 'vitest-watch', 'watch tests', `${X} vitest`, 'flask');
    T('Vitest', 'vitest-file', 'test current file', `${X} vitest run \${q:file}`, 'flask');
    T('Vitest', 'vitest-coverage', 'coverage', `${X} vitest run --coverage`, 'chart-pie-slice');
  }
  if (dep('jest')) {
    T('Jest', 'jest', 'run tests', `${X} jest`, 'flask');
    T('Jest', 'jest-watch', 'watch tests', `${X} jest --watch`, 'flask');
    T('Jest', 'jest-file', 'test current file', `${X} jest \${q:file}`, 'flask');
    T('Jest', 'jest-coverage', 'coverage', `${X} jest --coverage`, 'chart-pie-slice');
  }
  if (dep('@playwright/test')) {
    T('Playwright', 'pw-test', 'run e2e tests', `${X} playwright test`, 'browsers');
    T('Playwright', 'pw-ui', 'open UI mode', `${X} playwright test --ui`, 'browsers');
    T('Playwright', 'pw-codegen', 'record a test (codegen)', `${X} playwright codegen \${args}`, 'record', 'URL (optional)');
    T('Playwright', 'pw-report', 'show last report', `${X} playwright show-report`, 'chart-bar');
    T('Playwright', 'pw-install', 'install browsers', `${X} playwright install`, 'download-simple');
  }
  if (dep('cypress')) {
    T('Cypress', 'cypress-open', 'open', `${X} cypress open`, 'browsers');
    T('Cypress', 'cypress-run', 'run headless', `${X} cypress run`, 'browsers');
  }
  if (dep('next')) {
    T('Next.js', 'next-dev', 'dev server', `${X} next dev`, 'rocket-launch');
    T('Next.js', 'next-build', 'production build', `${X} next build`, 'hammer');
    T('Next.js', 'next-start', 'start production server', `${X} next start`, 'play');
  }
  if (dep('vite') && !dep('next')) {
    T('Vite', 'vite-dev', 'dev server', `${X} vite`, 'lightning');
    T('Vite', 'vite-build', 'build', `${X} vite build`, 'hammer');
    T('Vite', 'vite-preview', 'preview build', `${X} vite preview`, 'eye');
  }
  if (dep('astro')) {
    T('Astro', 'astro-dev', 'dev server', `${X} astro dev`, 'rocket-launch');
    T('Astro', 'astro-build', 'build', `${X} astro build`, 'hammer');
    T('Astro', 'astro-add', 'add integration', `${X} astro add \${args}`, 'plus-circle', 'integration, e.g. tailwind');
  }
  if (dep('nuxt')) {
    T('Nuxt', 'nuxt-dev', 'dev server', `${X} nuxi dev`, 'rocket-launch');
    T('Nuxt', 'nuxt-build', 'build', `${X} nuxi build`, 'hammer');
  }
  if (dep('@sveltejs/kit')) T('SvelteKit', 'svelte-check', 'svelte-check', `${X} svelte-check`, 'check-circle');
  if (dep('@angular/cli') || dep('@angular/core')) {
    T('Angular', 'ng-serve', 'serve', `${X} ng serve`, 'angular-logo');
    T('Angular', 'ng-build', 'build', `${X} ng build`, 'angular-logo');
    T('Angular', 'ng-test', 'test', `${X} ng test`, 'angular-logo');
    T('Angular', 'ng-generate', 'generate', `${X} ng generate \${args}`, 'angular-logo', 'schematic and name, e.g. component header');
  }
  if (dep('expo')) {
    T('Expo', 'expo-start', 'start', `${X} expo start`, 'device-mobile');
    T('Expo', 'expo-install', 'install compatible package', `${X} expo install \${args}`, 'device-mobile', 'package names');
  }
  if (dep('prisma') || dep('@prisma/client')) {
    T('Prisma', 'prisma-generate', 'generate client', `${X} prisma generate`, 'database');
    T('Prisma', 'prisma-migrate', 'create & apply migration', `${X} prisma migrate dev --name \${q:args}`, 'database', 'migration name');
    T('Prisma', 'prisma-push', 'push schema to DB', `${X} prisma db push`, 'database');
    T('Prisma', 'prisma-studio', 'open Prisma Studio', `${X} prisma studio`, 'database');
    T('Prisma', 'prisma-format', 'format schema', `${X} prisma format`, 'magic-wand');
  }
  if (dep('drizzle-kit')) {
    T('Drizzle', 'drizzle-generate', 'generate migrations', `${X} drizzle-kit generate`, 'database');
    T('Drizzle', 'drizzle-push', 'push schema', `${X} drizzle-kit push`, 'database');
    T('Drizzle', 'drizzle-studio', 'open studio', `${X} drizzle-kit studio`, 'database');
  }
  if (dep('storybook') || Object.keys(deps).some((d) => d.startsWith('@storybook/'))) {
    T('Storybook', 'storybook', 'start', `${X} storybook dev -p 6006`, 'book-open');
    T('Storybook', 'storybook-build', 'build static', `${X} storybook build`, 'hammer');
  }
  if (dep('turbo')) T('Turborepo', 'turbo', 'run task', `${X} turbo run \${args}`, 'lightning', 'task, e.g. build');
  if (dep('nx')) {
    T('Nx', 'nx-graph', 'dependency graph', `${X} nx graph`, 'graph');
    T('Nx', 'nx-affected', 'run affected task', `${X} nx affected -t \${args}`, 'lightning', 'target, e.g. test');
  }
  if (dep('@changesets/cli')) {
    T('Changesets', 'changeset', 'add changeset', `${X} changeset`, 'note-pencil');
    T('Changesets', 'changeset-version', 'version packages', `${X} changeset version`, 'tag');
  }
  if (dep('tailwindcss')) ctx.techs.add('Tailwind CSS');
  if (dep('react')) ctx.techs.add('React');
  if (dep('vue')) ctx.techs.add('Vue');
  if (dep('svelte')) ctx.techs.add('Svelte');
  if (dep('express')) ctx.techs.add('Express');
}

function scriptIcon(script: string): string {
  if (/test|spec|e2e/.test(script)) return 'flask';
  if (/lint|check/.test(script)) return 'warning-circle';
  if (/format|fmt|prettier/.test(script)) return 'magic-wand';
  if (/build|compile|bundle|package/.test(script)) return 'hammer';
  if (/dev|start|serve|watch/.test(script)) return 'rocket-launch';
  if (/deploy|release|publish/.test(script)) return 'cloud-arrow-up';
  if (/clean/.test(script)) return 'broom';
  if (/db|migrat|seed/.test(script)) return 'database';
  if (/doc/.test(script)) return 'book-open';
  return 'play';
}

/** `build: deps` style Makefile targets, skipping special and pattern targets. */
export function makeTargets(text: string): string[] {
  const targets = new Set<string>();
  for (const m of text.matchAll(/^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?![:=])/gm)) {
    if (!m[1].startsWith('.')) targets.add(m[1]);
  }
  return Array.from(targets);
}

/** Recipes from a justfile. */
export function justRecipes(text: string): string[] {
  const recipes = new Set<string>();
  for (const m of text.matchAll(/^@?([A-Za-z_][A-Za-z0-9_-]*)(?:\s+[^:\n]*)?:(?!=)/gm)) {
    if (!['set', 'alias', 'export', 'import', 'mod'].includes(m[1])) recipes.add(m[1]);
  }
  return Array.from(recipes);
}

/** `[tool.poetry.scripts]`-agnostic: just checks whether a dependency name appears in a manifest. */
function mentions(text: string | undefined, name: string): boolean {
  return !!text && new RegExp(`(^|[\\s"'\\[,=.])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s"'<>=~!\\],;\\[]|$)`, 'im').test(text);
}

function pythonProject(ctx: Ctx): void {
  const { scan } = ctx;
  const py = [scan.read['pyproject.toml'], scan.read['requirements.txt'], scan.read['Pipfile']].filter(Boolean).join('\n');
  const tool = has(scan, 'uv.lock') ? 'uv' : has(scan, 'poetry.lock') || /\[tool\.poetry\]/.test(scan.read['pyproject.toml'] ?? '') ? 'Poetry' : has(scan, 'Pipfile') ? 'Pipenv' : 'pip';
  ctx.techs.add('Python');
  ctx.techs.add(tool);
  const T = (name: string, title: string, cmd: string, icon: string, args?: string, group: ProjectGroup = 'tools') =>
    add(ctx, tool === 'pip' ? 'Python' : tool, group, name, `${tool === 'pip' ? 'Python' : tool}: ${title}`, cmd, { icon, args });
  const run = tool === 'uv' ? 'uv run ' : tool === 'Poetry' ? 'poetry run ' : tool === 'Pipenv' ? 'pipenv run ' : '';
  if (tool === 'uv') {
    T('uv-sync', 'sync dependencies', 'uv sync', 'download-simple', undefined, 'packageManager');
    T('uv-add', 'add package', 'uv add ${args}', 'plus-circle', 'package names', 'packageManager');
    T('uv-remove', 'remove package', 'uv remove ${args}', 'minus-circle', 'package names', 'packageManager');
    T('uv-lock', 'update lockfile', 'uv lock --upgrade', 'arrow-circle-up', undefined, 'packageManager');
  } else if (tool === 'Poetry') {
    T('poetry-install', 'install', 'poetry install', 'download-simple', undefined, 'packageManager');
    T('poetry-add', 'add package', 'poetry add ${args}', 'plus-circle', 'package names', 'packageManager');
    T('poetry-remove', 'remove package', 'poetry remove ${args}', 'minus-circle', 'package names', 'packageManager');
    T('poetry-update', 'update', 'poetry update', 'arrow-circle-up', undefined, 'packageManager');
  } else if (tool === 'Pipenv') {
    T('pipenv-install', 'install', 'pipenv install', 'download-simple', undefined, 'packageManager');
    T('pipenv-add', 'add package', 'pipenv install ${args}', 'plus-circle', 'package names', 'packageManager');
  } else {
    T('venv', 'create virtual env (.venv)', 'python -m venv .venv', 'cube', undefined, 'packageManager');
    if (scan.read['requirements.txt'] !== undefined) T('pip-install', 'install requirements', 'python -m pip install -r requirements.txt', 'download-simple', undefined, 'packageManager');
    else T('pip-install', 'install project (editable)', 'python -m pip install -e .', 'download-simple', undefined, 'packageManager');
    T('pip-add', 'pip install package', 'python -m pip install ${args}', 'plus-circle', 'package names', 'packageManager');
    T('pip-outdated', 'list outdated', 'python -m pip list --outdated', 'list-magnifying-glass', undefined, 'packageManager');
  }
  T('py-file', 'run current file', `${run || 'python '}${run ? 'python ' : ''}\${q:file}`, 'play');
  if (mentions(py, 'pytest') || has(scan, 'pytest.ini', 'conftest.py')) {
    ctx.techs.add('pytest');
    T('pytest', 'run tests (pytest)', `${run}pytest`, 'flask');
    T('pytest-file', 'test current file', `${run}pytest \${q:file}`, 'flask');
  }
  if (mentions(py, 'ruff') || has(scan, 'ruff.toml', '.ruff.toml')) {
    ctx.techs.add('Ruff');
    T('ruff', 'ruff check', `${run}ruff check .`, 'warning-circle');
    T('ruff-fix', 'ruff fix', `${run}ruff check --fix .`, 'wrench');
    T('ruff-format', 'ruff format', `${run}ruff format .`, 'magic-wand');
  }
  if (mentions(py, 'black')) T('black', 'format with black', `${run}black .`, 'magic-wand');
  if (mentions(py, 'mypy')) T('mypy', 'type-check (mypy)', `${run}mypy .`, 'check-circle');
  if (has(scan, 'manage.py') || mentions(py, 'django')) {
    ctx.techs.add('Django');
    const m = `${run}python manage.py`;
    T('django-run', 'runserver', `${m} runserver`, 'rocket-launch');
    T('django-migrate', 'migrate', `${m} migrate`, 'database');
    T('django-makemigrations', 'makemigrations', `${m} makemigrations`, 'database');
    T('django-shell', 'shell', `${m} shell`, 'terminal-window');
    T('django-superuser', 'create superuser', `${m} createsuperuser`, 'user-circle');
  }
  if (mentions(py, 'fastapi')) ctx.techs.add('FastAPI');
  if (mentions(py, 'flask')) ctx.techs.add('Flask');
}

function simple(ctx: Ctx, tech: string, rows: Array<[name: string, title: string, cmd: string, icon: string, args?: string]>, group: ProjectGroup = 'tools'): void {
  ctx.techs.add(tech);
  for (const [name, title, cmd, icon, args] of rows) add(ctx, tech, group, name, `${tech}: ${title}`, cmd, { icon, args });
}

function scanDirectory(ctx: Ctx, rootScan: DirectoryScan | undefined): void {
  const { scan } = ctx;
  const pkg = safeJson(scan.read['package.json']);
  if (pkg) nodeProject(ctx, pkg, rootScan);

  const deno = safeJson(scan.read['deno.json'] ?? scan.read['deno.jsonc']);
  if (deno) {
    ctx.techs.add('Deno');
    const tasks = (deno.tasks && typeof deno.tasks === 'object' ? deno.tasks : {}) as Record<string, string>;
    for (const [task, body] of Object.entries(tasks)) add(ctx, 'Deno', 'scripts', `deno-${task}`, `deno task: ${task}`, `deno task ${task}`, { icon: scriptIcon(task), description: String(body) });
    simple(ctx, 'Deno', [
      ['deno-test', 'test', 'deno test', 'flask'],
      ['deno-fmt', 'format', 'deno fmt', 'magic-wand'],
      ['deno-lint', 'lint', 'deno lint', 'warning-circle'],
      ['deno-add', 'add package', 'deno add ${args}', 'plus-circle', 'package, e.g. jsr:@std/path'],
    ]);
  }

  const make = scan.read['Makefile'] ?? scan.read['makefile'];
  if (make !== undefined) {
    ctx.techs.add('Make');
    for (const target of makeTargets(make)) add(ctx, 'Make', 'scripts', `make-${target}`, `make ${target}`, `make ${target}`, { icon: scriptIcon(target) });
  }
  const just = scan.read['justfile'] ?? scan.read['Justfile'];
  if (just !== undefined) {
    ctx.techs.add('just');
    for (const recipe of justRecipes(just)) add(ctx, 'just', 'scripts', `just-${recipe}`, `just ${recipe}`, `just ${recipe}`, { icon: scriptIcon(recipe) });
  }
  if (has(scan, 'Taskfile.yml', 'Taskfile.yaml')) simple(ctx, 'Task', [['task', 'run task', 'task ${args}', 'list-checks', 'task name (empty lists tasks)']], 'scripts');

  if (scan.read['pyproject.toml'] !== undefined || scan.read['requirements.txt'] !== undefined || scan.read['Pipfile'] !== undefined || has(scan, 'setup.py', 'manage.py')) {
    pythonProject(ctx);
  }

  if (scan.read['Cargo.toml'] !== undefined) {
    simple(ctx, 'Cargo', [
      ['cargo-build', 'build', 'cargo build', 'hammer'],
      ['cargo-release', 'build release', 'cargo build --release', 'hammer'],
      ['cargo-run', 'run', 'cargo run ${args}', 'play', 'arguments (optional)'],
      ['cargo-test', 'test', 'cargo test', 'flask'],
      ['cargo-check', 'check', 'cargo check', 'check-circle'],
      ['cargo-clippy', 'clippy', 'cargo clippy --all-targets', 'warning-circle'],
      ['cargo-fmt', 'format', 'cargo fmt', 'magic-wand'],
      ['cargo-add', 'add crate', 'cargo add ${args}', 'plus-circle', 'crate names'],
      ['cargo-update', 'update', 'cargo update', 'arrow-circle-up'],
      ['cargo-doc', 'open docs', 'cargo doc --open', 'book-open'],
    ]);
    ctx.techs.add('Rust');
  }

  if (scan.read['go.mod'] !== undefined) {
    simple(ctx, 'Go', [
      ['go-build', 'build', 'go build ./...', 'hammer'],
      ['go-run', 'run', 'go run . ${args}', 'play', 'arguments (optional)'],
      ['go-test', 'test', 'go test ./...', 'flask'],
      ['go-test-race', 'test with race detector', 'go test -race ./...', 'flask'],
      ['go-vet', 'vet', 'go vet ./...', 'warning-circle'],
      ['go-fmt', 'format', 'gofmt -w .', 'magic-wand'],
      ['go-tidy', 'mod tidy', 'go mod tidy', 'broom'],
      ['go-get', 'add module', 'go get ${args}', 'plus-circle', 'module path'],
    ]);
  }

  if (hasExt(scan, '.csproj', '.fsproj', '.sln', '.slnx')) {
    simple(ctx, '.NET', [
      ['dotnet-build', 'build', 'dotnet build', 'hammer'],
      ['dotnet-run', 'run', 'dotnet run', 'play'],
      ['dotnet-watch', 'watch run', 'dotnet watch run', 'eye'],
      ['dotnet-test', 'test', 'dotnet test', 'flask'],
      ['dotnet-restore', 'restore', 'dotnet restore', 'download-simple'],
      ['dotnet-format', 'format', 'dotnet format', 'magic-wand'],
      ['dotnet-add', 'add NuGet package', 'dotnet add package ${args}', 'plus-circle', 'package name'],
    ]);
  }

  const pom = scan.read['pom.xml'];
  if (pom !== undefined) {
    const mvn = has(scan, 'mvnw') ? './mvnw' : 'mvn';
    simple(ctx, 'Maven', [
      ['mvn-package', 'package', `${mvn} package`, 'package'],
      ['mvn-test', 'test', `${mvn} test`, 'flask'],
      ['mvn-install', 'clean install', `${mvn} clean install`, 'download-simple'],
      ...(pom.includes('spring-boot') ? [['mvn-boot', 'Spring Boot run', `${mvn} spring-boot:run`, 'rocket-launch'] as [string, string, string, string]] : []),
    ]);
    ctx.techs.add('Java');
  }
  const gradle = scan.read['build.gradle'] ?? scan.read['build.gradle.kts'];
  if (gradle !== undefined) {
    const g = has(scan, 'gradlew') ? './gradlew' : 'gradle';
    simple(ctx, 'Gradle', [
      ['gradle-build', 'build', `${g} build`, 'hammer'],
      ['gradle-test', 'test', `${g} test`, 'flask'],
      ['gradle-clean', 'clean', `${g} clean`, 'broom'],
      ...(gradle.includes('spring') ? [['gradle-boot', 'Spring Boot run', `${g} bootRun`, 'rocket-launch'] as [string, string, string, string]] : []),
      ...(gradle.includes('com.android') ? [['gradle-debug', 'assemble debug APK', `${g} assembleDebug`, 'android-logo'] as [string, string, string, string]] : []),
    ]);
  }

  const gemfile = scan.read['Gemfile'];
  if (gemfile !== undefined) {
    simple(ctx, 'Ruby', [
      ['bundle-install', 'bundle install', 'bundle install', 'download-simple'],
      ['bundle-add', 'add gem', 'bundle add ${args}', 'plus-circle', 'gem name'],
      ...(mentions(gemfile, 'rspec') || mentions(gemfile, 'rspec-rails') ? [['rspec', 'run specs', 'bundle exec rspec', 'flask'] as [string, string, string, string]] : []),
    ]);
    if (mentions(gemfile, 'rails')) {
      simple(ctx, 'Rails', [
        ['rails-server', 'server', 'bin/rails server', 'rocket-launch'],
        ['rails-console', 'console', 'bin/rails console', 'terminal-window'],
        ['rails-migrate', 'db:migrate', 'bin/rails db:migrate', 'database'],
        ['rails-generate', 'generate', 'bin/rails generate ${args}', 'magic-wand', 'generator and name'],
        ['rails-routes', 'routes', 'bin/rails routes', 'signpost'],
      ]);
    }
  }

  const composer = safeJson(scan.read['composer.json']);
  if (composer) {
    simple(ctx, 'Composer', [
      ['composer-install', 'install', 'composer install', 'download-simple'],
      ['composer-update', 'update', 'composer update', 'arrow-circle-up'],
      ['composer-require', 'require package', 'composer require ${args}', 'plus-circle', 'vendor/package'],
    ], 'packageManager');
    const scripts = (composer.scripts && typeof composer.scripts === 'object' ? composer.scripts : {}) as Record<string, unknown>;
    for (const script of Object.keys(scripts)) add(ctx, 'Composer', 'scripts', `composer-${script}`, `composer: ${script}`, `composer run-script ${script}`, { icon: scriptIcon(script) });
    if (has(scan, 'artisan')) {
      simple(ctx, 'Laravel', [
        ['artisan-serve', 'serve', 'php artisan serve', 'rocket-launch'],
        ['artisan-migrate', 'migrate', 'php artisan migrate', 'database'],
        ['artisan-tinker', 'tinker', 'php artisan tinker', 'terminal-window'],
        ['artisan-make', 'make', 'php artisan make:${args}', 'magic-wand', 'e.g. model Post -m'],
        ['artisan-test', 'test', 'php artisan test', 'flask'],
      ]);
    }
  }

  if (scan.read['mix.exs'] !== undefined) {
    simple(ctx, 'Elixir', [
      ['mix-deps', 'deps.get', 'mix deps.get', 'download-simple'],
      ['mix-test', 'test', 'mix test', 'flask'],
      ['mix-format', 'format', 'mix format', 'magic-wand'],
      ...(scan.read['mix.exs']!.includes(':phoenix') ? [['phx-server', 'Phoenix server', 'mix phx.server', 'rocket-launch'] as [string, string, string, string]] : []),
    ]);
  }

  const pubspec = scan.read['pubspec.yaml'];
  if (pubspec !== undefined) {
    const flutter = /\bflutter\s*:/.test(pubspec);
    const tool = flutter ? 'flutter' : 'dart';
    simple(ctx, flutter ? 'Flutter' : 'Dart', [
      [`${tool}-get`, 'pub get', `${tool} pub get`, 'download-simple'],
      [`${tool}-add`, 'add package', `${tool} pub add \${args}`, 'plus-circle', 'package name'],
      [`${tool}-test`, 'test', `${tool} test`, 'flask'],
      [`${tool}-run`, 'run', `${tool} run`, 'play'],
      ...(flutter ? [['flutter-doctor', 'doctor', 'flutter doctor', 'first-aid'] as [string, string, string, string]] : []),
    ]);
  }

  if (has(scan, 'Package.swift')) {
    simple(ctx, 'Swift', [
      ['swift-build', 'build', 'swift build', 'hammer'],
      ['swift-test', 'test', 'swift test', 'flask'],
      ['swift-run', 'run', 'swift run', 'play'],
    ]);
  }

  if (has(scan, 'CMakeLists.txt')) {
    simple(ctx, 'CMake', [
      ['cmake-configure', 'configure', 'cmake -S . -B build', 'gear-six'],
      ['cmake-build', 'build', 'cmake --build build', 'hammer'],
      ['ctest', 'test', 'ctest --test-dir build', 'flask'],
    ]);
  }

  if (has(scan, 'Dockerfile')) {
    const image = (scan.dir.split('/').pop() || 'app').toLowerCase().replace(/[^a-z0-9_.-]/g, '-');
    simple(ctx, 'Docker', [
      ['docker-build', 'build image', `docker build -t ${image} .`, 'cube'],
      ['docker-run', 'run image', `docker run --rm -it ${image}`, 'play'],
    ]);
  }
  if (has(scan, 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml')) {
    simple(ctx, 'Docker Compose', [
      ['compose-up', 'up (detached)', 'docker compose up -d', 'play'],
      ['compose-down', 'down', 'docker compose down', 'stop'],
      ['compose-logs', 'follow logs', 'docker compose logs -f ${args}', 'scroll', 'service (optional)'],
      ['compose-ps', 'list services', 'docker compose ps', 'list-bullets'],
      ['compose-build', 'build', 'docker compose build', 'hammer'],
      ['compose-restart', 'restart', 'docker compose restart ${args}', 'arrow-clockwise', 'service (optional)'],
    ]);
  }

  if (hasExt(scan, '.tf')) {
    simple(ctx, 'Terraform', [
      ['tf-init', 'init', 'terraform init', 'download-simple'],
      ['tf-plan', 'plan', 'terraform plan', 'list-checks'],
      ['tf-apply', 'apply', 'terraform apply', 'cloud-arrow-up'],
      ['tf-fmt', 'format', 'terraform fmt -recursive', 'magic-wand'],
      ['tf-validate', 'validate', 'terraform validate', 'check-circle'],
    ]);
  }

  if (scan.read['Chart.yaml'] !== undefined) {
    simple(ctx, 'Helm', [
      ['helm-lint', 'lint chart', 'helm lint .', 'warning-circle'],
      ['helm-template', 'render templates', 'helm template .', 'file-code'],
    ]);
  }

  if (has(scan, '.pre-commit-config.yaml')) simple(ctx, 'pre-commit', [['pre-commit', 'run on all files', 'pre-commit run --all-files', 'check-circle']]);
}

/** Runs detection over every scanned directory. Root commands have no name prefix. */
export function detectProject(scans: readonly DirectoryScan[]): DetectionResult {
  const techs = new Set<string>();
  const commands: ProjectCommand[] = [];
  const root = scans.find((s) => s.dir === '');
  const usedPrefixes = new Set<string>();
  for (const scan of [...scans].sort((a, b) => a.dir.localeCompare(b.dir))) {
    let prefix = '';
    if (scan.dir) {
      let base = scan.dir.split('/').pop()!.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      if (usedPrefixes.has(base)) base = scan.dir.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      usedPrefixes.add(base);
      prefix = `${base}:`;
    }
    scanDirectory({ scan, prefix, out: commands, techs }, scan.dir ? root : undefined);
  }
  // Keep the first command per id (defensive against duplicate scans).
  const seen = new Set<string>();
  const unique = commands.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  return { techs: Array.from(techs), commands: unique };
}
