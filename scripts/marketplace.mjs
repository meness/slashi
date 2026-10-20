// Validates every pack in marketplace/packs and regenerates marketplace/index.json.
// Usage: node scripts/marketplace.mjs [--check]   (--check fails if index.json is out of date)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Reuse the extension's own validator so CI and the extension agree.
const bundled = await build({ entryPoints: [join(root, 'src/core/commandSchema.ts')], bundle: true, write: false, format: 'esm', platform: 'node' });
const { validatePack, stepType } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const dir = join(root, 'marketplace', 'packs');
const packs = [];
let failed = false;
const ids = new Set();
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const { value, errors } = validatePack(raw);
  if (!value) {
    failed = true;
    console.error(`✗ ${file}\n  ${errors.join('\n  ')}`);
    continue;
  }
  if (`${value.id}.json` !== file) {
    failed = true;
    console.error(`✗ ${file}: file name must be ${value.id}.json`);
    continue;
  }
  if (ids.has(value.id)) {
    failed = true;
    console.error(`✗ duplicate pack id ${value.id}`);
  }
  ids.add(value.id);
  const terminal = value.commands.some((c) => c.steps.some((s) => stepType(s) === 'terminal'));
  packs.push({ id: value.id, name: value.name, version: value.version, description: value.description, author: value.author, icon: value.icon, tags: value.tags ?? [], url: `packs/${file}`, commands: value.commands.length, terminal });
  console.log(`✓ ${file} — ${value.commands.length} commands${terminal ? ' (terminal)' : ''}`);
}
if (failed) process.exit(1);

const index = `${JSON.stringify({ version: 1, name: 'Slashi community actions', packs }, null, 2)}\n`;
const indexPath = join(root, 'marketplace', 'index.json');
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(indexPath, 'utf8');
  } catch {}
  if (current !== index) {
    console.error('✗ marketplace/index.json is out of date — run `npm run marketplace`.');
    process.exit(1);
  }
  console.log('✓ index.json is up to date');
} else {
  writeFileSync(indexPath, index);
  console.log(`Wrote marketplace/index.json with ${packs.length} packs.`);
}
