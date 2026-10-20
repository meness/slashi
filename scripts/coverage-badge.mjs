// Writes the core line-coverage percentage into the README badge. Run after `vitest run --coverage`.
// Usage: node scripts/coverage-badge.mjs [--check]   (--check fails instead of writing when the badge is stale)
import { readFileSync, writeFileSync } from 'node:fs';

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const pct = Math.floor(summary.total.lines.pct);
const color = pct >= 90 ? '22c55e' : pct >= 75 ? 'eab308' : 'ef4444';
const badge = `[![Core coverage](https://img.shields.io/badge/core%20coverage-${pct}%25-${color}.svg)](vitest.config.mts)`;

const readme = readFileSync('README.md', 'utf8');
const pattern = /\[!\[Core coverage\]\([^)]*\)\]\([^)]*\)/;
if (!pattern.test(readme)) {
  console.error('README.md has no "Core coverage" badge to update.');
  process.exit(1);
}
const updated = readme.replace(pattern, badge);
if (updated === readme) {
  console.log(`Coverage badge is up to date (${pct}%).`);
} else if (process.argv.includes('--check')) {
  console.error(`Coverage badge is stale: core coverage is now ${pct}%. Run \`npm run coverage\` and commit README.md.`);
  process.exit(1);
} else {
  writeFileSync('README.md', updated);
  console.log(`Coverage badge updated to ${pct}%.`);
}
