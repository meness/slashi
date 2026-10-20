// Renders the real webviews in headless Chromium with VS Code theme colors and real data captured by
// the smoke test (npm run test:smoke). Output: media/screenshots/*.png
// Usage: npm run screenshots   (set CHROME_PATH to use a specific Chromium)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'media', 'screenshots');
const tmp = join(root, 'test', 'smoke', 'out');
mkdirSync(out, { recursive: true });

const initPath = join(tmp, 'init.json');
if (!existsSync(initPath)) {
  console.error('Run `npm run test:smoke` first to capture real data.');
  process.exit(1);
}
const init = JSON.parse(readFileSync(initPath, 'utf8'));
const studio = JSON.parse(readFileSync(join(tmp, 'studio.json'), 'utf8'));

const THEMES = {
  dark: {
    body: 'vscode-dark',
    vars: {
      '--vscode-font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
      '--vscode-font-size': '13px',
      '--vscode-editor-font-family': '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
      '--vscode-editor-background': '#1f1f1f',
      '--vscode-foreground': '#cccccc',
      '--vscode-descriptionForeground': '#9d9d9d',
      '--vscode-editorWidget-background': '#252526',
      '--vscode-widget-border': '#3a3a3a',
      '--vscode-focusBorder': '#8b5cf6',
      '--vscode-button-background': '#7c3aed',
      '--vscode-button-hoverBackground': '#6d28d9',
      '--vscode-button-foreground': '#ffffff',
      '--vscode-input-background': '#2a2a2a',
      '--vscode-textCodeBlock-background': '#2b2b2b',
      '--vscode-textLink-foreground': '#4daafc',
      '--vscode-errorForeground': '#f85149',
    },
  },
  light: {
    body: 'vscode-light',
    vars: {
      '--vscode-font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
      '--vscode-font-size': '13px',
      '--vscode-editor-font-family': '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
      '--vscode-editor-background': '#ffffff',
      '--vscode-foreground': '#3b3b3b',
      '--vscode-descriptionForeground': '#6b6b6b',
      '--vscode-editorWidget-background': '#f8f8f8',
      '--vscode-widget-border': '#e3e3e3',
      '--vscode-focusBorder': '#7c3aed',
      '--vscode-button-background': '#7c3aed',
      '--vscode-button-hoverBackground': '#6d28d9',
      '--vscode-button-foreground': '#ffffff',
      '--vscode-input-background': '#ffffff',
      '--vscode-textCodeBlock-background': '#f3f3f3',
      '--vscode-textLink-foreground': '#005fb8',
      '--vscode-errorForeground': '#c72e0f',
    },
  },
};

const asset = (p) => pathToFileURL(join(root, 'dist', 'webview', p)).href;

function page({ theme, script, styles, host }) {
  const t = THEMES[theme];
  const vars = Object.entries(t.vars).map(([k, v]) => `${k}: ${v};`).join(' ');
  const css = ['phosphor/regular/style.css', 'phosphor/duotone/style.css', 'base.css', ...styles].map((s) => `<link rel="stylesheet" href="${asset(s)}">`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">${css}<style>:root { ${vars} }</style></head>
  <body class="${t.body}"><div id="app"></div>
  <script>
    const send = (data) => window.dispatchEvent(new MessageEvent('message', { data }));
    window.__sent = [];
    window.acquireVsCodeApi = () => ({ postMessage: (m) => { window.__sent.push(m); (${host})(m, send); }, getState: () => undefined, setState: () => {} });
  </script>
  <script src="${asset(script)}"></script></body></html>`;
}

const now = Date.now();
const recent = ['cmd:editor.action.formatDocument', 'git:commit', 'files:new', 'ai:explain', 'term:run'];
const spotlightInit = {
  ...init,
  now,
  aiLabel: 'Claude · claude-opus-5-5',
  context: { hasSelection: false, fileName: 'src/extension.ts' },
  frecency: Object.fromEntries(recent.map((id, i) => [id, { c: 10 - i, t: now - i * 600_000 }])),
};

const spotlightHost = (data) => `(m, send) => {
  const data = ${JSON.stringify(data)};
  if (m.type === 'ready') setTimeout(() => send({ type: 'init', data }), 0);
  if (m.type === 'query') setTimeout(() => send({ type: 'live', seq: m.seq, items: data.live[m.query] || [] }), 0);
}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });

