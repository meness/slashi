// Studio: providers & features, AI connection, commands, shortcuts.

import { esc, icon, isMac, vscode } from './common';

interface Feature {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
}
interface Provider {
  id: string;
  title: string;
  description: string;
  icon: string;
  prefix: string;
  /** Extension that registered it, for providers added through the API. */
  source?: string;
  enabled: boolean;
  features: Feature[];
}
interface Model {
  backend: string;
  id: string;
  label: string;
  detail?: string;
}
interface State {
  version: string;
  platform: string;
  popupStyle: string;
  useSlashKey: boolean;
  statusBar: boolean;
  inlineTrigger: boolean;
  history: boolean;
  providers: Provider[];
  ai: {
    provider: string;
    model: string;
    baseUrl: string;
    effort: string;
    confirm: boolean;
    customInstructions: string;
    label: string;
    keys: Record<string, boolean>;
    models: Model[];
  };
  commands: { name: string; title: string; description?: string; icon: string; category: string }[];
  packs: { id: string; name: string; version: string; commands: number }[];
  stack: string[];
}

const TABS = [
  { id: 'providers', title: 'Providers', icon: 'squares-four' },
  { id: 'ai', title: 'AI & Models', icon: 'sparkle' },
  { id: 'commands', title: 'My Commands', icon: 'lightning-a' },
  { id: 'shortcuts', title: 'Shortcuts', icon: 'keyboard' },
  { id: 'general', title: 'General', icon: 'sliders-horizontal' },
  { id: 'help', title: 'Help & Support', icon: 'lifebuoy' },
];

const BACKENDS = [
  { id: 'auto', title: 'Auto', note: 'Best available' },
  { id: 'vscode', title: 'VS Code / Copilot', note: 'Installed chat models' },
  { id: 'anthropic', title: 'Claude', note: 'Anthropic API key' },
  { id: 'openai', title: 'OpenAI', note: 'OpenAI API key' },
  { id: 'ollama', title: 'Ollama', note: 'Local, free' },
  { id: 'openaiCompatible', title: 'Compatible', note: 'LM Studio, Groq, OpenRouter…' },
  { id: 'claudeCode', title: 'Claude Code', note: 'Your Claude sign-in' },
  { id: 'codex', title: 'Codex', note: 'Your ChatGPT sign-in' },
];

let state: State | undefined;
let tab = (vscode.getState<{ tab?: string }>()?.tab as string) || 'providers';
let test: { ok: boolean; text: string; ms: number; label?: string } | undefined;
let testing = false;

const post = (message: unknown) => vscode.postMessage(message);
const sw = (on: boolean, attrs: string) => `<button class="switch" role="switch" aria-checked="${on}" ${attrs}></button>`;

// Patches the live DOM toward `to` instead of replacing it, so focus survives and switch/opacity transitions play.
function morph(from: Node, to: Node): void {
  const a = [...from.childNodes];
  const b = [...to.childNodes];
  if (a.length !== b.length) return (from as Element).replaceChildren(...b); // text nodes have no children, so lengths only differ on elements
  a.forEach((node, i) => {
    const next = b[i];
    if (node.nodeName !== next.nodeName) return node.parentNode!.replaceChild(next, node);
    if (node instanceof Element && next instanceof Element) {
      for (const { name } of Array.from(node.attributes)) if (!next.hasAttribute(name)) node.removeAttribute(name);
      for (const { name, value } of Array.from(next.attributes)) if (node.getAttribute(name) !== value) node.setAttribute(name, value);
    } else if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue;
    morph(node, next);
    // A field the user typed in ignores its value attribute, so sync the live value (unless they're still typing there).
    const field = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement;
    if (field && node !== document.activeElement) node.value = (next as typeof node).value;
  });
}

function render(): void {
  if (!state) return;
  const next = document.createElement('div');
  next.innerHTML = `<div class="layout">
    <nav aria-label="Studio sections">
      <div class="brand"><div class="brand-mark">/</div><div><strong>Slashi Studio</strong><span>Make Slashi yours</span></div></div>
      ${TABS.map((t) => `<button data-tab="${t.id}" ${t.id === tab ? 'aria-current="page"' : ''}>${icon(t.icon)} ${t.title}</button>`).join('')}
      <span class="grow"></span>
      <span class="version">v${esc(state.version)}</span>
    </nav>
    <main>${page()}</main>
  </div>`;
  morph(document.body, next);
}

