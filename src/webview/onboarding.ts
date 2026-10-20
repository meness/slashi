// First-run onboarding.

import { esc, icon, vscode } from './common';

interface Provider {
  id: string;
  title: string;
  description: string;
  icon: string;
  prefix: string;
  enabled: boolean;
}
interface Model {
  backend: string;
  id: string;
  label: string;
  detail?: string;
}
interface State {
  platform: string;
  shortcut: string;
  useSlashKey: boolean;
  providers: Provider[];
  ai: {
    label: string;
    provider: string;
    model: string;
    keys: Record<string, boolean>;
    vscode: Model[];
    ollama: Model[];
    cli: Model[];
    other: Model[];
  };
  stack: string[];
  examples: { name: string; title: string; description?: string }[];
}

const STEPS = ['welcome', 'shortcut', 'providers', 'ai', 'stack', 'done'] as const;
type Step = (typeof STEPS)[number];

let state: State | undefined;
let step: Step = 'welcome';
let pressed = false;
let demoTimer: number | undefined;

const post = (m: unknown) => vscode.postMessage(m);
const mac = () => state?.platform === 'darwin';
const keys = (...k: string[]) => k.map((x) => `<kbd>${x}</kbd>`).join('');

function slashKeys(): string[] {
  if (mac()) return state?.useSlashKey ? ['⌘', '/'] : ['⌘', '⇧', ';'];
  return state?.useSlashKey ? ['Ctrl', '/'] : ['Ctrl', '⇧', '/'];
}

function go(next: Step): void {
  step = next;
  post({ type: 'step', step });
  render();
}

function render(): void {
  if (!state) return;
  const i = STEPS.indexOf(step);
  window.clearInterval(demoTimer);
  document.body.innerHTML = `
    <div class="glow" aria-hidden="true"></div>
    <div class="shell">
      <header>
        <div class="brand"><div class="brand-mark">/</div><strong>Slashi</strong></div>
        <div class="dots" role="tablist" aria-label="Onboarding steps">${STEPS.map((s, n) => `<button class="dot${n === i ? ' on' : n < i ? ' done' : ''}" data-go="${s}" aria-label="Step ${n + 1}" ${n === i ? 'aria-current="step"' : ''}></button>`).join('')}</div>
        <button class="skip" data-finish="">Skip</button>
      </header>
      <section class="step" data-step="${step}">${content()}</section>
      <footer>
        ${i > 0 ? `<button class="btn ghost" data-go="${STEPS[i - 1]}">${icon('arrow-left')} Back</button>` : '<span></span>'}
        <span class="hint">${keys('←')} ${keys('→')} to move</span>
        ${i < STEPS.length - 1 ? `<button class="btn" data-go="${STEPS[i + 1]}" id="next">${i === 0 ? 'Get started' : 'Continue'} ${icon('arrow-right')}</button>` : `<button class="btn" data-finish="/" id="next">${icon('lightning')} Open Slashi</button>`}
      </footer>
    </div>`;
  if (step === 'welcome') startDemo();
  (document.getElementById('next') as HTMLElement | null)?.focus();
}