async function shoot(name, html, { width = 1100, height = 720, actions } = {}) {
  const file = join(tmp, `${name}.html`);
  writeFileSync(file, html);
  const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await tab.goto(pathToFileURL(file).href);
  await tab.waitForTimeout(250);
  if (actions) await actions(tab);
  await tab.waitForTimeout(300);
  await tab.screenshot({ path: join(out, `${name}.png`) });
  await tab.close();
  console.log(`✓ ${name}.png`);
}

const typeQuery = (q) => async (tab) => {
  await tab.fill('#q', q);
  await tab.dispatchEvent('#q', 'input');
  await tab.waitForTimeout(200);
};

for (const theme of ['dark', 'light']) {
  await shoot(`spotlight-home-${theme}`, page({ theme, script: 'spotlight.js', styles: ['spotlight.css'], host: spotlightHost(spotlightInit) }));
}
await shoot('spotlight-search-dark', page({ theme: 'dark', script: 'spotlight.js', styles: ['spotlight.css'], host: spotlightHost(spotlightInit) }), { actions: typeQuery('/p ') });
await shoot('spotlight-settings-light', page({ theme: 'light', script: 'spotlight.js', styles: ['spotlight.css'], host: spotlightHost(spotlightInit) }), { actions: typeQuery('font size') });
await shoot('spotlight-files-dark', page({ theme: 'dark', script: 'spotlight.js', styles: ['spotlight.css'], host: spotlightHost(spotlightInit) }), {
  actions: async (tab) => {
    await typeQuery('/f package')(tab);
    await tab.waitForTimeout(200);
    await tab.keyboard.press('Shift+Enter');
  },
});
await shoot('spotlight-ai-light', page({ theme: 'light', script: 'spotlight.js', styles: ['spotlight.css'], host: spotlightHost(spotlightInit) }), { actions: typeQuery('make the font bigger and enable word wrap') });

const answerHost = `(m, send) => {
  if (m.type !== 'ready') return;
  send({ type: 'start', title: 'Explain', prompt: 'Explain src/core/search.ts', mode: 'answer', target: 'src/core/search.ts' });
  send({ type: 'model', label: 'Claude · claude-opus-5-5' });
  const text = ${JSON.stringify(`**\`rank()\`** scores every item against each word you type and keeps the best matches.

1. **Exact slash names win** — typing \`/run npm test\` matches the \`run\` item and passes \`npm test\` as arguments.
2. **Fuzzy matching** prefers contiguous letters and word starts, so \`fs\` finds *Font Size*.
3. **Frecency** adds a bonus for things you use often and recently.

\`\`\`ts
const results = rank(index, parseQuery('/set font', scopes), { limit: 60, frecency });
\`\`\`

It runs in both the extension host and the Spotlight webview, so typing never waits on IPC.`)};
  send({ type: 'delta', text });
  send({ type: 'done' });
}`;
for (const theme of ['dark', 'light']) {
  await shoot(`answer-${theme}`, page({ theme, script: 'answer.js', styles: ['answer.css'], host: answerHost }), { width: 900, height: 640 });
}

const studioHost = (state, tab) => `(m, send) => { if (m.type === 'ready') send({ type: 'state', tab: '${tab}', state: ${JSON.stringify(state)} }); }`;
const studioState = { ...studio, ai: { ...studio.ai, provider: 'anthropic', label: 'Claude · claude-opus-5-5', keys: { anthropic: true }, models: [{ backend: 'anthropic', id: 'claude-opus-5-5', label: 'Claude Opus 5.5', detail: 'Default' }, { backend: 'anthropic', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' }] } };
await shoot('studio-providers-dark', page({ theme: 'dark', script: 'studio.js', styles: ['studio.css'], host: studioHost(studioState, 'providers') }), { width: 1200, height: 800 });
await shoot('studio-ai-light', page({ theme: 'light', script: 'studio.js', styles: ['studio.css'], host: studioHost(studioState, 'ai') }), { width: 1200, height: 800 });

await browser.close();