function page(): string {
  switch (tab) {
    case 'ai':
      return aiPage();
    case 'commands':
      return commandsPage();
    case 'shortcuts':
      return shortcutsPage();
    case 'general':
      return generalPage();
    case 'help':
      return helpPage();
    default:
      return providersPage();
  }
}

function providersPage(): string {
  const s = state!;
  return `<div class="page">
    <h1>Providers</h1>
    <p class="lead">Choose what Slashi can do. Turn off a whole provider, or just some of its features.</p>
    ${s.stack.length ? `<div class="panel"><h2>${icon('stack')} Detected in this workspace</h2><div class="stack">${s.stack.map((t) => `<span>${esc(t)}</span>`).join('')}</div></div>` : ''}
    <div class="grid">
      ${s.providers
        .map(
          (p) => `<div class="card${p.enabled ? '' : ' off'}" data-provider="${esc(p.id)}">
          <div class="head">
            <div class="tile">${icon(p.icon, 'duotone')}</div>
            <div class="text"><strong>${esc(p.title)}</strong><code>/${esc(p.prefix)}</code></div>
            ${sw(p.enabled, `data-provider-toggle="${esc(p.id)}" aria-label="Enable ${esc(p.title)}"`)}
          </div>
          <div class="desc">${esc(p.description)}${p.source ? ` <span class="source">From ${esc(p.source)}</span>` : ''}</div>
          ${
            p.features.length
              ? `<div class="chips">${p.features
                  .map(
                    (f) =>
                      `<button class="chip" aria-pressed="${esc(String(f.enabled))}" ${p.enabled ? '' : 'disabled'} data-feature="${esc(p.id)}|${esc(f.id)}" title="${esc(f.description)}">${icon(f.enabled ? 'check' : 'minus')} ${esc(f.title)}</button>`,
                  )
                  .join('')}</div>`
              : ''
          }
        </div>`,
        )
        .join('')}
    </div>
  </div>`;
}

function aiPage(): string {
  const ai = state!.ai;
  const needsKey = ['anthropic', 'openai', 'openaiCompatible'].includes(ai.provider);
  const needsUrl = ['ollama', 'openaiCompatible'].includes(ai.provider);
  const models = ai.models.filter((m) => ai.provider === 'auto' || m.backend === ai.provider);
  return `<div class="page">
    <h1>AI & Models</h1>
    <p class="lead">Slashi works with GitHub Copilot and any model installed in VS Code, your Claude Code or Codex sign-in, Claude, OpenAI, local Ollama, or any OpenAI-compatible server. API keys are kept in VS Code Secret Storage.</p>
    <div class="panel">
      <h2>${icon('plugs-connected')} Status</h2>
      <div class="status-line"><span class="status-dot${ai.label ? ' ok' : ''}"></span>
        <strong>${ai.label ? esc(ai.label) : 'Not connected'}</strong>
        <span class="grow"></span>
        <button class="btn ghost" data-cmd="test" ${testing ? 'disabled' : ''}>${icon('lightning')} ${testing ? 'Testing…' : 'Test connection'}</button>
      </div>
      ${test ? `<div class="test-result ${test.ok ? 'ok' : 'fail'}">${test.ok ? `${icon('check-circle')} ${esc(test.label ?? '')} replied in ${esc(String(test.ms))} ms: “${esc(test.text)}”` : `${icon('warning')} ${esc(test.text)}`}</div>` : ''}
    </div>
    <div class="panel">
      <h2>${icon('cpu')} Provider</h2>
      <div class="providers">${BACKENDS.map((b) => `<button class="provider-option" aria-pressed="${ai.provider === b.id}" data-backend="${b.id}"><strong>${b.title}</strong><span>${b.note}${ai.keys[b.id] ? ' · key ✓' : ''}</span></button>`).join('')}</div>
      <div class="field">
        <label for="model">Model</label>
        <div class="row-actions">
          <select id="model" data-config="ai.model">
            <option value="">Default for this provider</option>
            ${models.map((m) => `<option value="${esc(m.id)}" data-backend="${esc(m.backend)}" ${m.id === ai.model ? 'selected' : ''}>${esc(m.label)}${m.detail ? ` — ${esc(m.detail)}` : ''}</option>`).join('')}
            ${ai.model && !models.some((m) => m.id === ai.model) ? `<option value="${esc(ai.model)}" selected>${esc(ai.model)}</option>` : ''}
          </select>
          <button class="btn ghost" data-cmd="refresh" title="Refresh models">${icon('arrows-clockwise')}</button>
        </div>
        ${needsUrl ? `<label for="baseUrl">Server URL</label><input id="baseUrl" data-config="ai.baseUrl" value="${esc(ai.baseUrl)}" placeholder="${ai.provider === 'ollama' ? 'http://localhost:11434/v1' : 'http://localhost:1234/v1'}">` : ''}
        ${
          needsKey
            ? `<label>API key</label><div class="row-actions"><button class="btn" data-key="${esc(ai.provider)}">${icon('key')} ${ai.keys[ai.provider] ? 'Replace key' : 'Add key'}</button>${ai.keys[ai.provider] ? `<button class="btn danger" data-clear="${esc(ai.provider)}">${icon('trash')} Remove</button>` : ''}</div>`
            : ''
        }
        ${ai.provider === 'anthropic' ? `<label for="effort">Effort</label><select id="effort" data-config="ai.anthropicEffort">${['low', 'medium', 'high'].map((e) => `<option ${e === ai.effort ? 'selected' : ''}>${e}</option>`).join('')}</select>` : ''}
      </div>
    </div>
    <div class="panel">
      <h2>${icon('magic-wand')} Behaviour</h2>
      <div class="field">
        <label>Confirm Do-with-AI plans</label><div>${sw(ai.confirm, 'data-bool="ai.confirmBeforeRun"')}</div>
        <label for="instr">Custom instructions</label><textarea id="instr" data-config="ai.customInstructions" placeholder="e.g. Prefer functional style. Answer in British English.">${esc(ai.customInstructions)}</textarea>
      </div>
    </div>
  </div>`;
}

