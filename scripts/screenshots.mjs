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
const onboarding = JSON.parse(readFileSync(join(tmp, 'onboarding.json'), 'utf8'));

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

// Onboarding steps
const onboardingState = {
  ...onboarding,
  platform: 'darwin',
  shortcut: '⌘/',
  stack: onboarding.stack.length ? onboarding.stack : ['npm', 'TypeScript', 'Vitest'],
  ai: { ...onboarding.ai, label: 'GitHub Copilot · GPT', provider: 'vscode', vscode: [{ backend: 'vscode', id: 'copilot-gpt', label: 'GitHub Copilot', detail: 'copilot · gpt' }], ollama: [{ backend: 'ollama', id: 'llama3.2', label: 'llama3.2' }] },
};
const onboardingHost = (stepIndex, pressed = false) => `(m, send) => {
  if (m.type !== 'ready') return;
  send({ type: 'state', state: ${JSON.stringify(onboardingState)} });
  setTimeout(() => {
    for (let i = 0; i < ${stepIndex}; i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    ${pressed ? "send({ type: 'shortcutPressed' });" : ''}
  }, 30);
}`;
const steps = [['welcome', 0], ['shortcut', 1, true], ['providers', 2], ['ai', 3], ['done', 5]];
for (const [name, index, pressed] of steps) {
  await shoot(`onboarding-${name}-${name === 'providers' || name === 'done' ? 'light' : 'dark'}`, page({ theme: name === 'providers' || name === 'done' ? 'light' : 'dark', script: 'onboarding.js', styles: ['onboarding.css'], host: onboardingHost(index, pressed) }), { width: 1200, height: 800, actions: async (tab) => tab.waitForTimeout(name === 'welcome' ? 1400 : 200) });
}

