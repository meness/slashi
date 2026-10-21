// Runs the end-to-end scenarios in a real VS Code against a fresh throwaway Git repo: npm run test:e2e
// Set SLASHI_E2E_AI=1 to include the AI scenario, which sends two small requests through the Claude Code CLI.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

const root = path.resolve(__dirname, '../../..');

// The test workspace: a package script that shares a name with a core command, a team file with comments and
// trailing commas, and files for Format Document and Git.
const FILES: Record<string, string> = {
  'package.json': `${JSON.stringify(
    {
      name: 'slashi-e2e',
      private: true,
      scripts: {
        // `--` keeps Node from reading the script's arguments (like --check) as its own flags.
        format: `node -e "require('fs').writeFileSync('format-ran.txt', 'args:' + process.argv.slice(1).join(' '))" --`,
      },
    },
    null,
    2,
  )}\n`,
  'app.ts': 'export const   value=1\n',
  'notes.txt': 'notes\n',
  '.gitignore': 'node_modules\n',
  '.vscode/slashi.json': [
    '// Team commands: comments and trailing commas must parse, like in VS Code.',
    '{',
    '  "commands": [',
    '    { "name": "hello", "steps": [{ "notify": "hello from the team file" }] },',
    '    /* only in TypeScript files */',
    '    { "name": "ts-only", "languages": ["typescript"], "steps": [{ "notify": "ts" }] },',
    '  ],',
    '}',
    '',
  ].join('\n'),
};

function createWorkspace(dir: string): void {
  for (const [file, text] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 'e2e@slashi.test');
  git('config', 'user.name', 'Slashi E2E');
  git('add', '-A');
  git('commit', '-qm', 'init');
}

/** The Claude Code CLI bundled with its VS Code extension; extensions are disabled in the test window, so Slashi finds it on PATH. */
function claudeCliDir(): string | undefined {
  const extensions = path.join(os.homedir(), '.vscode', 'extensions');
  const bundled = fs.existsSync(extensions)
    ? fs
        .readdirSync(extensions)
        .filter((d) => d.startsWith('anthropic.claude-code-'))
        .sort()
        .map((d) => path.join(extensions, d, 'resources', 'native-binary'))
        .filter((d) => fs.existsSync(path.join(d, process.platform === 'win32' ? 'claude.exe' : 'claude')))
    : [];
  return bundled.at(-1);
}

async function main(): Promise<void> {
  // A short base keeps VS Code's IPC socket path under the 103-character limit (TMPDIR can be long, e.g. in Claude Code).
  const base = fs.mkdtempSync(path.join(process.platform === 'win32' ? os.tmpdir() : '/tmp', 'slashi-e2e-'));
  const workspace = path.join(base, 'ws');
  createWorkspace(workspace);
  // Set inside terminals run by Electron apps (VS Code, Claude Code); it would start VS Code as plain Node.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const cli = process.env.SLASHI_E2E_AI ? claudeCliDir() : undefined;
  let failed = false;
  try {
    await runTests({
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(__dirname, 'index.js'),
      launchArgs: [workspace, '--disable-extensions', '--user-data-dir', path.join(base, 'user-data')],
      extensionTestsEnv: {
        SLASHI_SKIP_ONBOARDING: '1',
        SLASHI_E2E_AI: process.env.SLASHI_E2E_AI ?? '',
        ...(cli ? { PATH: `${cli}${path.delimiter}${process.env.PATH ?? ''}` } : {}),
      },
    });
  } catch (err) {
    failed = true;
    console.error(err);
    console.error(`Kept the test workspace for inspection: ${workspace}`);
  }
  if (!failed) fs.rmSync(base, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
}

void main();