function commandsPage(): string {
  const s = state!;
  return `<div class="page">
    <h1>My Commands</h1>
    <p class="lead">Chain slash commands, VS Code commands, terminal scripts, settings and AI prompts into your own slash commands — or install packs from the marketplace.</p>
    <div class="row-actions top">
      <button class="btn" data-run="slashi.newCommand">${icon('plus')} New command</button>
      <button class="btn ghost" data-run="slashi.editTeamCommands">${icon('users-three')} Team commands</button>
      <button class="btn ghost" data-run="slashi.openMarketplace">${icon('storefront')} Marketplace</button>
      <button class="btn ghost" data-run="slashi.exportPack">${icon('export')} Export as pack</button>
    </div>
    <div class="panel"><h2>${icon('lightning-a')} Commands</h2>
      ${
        s.commands.length
          ? `<div class="list">${s.commands.map((c) => `<div class="item" data-provider="custom"><div class="tile">${icon(c.icon, 'duotone')}</div><div class="text"><strong>/${esc(c.name)}</strong><span>${esc(c.title)}${c.description ? ` — ${esc(c.description)}` : ''}</span></div><span class="muted">${esc(c.category)}</span></div>`).join('')}</div>`
          : `<p class="muted">No custom commands yet. Create one with the wizard — no JSON required.</p>`
      }
    </div>
    <div class="panel"><h2>${icon('package')} Installed packs</h2>
      ${s.packs.length ? `<div class="list">${s.packs.map((p) => `<div class="item"><div class="text"><strong>${esc(p.name)}</strong><span>v${esc(p.version)} · ${esc(String(p.commands))} commands</span></div></div>`).join('')}</div>` : `<p class="muted">No packs installed. Browse the marketplace with <code>/market</code>.</p>`}
    </div>
  </div>`;
}