function content(): string {
  const s = state!;
  switch (step) {
    case 'welcome':
      return `<div class="hero">
          <div class="hero-mark" aria-hidden="true">/</div>
          <h1>Do anything in VS Code.<br><span class="grad">Just type /</span></h1>
          <p class="lead">Files, settings, Git, terminal, extensions, scripts and AI in one keyboard-first popup.</p>
        </div>
        <div class="demo" aria-hidden="true">
          <div class="demo-input"><span class="demo-mark">/</span><span id="demo-text"></span><span class="caret"></span></div>
          <div class="demo-row" id="demo-row"></div>
        </div>`;
    case 'shortcut':
      return `<div class="center">
          <h1>Your new favorite shortcut</h1>
          <p class="lead">Press it anywhere in VS Code to open Slashi. Try it now.</p>
          <div class="keycaps${pressed ? ' pressed' : ''}">${slashKeys()
            .map((k) => `<span class="cap">${k}</span>`)
            .join('<span class="plus">+</span>')}</div>
          <p class="pressed-msg${pressed ? ' visible' : ''}">${icon('check-circle')} Perfect — that’s all you need to remember.</p>
          <div class="option">
            <button class="switch" role="switch" aria-checked="${s.useSlashKey}" id="slashkey" aria-label="Use ${mac() ? 'Cmd' : 'Ctrl'}+/ for Slashi"></button>
            <div><strong>Use ${mac() ? '⌘/' : 'Ctrl+/'} for Slashi</strong>
            <span>Toggle Line Comment moves to ${mac() ? '⌘⌥/' : 'Ctrl+Alt+/'} — or type <code>/comment</code>. Turn off to keep VS Code’s default.</span></div>
          </div>
        </div>`;
    case 'providers':
      return `<div class="center wide">
          <h1>Choose what Slashi can do</h1>
          <p class="lead">Everything is on by default. Turn off what you don’t need — fine-tune features later in Studio.</p>
          <div class="providers">${s.providers
            .map(
              (
                p,
              ) => `<button class="provider${p.enabled ? ' on' : ''}" data-provider="${esc(p.id)}" data-toggle="${esc(p.id)}" aria-pressed="${p.enabled}">
              <span class="tile">${icon(p.icon, 'duotone')}</span>
              <span class="text"><strong>${esc(p.title)}</strong><code>/${esc(p.prefix)}</code></span>
              <span class="check">${icon(p.enabled ? 'check-circle' : 'circle')}</span>
            </button>`,
            )
            .join('')}</div>
        </div>`;
    case 'ai':
      return aiStep();
    case 'stack':
      return `<div class="center">
          <h1>${s.stack.length ? 'Slashi knows your project' : 'Slashi learns your project'}</h1>
          <p class="lead">${s.stack.length ? 'Detected in this workspace — matching slash commands are ready:' : 'Open a project and Slashi detects npm, pnpm, yarn, bun, Docker, Make, Python, Rust, Go, .NET, Java and more, then adds commands for them.'}</p>
          ${s.stack.length ? `<div class="stack">${s.stack.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
          ${
            s.examples.length
              ? `<div class="examples">${s.examples.map((e) => `<button class="example" data-open="/${esc(e.name)}"><span class="tile" data-provider="project">${icon('play', 'duotone')}</span><span><strong>/${esc(e.name)}</strong><span>${esc(e.description ?? e.title)}</span></span></button>`).join('')}</div>`
              : `<div class="examples">${['/f readme', '/new src/utils/date.ts', '/git ', '/run npm test'].map((q) => `<div class="example static"><span class="tile" data-provider="files">${icon('lightning', 'duotone')}</span><span><strong>${esc(q)}</strong></span></div>`).join('')}</div>`
          }
        </div>`;
    case 'done':
      return `<div class="center wide">
          <h1>You’re all set ${icon('confetti')}</h1>
          <p class="lead">Shortcuts worth knowing:</p>
          <div class="tips">
            ${tip(keys(...slashKeys()), 'Open Slashi from anywhere')}
            ${tip(keys('Tab'), 'Complete a command, then type its arguments')}
            ${tip(`${keys('⇧', '↵')}`, 'Actions: rename, delete, copy path, hide…')}
            ${tip(keys(mac() ? '⌘' : 'Ctrl', '↵'), 'Hand what you typed to AI')}
            ${tip('<code>/f</code>', 'Create, rename, move and delete files')}
            ${tip('<code>/p</code>', 'Your project’s scripts & tools')}
            ${tip('<code>/do</code>', 'Describe a task in plain English')}
            ${tip('<code>/market</code>', 'Install community action packs')}
          </div>
          <div class="cta">
            <button class="btn ghost" data-command="slashi.newCommand">${icon('plus-circle')} Create my first command</button>
            <button class="btn ghost" data-finish="/market ">${icon('storefront')} Browse the marketplace</button>
            <button class="btn ghost" data-command="slashi.studio">${icon('sliders-horizontal')} Open Studio</button>
          </div>
        </div>`;
  }
}

function tip(keysHtml: string, text: string): string {
  return `<div class="tip"><span class="tip-keys">${keysHtml}</span><span>${text}</span></div>`;
}

function aiStep(): string {
  const ai = state!.ai;
  const option = (title: string, sub: string, iconName: string, provider: string, active: boolean, attrs: string) =>
    `<button class="ai-option${active ? ' on' : ''}" ${attrs}><span class="tile" data-provider="${provider}">${icon(iconName, 'duotone')}</span><span class="text"><strong>${title}</strong><span>${sub}</span></span>${active ? `<span class="check">${icon('check-circle')}</span>` : ''}</button>`;
  const copilot = ai.vscode[0];
  const ollama = ai.ollama[0];
  return `<div class="center">
      <h1>Bring your AI</h1>
      <p class="lead">Slashi uses AI for <code>/ask</code>, <code>/fix</code>, <code>/edit</code>, commit messages and plain-English tasks. Optional — everything else works without it.</p>
      <div class="ai-options">
        ${option('Automatic', ai.label ? `Using ${esc(ai.label)}` : 'Picks the best model available', 'sparkle', 'ai', ai.provider === 'auto', 'data-model="auto"')}
        ${copilot ? option(esc(copilot.label), `Installed in VS Code${copilot.detail ? ` · ${esc(copilot.detail)}` : ''}`, 'github-logo', 'extensions', ai.provider === 'vscode', `data-model='${esc(JSON.stringify(copilot))}'`) : ''}
        ${ai.cli.map((m) => option(esc(m.label), 'Installed · uses your sign-in, no API key', 'terminal-window', 'terminal', ai.provider === m.backend, `data-model='${esc(JSON.stringify(m))}'`)).join('')}
        ${ollama ? option(`Ollama · ${esc(ollama.id)}`, 'Running locally — free and private', 'cpu', 'terminal', ai.provider === 'ollama', `data-model='${esc(JSON.stringify(ollama))}'`) : ''}
        ${option('Claude', ai.keys.anthropic ? 'Key saved' : 'Add an Anthropic API key', 'sparkle', 'naturalLanguage', ai.provider === 'anthropic', 'data-key="anthropic"')}
        ${option('OpenAI', ai.keys.openai ? 'Key saved' : 'Add an OpenAI API key', 'open-ai-logo', 'project', ai.provider === 'openai', 'data-key="openai"')}
      </div>
      <p class="small">${icon('lock-key')} Keys live in VS Code Secret Storage. Ollama, LM Studio and other servers can be set up in <a href="#" data-command="slashi.studio" data-arg="ai">Studio</a>.</p>
    </div>`;
}

const DEMO = [
  { q: 'format', title: 'Format Document', icon: 'magic-wand', provider: 'commands', slash: '/format' },
  { q: 'git push', title: 'Git: Push', icon: 'cloud-arrow-up', provider: 'git', slash: '/push' },
  { q: 'f readme', title: 'README.md', icon: 'book-open', provider: 'files', slash: 'Files' },
  { q: 'test', title: 'npm: test', icon: 'flask', provider: 'project', slash: '/test' },
  { q: 'ask why is this slow?', title: 'Ask AI: “why is this slow?”', icon: 'chat-circle-dots', provider: 'ai', slash: 'AI' },
  { q: 'set font size', title: 'Editor: Font Size', icon: 'text-aa', provider: 'settings', slash: '14' },
];

function startDemo(): void {
  const text = document.getElementById('demo-text');
  const row = document.getElementById('demo-row');
  if (!text || !row) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    text.textContent = DEMO[0].q;
    row.innerHTML = demoRow(DEMO[0]);
    return;
  }
  let item = 0;
  let char = 0;
  let hold = 0;
  demoTimer = window.setInterval(() => {
    const d = DEMO[item];
    if (char < d.q.length) {
      text.textContent = d.q.slice(0, ++char);
      if (char === 1) row.innerHTML = demoRow(d);
    } else if (++hold > 22) {
      hold = 0;
      char = 0;
      item = (item + 1) % DEMO.length;
      text.textContent = '';
      row.innerHTML = '';
    }
  }, 70);
}

function demoRow(d: (typeof DEMO)[number]): string {
  return `<span class="tile" data-provider="${d.provider}">${icon(d.icon, 'duotone')}</span><strong>${esc(d.title)}</strong><span class="grow"></span><span class="demo-meta">${esc(d.slash)}</span><kbd>↵</kbd>`;
}

window.addEventListener('message', (event) => {
  const m = event.data;
  if (m.type === 'state') {
    const first = !state;
    state = m.state;
    if (first) post({ type: 'step', step });
    render();
  } else if (m.type === 'shortcutPressed') {
    pressed = true;
    render();
  }
});

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button, a');
  if (!el) return;
  const d = el.dataset;
  if (d.go) go(d.go as Step);
  else if (d.finish !== undefined) post({ type: 'finish', open: d.finish || undefined });
  else if (d.toggle) post({ type: 'toggleProvider', id: d.toggle, enabled: el.getAttribute('aria-pressed') !== 'true' });
  else if (el.id === 'slashkey') post({ type: 'useSlashKey', value: el.getAttribute('aria-checked') !== 'true' });
  else if (d.model) post({ type: 'useModel', model: d.model === 'auto' ? 'auto' : JSON.parse(d.model) });
  else if (d.key) post({ type: 'setKey', backend: d.key });
  else if (d.command) post({ type: 'command', command: d.command, args: d.arg });
  else if (d.open) post({ type: 'finish', open: `${d.open} ` });
  e.preventDefault();
});

document.addEventListener('keydown', (e) => {
  const i = STEPS.indexOf(step);
  // The shortcut step listens for the real key too (in case VS Code doesn't intercept it first).
  if (step === 'shortcut' && e.key === '/' && (e.metaKey || e.ctrlKey)) {
    pressed = true;
    render();
    e.preventDefault();
    return;
  }
  if (e.key === 'ArrowRight' && i < STEPS.length - 1) go(STEPS[i + 1]);
  else if (e.key === 'ArrowLeft' && i > 0) go(STEPS[i - 1]);
  else if (e.key === 'Escape') post({ type: 'finish' });
  else return;
  e.preventDefault();
});

document.body.innerHTML = '<div class="shell"></div>';
post({ type: 'ready' });
