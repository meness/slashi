// Bundles the extension (Node) and the webviews (browser) with esbuild.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  minify: production,
  sourcemap: production ? false : 'linked',
  logLevel: 'info',
  legalComments: 'none',
};

const configs = [
  {
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  },
  {
    ...shared,
    entryPoints: {
      spotlight: 'src/webview/spotlight.ts',
      answer: 'src/webview/answer.ts',
      studio: 'src/webview/studio.ts',
      onboarding: 'src/webview/onboarding.ts',
    },
    outdir: 'dist/webview',
    platform: 'browser',
    format: 'iife',
    target: 'chrome114',
  },
];

function copyAssets() {
  mkdirSync('dist/webview', { recursive: true });
  cpSync('src/webview/styles', 'dist/webview', { recursive: true });
  // Phosphor icons: regular (UI chrome) and duotone (result tiles). Only the woff2 fonts are shipped.
  for (const [weight, font] of [
    ['regular', 'Phosphor'],
    ['duotone', 'Phosphor-Duotone'],
  ]) {
    const from = `node_modules/@phosphor-icons/web/src/${weight}`;
    const to = `dist/webview/phosphor/${weight}`;
    mkdirSync(to, { recursive: true });
    cpSync(`${from}/${font}.woff2`, `${to}/${font}.woff2`);
    const css = readFileSync(`${from}/style.css`, 'utf8').replace(/src:[^;]+;/, `src: url("./${font}.woff2") format("woff2");`);
    writeFileSync(`${to}/style.css`, css);
  }
}

copyAssets();
if (watch) {
  for (const config of configs) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
  }
} else {
  await Promise.all(configs.map((config) => esbuild.build(config)));
}