function shortcutsPage(): string {
  const mac = state!.platform === 'darwin' || isMac;
  const k = (...keys: string[]) => `<span class="keys">${keys.map((x) => `<kbd>${x}</kbd>`).join('')}</span>`;
  const rows: [string, string][] = [
    ['Open Slashi', mac ? k('⌘', '/') : k('Ctrl', '/')],
    ['Toggle line comment (moved)', mac ? k('⌘', '⌥', '/') : k('Ctrl', 'Alt', '/')],
    ['Do with AI', mac ? k('⌃', '⌘', '/') : k('Ctrl', 'Shift', 'Alt', '/')],
    ['Run the highlighted result', k('↵')],
    ['Complete the slash name / enter a scope', k('Tab')],
    ['Open the actions menu', `${k('⇧', '↵')} or ${k('→')}`],
    ['Run the first action (e.g. open to the side)', k(mac ? '⌥' : 'Alt', '↵')],
    ['Ask/Do with AI using what you typed', k(mac ? '⌘' : 'Ctrl', '↵')],
    ['Move', `${k('↑')} ${k('↓')} or ${k('Ctrl', 'N')} ${k('Ctrl', 'P')}`],
    ['Clear, then close', k('Esc')],
  ];
  return `<div class="page">
    <h1>Shortcuts</h1>
    <p class="lead">Everything works from the keyboard. Rebind any of these in VS Code’s Keyboard Shortcuts editor — on macOS and Windows/Linux independently.</p>
    <div class="row-actions top">
      <button class="btn" data-run="slashi.customizeShortcuts">${icon('keyboard')} Customize shortcuts</button>
    </div>
    <div class="panel">${rows.map(([what, keys]) => `<div class="kbd-row"><span>${what}</span>${keys}</div>`).join('')}</div>
    <div class="panel"><h2>${icon('lightning')} Bind any slash command to a key</h2>
      <p class="muted">Add this to <code>keybindings.json</code> (or use “Assign a keyboard shortcut…” in any result’s actions menu):</p>
      <pre><code>{ "key": "${mac ? 'cmd+alt+u' : 'ctrl+alt+u'}", "command": "slashi.run", "args": "/upper" }
{ "key": "${mac ? 'cmd+alt+g' : 'ctrl+alt+g'}", "command": "slashi.open", "args": "/git " }</code></pre>
    </div>
  </div>`;
}

function generalPage(): string {
  const s = state!;
  return `<div class="page">
    <h1>General</h1>
    <p class="lead">How Slashi looks and behaves.</p>
    <div class="panel"><h2>${icon('app-window')} Popup</h2>
      <div class="providers">
        <button class="provider-option" aria-pressed="${s.popupStyle === 'spotlight'}" data-style="spotlight"><strong>Spotlight</strong><span>Custom design, action menus</span></button>
        <button class="provider-option" aria-pressed="${s.popupStyle === 'native'}" data-style="native"><strong>Native</strong><span>VS Code Quick Pick</span></button>
      </div>
      <div class="field">
        <label>${s.platform === 'darwin' ? '⌘/' : 'Ctrl+/'} opens Slashi</label><div>${sw(s.useSlashKey, 'data-bool="shortcut.useSlashKey"')}</div>
        <label>Status bar button</label><div>${sw(s.statusBar, 'data-bool="statusBar.enabled"')}</div>
        <label>Inline “/” in the editor</label><div>${sw(s.inlineTrigger, 'data-bool="inlineTrigger.enabled"')}</div>
        <label>Rank by recent use</label><div>${sw(s.history, 'data-bool="history.enabled"')}</div>
      </div>
    </div>
    <div class="row-actions">
      <button class="btn ghost" data-run="slashi.clearHistory">${icon('clock-counter-clockwise')} Clear history</button>
      <button class="btn ghost" data-run="workbench.action.openSettings" data-arg="@ext:meness.slashi">${icon('gear-six')} All settings</button>
      <button class="btn ghost" data-run="slashi.welcome">${icon('rocket-launch')} Replay onboarding</button>
    </div>
  </div>`;
}

