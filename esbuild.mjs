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

// Keeps `import('./anthropic-sdk.js')` a runtime require of dist/anthropic-sdk.js instead of inlining the SDK.
const lazySdk = {
  name: 'lazy-anthropic-sdk',
  setup(build) {
    build.onResolve({ filter: /^\.\/anthropic-sdk\.js$/ }, (args) => ({ path: args.path, external: true }));
  },
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
    plugins: [lazySdk],
    // Its UMD `main` loads files with a require() esbuild can't follow; the ESM build bundles cleanly.
    alias: { 'jsonc-parser': './node_modules/jsonc-parser/lib/esm/main.js' },
    // As require() so `default` is the SDK class (Node's import() of a CommonJS file wraps module.exports instead).
    supported: { 'dynamic-import': false },
  },
  {
    ...shared,
    entryPoints: ['src/llm/anthropic-sdk.ts'],
    outfile: 'dist/anthropic-sdk.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
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
