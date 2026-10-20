// Benchmarks Slashi's ranking on synthetic catalogues: node scripts/bench.mjs
import { build } from 'esbuild';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  stdin: { contents: "export * from './src/core/search'; export * from './src/core/query';", resolveDir: root, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { indexItems, rank, parseQuery } = await import(
  `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`
);

const words = [
  'editor',
  'format',
  'document',
  'terminal',
  'git',
  'commit',
  'settings',
  'font',
  'size',
  'toggle',
  'workspace',
  'search',
  'file',
  'open',
  'debug',
  'test',
  'run',
  'theme',
  'color',
  'extension',
];
const pick = (i, n) => words[(i * 7 + n * 13) % words.length];
const queries = ['/format', 'font size', '/set font', 'gcm', 'toggle term', 'open recent workspace', '/run npm test', 'xyzzy'];

console.log('items   | index ms | avg rank ms | p95 rank ms');
for (const size of [1_000, 5_000, 20_000, 50_000]) {
  const items = Array.from({ length: size }, (_, i) => ({
    id: `i${i}`,
    name: i % 3 ? '' : `${pick(i, 1)}-${i}`,
    title: `${pick(i, 2)}: ${pick(i, 3)} ${pick(i, 4)} ${i}`,
    description: `${pick(i, 5)} ${pick(i, 6)} ${pick(i, 7)}`,
    icon: 'lightning',
    providerId: 'commands',
    category: pick(i, 8),
    keywords: [`${pick(i, 9)}.${pick(i, 10)}`],
    args: i === 0 ? { placeholder: 'x' } : undefined,
  }));
  const t0 = performance.now();
  const index = indexItems(items);
  const indexMs = performance.now() - t0;
  const times = [];
  for (let r = 0; r < 25; r++) {
    for (const q of queries) {
      const s = performance.now();
      rank(index, parseQuery(q, ['set']), { limit: 60 });
      times.push(performance.now() - s);
    }
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(
    `${String(size).padStart(7)} | ${indexMs.toFixed(1).padStart(8)} | ${avg.toFixed(2).padStart(11)} | ${times[Math.floor(times.length * 0.95)].toFixed(2).padStart(11)}`,
  );
}
