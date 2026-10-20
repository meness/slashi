import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'test/integration/out/**/*.test.js',
  version: 'stable',
  workspaceFolder: '.',
  launchArgs: ['--disable-extensions'],
  env: { SLASHI_SKIP_ONBOARDING: '1' },
  mocha: { ui: 'tdd', timeout: 30000 },
});