function helpPage(): string {
  const run = (command: string, label: string, ic: string, arg?: string) =>
    `<button class="btn ghost" data-run="${esc(command)}"${arg ? ` data-arg="${esc(arg)}"` : ''}>${icon(ic)} ${label}</button>`;
  const link = (key: string, label: string, ic: string) =>
    `<button class="btn ghost" data-link="${esc(key)}">${icon(ic)} ${label}</button>`;
  return `<div class="page">
    <h1>Help & Support</h1>
    <p class="lead">Learn Slashi, fix a problem, send feedback, or help keep the project going.</p>
    <div class="panel"><h2>${icon('book-open')} Get started</h2>
      <div class="row-actions">
        ${run('slashi.welcome', 'Replay onboarding', 'rocket-launch')}
        ${run('workbench.action.openWalkthrough', 'Open walkthrough', 'map-trifold', 'meness.slashi#slashi.welcome')}
        <button class="btn ghost" data-tab="shortcuts">${icon('keyboard')} Keyboard shortcuts</button>
        ${link('docs', 'Documentation', 'book-bookmark')}
        ${link('packs', 'Build an action pack', 'puzzle-piece')}
      </div>
    </div>
    <div class="panel"><h2>${icon('lifebuoy')} Troubleshoot</h2>
      <p class="muted">Check the log, or refresh if results look out of date. When you report a bug, include the diagnostics: versions and setup only, never keys, file names or code.</p>
      <div class="row-actions">
        <button class="btn" data-run="slashi.copyDiagnostics">${icon('clipboard-text')} Copy diagnostics</button>
        ${run('slashi.run', 'Show log', 'scroll', '/slashi-log')}
        ${run('slashi.refresh', 'Refresh search results', 'arrows-clockwise')}
        <button class="btn ghost" data-tab="ai" data-cmd="test">${icon('plugs-connected')} Test AI connection</button>
      </div>
    </div>
    <div class="panel"><h2>${icon('chat-teardrop-text')} Feedback</h2>
      <div class="row-actions">
        ${link('bug', 'Report a bug', 'bug')}
        ${link('idea', 'Suggest a feature', 'lightbulb')}
        ${link('rate', 'Rate on the Marketplace', 'star')}
        ${link('openVsx', 'Rate on Open VSX', 'star')}
        ${link('source', 'Star on GitHub', 'github-logo')}
      </div>
    </div>
    <div class="panel"><h2>${icon('code')} For developers</h2>
      <p class="muted">You’re running Slashi <code>v${esc(state!.version)}</code>.</p>
      <div class="row-actions">
        ${link('changelog', 'What’s new', 'git-commit')}
        ${link('source', 'Source code', 'github-logo')}
        ${link('api', 'Extension API', 'brackets-curly')}
        ${link('security', 'Security policy', 'shield-check')}
      </div>
    </div>
    <div class="panel"><h2>${icon('heart')} Support Slashi</h2>
      <p class="muted">Slashi is free and open source, with no ads and no tracking. If it saves you time, a donation helps pay for new features and fixes.</p>
      <div class="row-actions"><button class="btn" data-link="donate">${icon('hand-heart')} Donate</button></div>
    </div>
  </div>`;
}

function startTest(): void {
  testing = true;
  test = undefined;
  render();
  post({ type: 'testAi' });
}

window.addEventListener('message', (event) => {
  const m = event.data;
  if (m.type === 'state') {
    state = m.state;
    if (m.tab) tab = m.tab;
    render();
  } else if (m.type === 'tab') {
    tab = m.tab;
    render();
  } else if (m.type === 'test') {
    testing = false;
    test = m;
    render();
  }
});

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!el || !state) return;
  const d = el.dataset;
  // Flip switches now so the thumb slides on click; the host's state echo then matches and morph() leaves it alone.
  if (el.getAttribute('role') === 'switch') el.setAttribute('aria-checked', String(el.getAttribute('aria-checked') !== 'true'));
  if (d.tab) {
    tab = d.tab;
    vscode.setState({ tab });
    if (d.cmd === 'test') startTest();
    else render();
  } else if (d.providerToggle) post({ type: 'toggleProvider', id: d.providerToggle, enabled: el.getAttribute('aria-checked') === 'true' });
  else if (d.feature) {
    const [provider, feature] = d.feature.split('|');
    post({ type: 'toggleFeature', provider, feature, enabled: el.getAttribute('aria-pressed') !== 'true' });
  } else if (d.backend) {
    post({ type: 'setConfig', key: 'ai.provider', value: d.backend });
    post({ type: 'setConfig', key: 'ai.model', value: '' });
    test = undefined;
  } else if (d.key) post({ type: 'setKey', backend: d.key });
  else if (d.clear) post({ type: 'clearKey', backend: d.clear });
  else if (d.bool) post({ type: 'setConfig', key: d.bool, value: el.getAttribute('aria-checked') === 'true' });
  else if (d.style) post({ type: 'setConfig', key: 'popup.style', value: d.style });
  else if (d.run) post({ type: 'command', command: d.run, args: d.arg });
  else if (d.link) post({ type: 'openLink', link: d.link });
  else if (d.cmd === 'test') startTest();
  else if (d.cmd === 'refresh') post({ type: 'refreshModels' });
});

document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const key = el.dataset.config;
  if (!key) return;
  if (key === 'ai.model' && el instanceof HTMLSelectElement) {
    const option = el.selectedOptions[0];
    const backend = option?.dataset.backend;
    // CLI backends have one model with id '', so a backend alone is enough to select it.
    if (backend) post({ type: 'selectModel', model: { backend, id: el.value, label: option.textContent ?? el.value } });
    else post({ type: 'setConfig', key, value: el.value });
    return;
  }
  post({ type: 'setConfig', key, value: el.value });
});

document.body.innerHTML = `<div class="layout"><nav></nav><main><div class="page"><h1>Slashi Studio</h1><p class="lead">Loading…</p></div></main></div>`;
post({ type: 'ready' });