// Hero images: the real webview inside a VS Code-like window on a gradient backdrop.
function windowFrame({ theme, inner, title, tabs, sidebar = true }) {
  const t = THEMES[theme];
  const dark = theme === 'dark';
  const c = dark
    ? { chrome: '#181818', side: '#181818', border: '#2b2b2b', fg: '#cccccc', muted: '#8b8b8b', tab: '#1f1f1f', status: '#181818' }
    : { chrome: '#f8f8f8', side: '#f8f8f8', border: '#e5e5e5', fg: '#3b3b3b', muted: '#868686', tab: '#ffffff', status: '#f8f8f8' };
  const backdrop = dark
    ? 'radial-gradient(1200px 700px at 15% 10%, #4c1d95 0%, transparent 60%), radial-gradient(1000px 700px at 90% 90%, #0e7490 0%, transparent 60%), #0b0a14'
    : 'radial-gradient(1200px 700px at 15% 10%, #ddd6fe 0%, transparent 60%), radial-gradient(1000px 700px at 90% 90%, #a5f3fc 0%, transparent 60%), #f5f3ff';
  const ph = (n) => `<i class="ph ph-${n}"></i>`;
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="${asset('phosphor/regular/style.css')}">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; height: 100vh; display: grid; place-items: center; background: ${backdrop}; font-family: ${t.vars['--vscode-font-family']}; }
    .win { width: 1400px; height: 860px; border-radius: 14px; overflow: hidden; display: grid; grid-template-rows: 36px 1fr 24px; background: ${c.chrome}; border: 1px solid ${dark ? 'rgb(255 255 255 / 0.12)' : 'rgb(0 0 0 / 0.08)'}; box-shadow: 0 50px 120px -30px rgb(0 0 0 / ${dark ? 0.8 : 0.35}), 0 0 0 1px rgb(0 0 0 / 0.05); }
    .title { display: flex; align-items: center; gap: 8px; padding: 0 14px; color: ${c.muted}; font-size: 12px; border-bottom: 1px solid ${c.border}; }
    .lights { display: flex; gap: 8px; } .lights span { width: 12px; height: 12px; border-radius: 50%; }
    .title .t { flex: 1; text-align: center; margin-right: 52px; }
    .main { display: grid; grid-template-columns: 48px ${sidebar ? '240px' : '0px'} 1fr; min-height: 0; }
    .activity { display: flex; flex-direction: column; align-items: center; gap: 22px; padding-top: 14px; color: ${c.muted}; font-size: 22px; border-right: 1px solid ${c.border}; }
    .activity .on { color: ${c.fg}; }
    .side { background: ${c.side}; border-right: 1px solid ${c.border}; color: ${c.fg}; font-size: 12.5px; padding: 10px 0; overflow: hidden; }
    .side .h { padding: 4px 18px 10px; font-size: 11px; font-weight: 700; color: ${c.muted}; letter-spacing: .06em; }
    .side .r { display: flex; align-items: center; gap: 6px; padding: 3px 18px; white-space: nowrap; } .side .r i { color: ${c.muted}; }
    .side .r.sel { background: ${dark ? '#37373d' : '#e4e6f1'}; }
    .editor { display: grid; grid-template-rows: 35px 1fr; min-width: 0; background: ${t.vars['--vscode-editor-background']}; }
    .tabs { display: flex; background: ${c.chrome}; border-bottom: 1px solid ${c.border}; }
    .tab { display: flex; align-items: center; gap: 7px; padding: 0 14px; font-size: 12.5px; color: ${c.muted}; border-right: 1px solid ${c.border}; }
    .tab.on { background: ${c.tab}; color: ${c.fg}; border-top: 1px solid #8b5cf6; }
    .tab img { width: 14px; height: 14px; }
    .content { position: relative; min-height: 0; }
    .content iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    .code { display: grid; grid-template-columns: 48px 1fr; align-content: start; padding-top: 10px; font: 13.5px/21px ${t.vars['--vscode-editor-font-family']}; }
    .ln { text-align: right; padding-right: 18px; color: ${c.muted}; opacity: .6; } .code-line { white-space: pre; }
    .status { display: flex; align-items: center; gap: 16px; padding: 0 12px; font-size: 12px; color: ${c.muted}; background: ${c.status}; border-top: 1px solid ${c.border}; }
    .status .grow { flex: 1; } .status .slashi { color: ${c.fg}; font-weight: 600; padding: 0 8px; border-radius: 4px; background: ${dark ? 'rgb(139 92 246 / .25)' : 'rgb(139 92 246 / .15)'}; }
  </style></head><body>
  <div class="win">
    <div class="title"><div class="lights"><span style="background:#ff5f57"></span><span style="background:#febc2e"></span><span style="background:#28c840"></span></div><div class="t">${title}</div></div>
    <div class="main">
      <div class="activity">${ph('files')}${ph('magnifying-glass')}${ph('git-branch')}${ph('bug')}${ph('puzzle-piece')}</div>
      <div class="side">${sidebar ? `<div class="h">EXPLORER · SLASHI</div>${['caret-down|folder-open|src', '|file-ts|  extension.ts|sel', '|file-ts|  registry.ts', '|folder|  core', '|folder|  providers', '|folder|  webview', 'caret-right|folder|docs', 'caret-right|folder|marketplace', '|package|package.json', '|book-open|README.md'].map((r) => { const [a, i, n, sel] = r.split('|'); return `<div class="r${sel ? ' sel' : ''}">${a ? ph(a) : '<span style="width:14px"></span>'}${ph(i)}<span>${n.trim()}</span></div>`; }).join('')}` : ''}</div>
      <div class="editor">
        <div class="tabs">${tabs.map((tb) => `<div class="tab${tb.on ? ' on' : ''}">${tb.icon ? `<img src="${pathToFileURL(join(root, 'media', dark ? 'slash-dark.svg' : 'slash-light.svg')).href}">` : ph('file-ts')}${tb.label}</div>`).join('')}</div>
        <div class="content">${inner}</div>
      </div>
    </div>
    <div class="status">${ph('git-branch')} main <span>${ph('x-circle')} 0 ${ph('warning')} 0</span><span class="grow"></span><span>TypeScript</span><span class="slashi">/ Slashi</span></div>
  </div></body></html>`;
}

async function hero(name, theme, innerPage, { actions, tabs, sidebar = true } = {}) {
  const innerFile = join(tmp, `${name}-inner.html`);
  writeFileSync(innerFile, innerPage);
  const html = windowFrame({ theme, title: 'extension.ts — slashi', tabs, sidebar, inner: `<iframe id="f" src="${pathToFileURL(innerFile).href}"></iframe>` });
  const file = join(tmp, `${name}.html`);
  writeFileSync(file, html);
  const tab = await browser.newPage({ viewport: { width: 1560, height: 1000 }, deviceScaleFactor: 2 });
  await tab.goto(pathToFileURL(file).href);
  await tab.waitForTimeout(300);
  const frame = tab.frames().find((f) => f.url().includes('-inner.html'));
  if (actions) await actions(frame);
  await tab.waitForTimeout(500);
  await tab.screenshot({ path: join(out, `${name}.png`) });
  await tab.close();
  console.log(`✓ ${name}.png`);
}

const spotlightTabs = [{ label: 'extension.ts' }, { label: 'Slashi', icon: true, on: true }];
await hero('hero-dark', 'dark', page({ theme: 'dark', script: 'spotlight.js', styles: ['spotlight.css'], host: spotlightHost(spotlightInit) }), { tabs: spotlightTabs });
await hero('hero-light', 'light', page({ theme: 'light', script: 'spotlight.js', styles: ['spotlight.css'], host: spotlightHost(spotlightInit) }), { tabs: spotlightTabs, actions: typeQuery('/p ') });
await hero('hero-files-dark', 'dark', page({ theme: 'dark', script: 'spotlight.js', styles: ['spotlight.css'], host: spotlightHost(spotlightInit) }), {
  tabs: spotlightTabs,
  actions: async (f) => {
    await typeQuery('/f package')(f);
    await f.waitForTimeout(200);
    await f.press('#q', 'Shift+Enter');
  },
});
await hero('hero-answer-dark', 'dark', page({ theme: 'dark', script: 'answer.js', styles: ['answer.css'], host: answerHost }), { tabs: [{ label: 'search.ts' }, { label: 'Slashi AI', icon: true, on: true }] });
await hero('hero-onboarding-dark', 'dark', page({ theme: 'dark', script: 'onboarding.js', styles: ['onboarding.css'], host: onboardingHost(0) }), {
  tabs: [{ label: 'Welcome to Slashi', icon: true, on: true }],
  sidebar: false,
  actions: (f) => f.waitForTimeout(1400),
});

await browser.close();
