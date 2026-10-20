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
      thresholds: { lines: 95, statements: 94, functions: 92, branches: 86 },
    },
  },
});
