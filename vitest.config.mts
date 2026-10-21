import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Unit tests cover the pure core; the rest is checked by the smoke and integration tests.
      include: ['src/core/**'],
      reporter: ['text', 'json-summary'],
      // Just under the current numbers: raise them when coverage goes up, never lower them.
      thresholds: { lines: 96, statements: 95, functions: 93, branches: 89 },
    },
  },
});
