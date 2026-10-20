// AI answer panel: streams Markdown, renders it safely, and offers Apply/Insert/Copy actions.

import { Marked } from 'marked';
import { stripFences } from '../core/text';
import { $, esc, icon, MOD, vscode } from './common';

type Mode = 'answer' | 'edit' | 'insert';

type HostMessage =
  | { type: 'start'; title: string; prompt: string; mode: Mode; target?: string }
  | { type: 'user'; text: string }
  | { type: 'model'; label: string }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

const codeBlocks: { code: string; lang: string }[] = [];

// Raw HTML from the model is escaped, never rendered.
const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return esc(text);
    },
    code({ text, lang }) {
      const i = codeBlocks.push({ code: text, lang: lang ?? '' }) - 1;
      return `<div class="code"><div class="bar"><span class="lang">${esc(lang || 'text')}</span>
        <button data-copy="${i}" title="Copy">${icon('copy')} Copy</button>
        <button data-insert="${i}" title="Insert at cursor">${icon('arrow-square-in')} Insert</button>
        <button data-file="${i}" title="Open as new file">${icon('file-plus')} New file</button></div>
        <pre><code>${esc(text)}</code></pre></div>`;
    },
    link({ href, text }) {
      const safe = /^(https?:|mailto:)/i.test(href) ? href : '#';
      return `<a href="${esc(safe)}">${esc(text)}</a>`;
    },
    image({ text }) {
      return esc(text);
    },
  },
});

document.body.innerHTML = `
  <header>
    <div class="tile" data-provider="ai">${icon('sparkle', 'duotone')}</div>
    <div><div class="title" id="title">Slashi AI</div><div class="target" id="target"></div></div>
    <span class="grow"></span>
    <span class="model-chip" id="model" hidden>${icon('sparkle')} <span></span></span>
  </header>
  <main id="main"><div class="thread" id="thread"></div></main>
  <div class="toolbar" id="toolbar"></div>
  <footer>
    <div class="composer">
      <textarea id="follow" rows="1" placeholder="Ask a follow-up…  (Enter to send, Shift+Enter for a new line)"></textarea>
      <button class="btn" id="send" title="Send">${icon('paper-plane-right')}</button>
    </div>
  </footer>`;

const thread = $('#thread');
const main = $('#main');
const toolbar = $('#toolbar');
const follow = $('#follow') as HTMLTextAreaElement;
let mode: Mode = 'answer';
/** The streaming bubble; `start` is where its code blocks begin in `codeBlocks`. */
let current: { el: HTMLElement; text: string; start: number } | undefined;
let streaming = false;
let lastAnswer = '';
let frame = 0;

function bubbleUser(text: string): void {
  const el = document.createElement('div');
  el.className = 'bubble-user';
  el.textContent = text;
  thread.appendChild(el);
}

function bubbleAi(): void {
  const wrap = document.createElement('div');
  wrap.className = 'bubble-ai';
  wrap.innerHTML = `<div class="tile avatar" data-provider="ai">${icon('sparkle', 'duotone')}</div><div class="content cursor"></div>`;
  thread.appendChild(wrap);
  current = { el: wrap.querySelector('.content') as HTMLElement, text: '', start: codeBlocks.length };
}

function renderCurrent(): void {
  frame = 0;
  if (!current) return;
  const nearBottom = main.scrollHeight - main.scrollTop - main.clientHeight < 80;
  // Each render re-parses the whole answer: replace this bubble's blocks instead of appending them again.
  codeBlocks.length = current.start;
  current.el.innerHTML = marked.parse(current.text) as string;
  if (nearBottom) main.scrollTop = main.scrollHeight;
}

function renderToolbar(): void {
  if (streaming) {
    toolbar.innerHTML = `<button class="btn ghost" id="stop">${icon('stop')} Stop</button><span class="grow"></span><span class="hint"><kbd>Esc</kbd> stop</span>`;
    return;
  }
  if (!lastAnswer) {
    toolbar.innerHTML = '';
    return;
  }
  const primary =
    mode === 'edit'
      ? `<button class="btn" id="apply">${icon('check')} Apply to file</button>`
      : mode === 'insert'
        ? `<button class="btn" id="apply">${icon('arrow-square-in')} Insert</button>`
        : '';
  toolbar.innerHTML = `${primary}
    <button class="btn ghost" id="copy">${icon('copy')} Copy</button>
    <button class="btn ghost" id="newfile">${icon('file-plus')} Open as file</button>
    <span class="grow"></span>
    ${primary ? `<span class="hint"><kbd>${MOD}</kbd><kbd>↵</kbd> ${mode === 'edit' ? 'apply' : 'insert'}</span>` : ''}`;
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const m = event.data;
  switch (m.type) {
    case 'start':
      mode = m.mode;
      thread.innerHTML = '';
      codeBlocks.length = 0;
      lastAnswer = '';
      ($('#title') as HTMLElement).textContent = m.title;
      ($('#target') as HTMLElement).textContent = m.target ?? '';
      bubbleUser(m.prompt);
      bubbleAi();
      streaming = true;
      renderToolbar();
      break;
    case 'user':
      bubbleUser(m.text);
      bubbleAi();
      streaming = true;
      renderToolbar();
      break;
    case 'model': {
      const chip = $('#model');
      chip.hidden = false;
      (chip.querySelector('span') as HTMLElement).textContent = m.label;
      break;
    }
    case 'delta':
      if (!current) bubbleAi();
      current!.text += m.text;
      if (!frame) frame = requestAnimationFrame(renderCurrent);
      break;
    case 'done':
      if (current) {
        renderCurrent();
        current.el.classList.remove('cursor');
        lastAnswer = current.text;
        if (!current.text.trim()) current.el.innerHTML = '<span class="muted">Stopped.</span>';
      }
      current = undefined;
      streaming = false;
      renderToolbar();
      follow.focus();
      break;
    case 'error':
      if (current) {
        current.el.classList.remove('cursor');
        current.el.innerHTML = `<div class="error">${esc(m.message)}</div>`;
      }
      current = undefined;
      streaming = false;
      renderToolbar();
      break;
  }
});

document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!target) return;
  const block = (attr: string) => codeBlocks[Number(target.getAttribute(attr))];
  if (target.hasAttribute('data-copy')) vscode.postMessage({ type: 'copy', text: block('data-copy').code });
  else if (target.hasAttribute('data-insert')) vscode.postMessage({ type: 'insert', text: block('data-insert').code });
  else if (target.hasAttribute('data-file')) vscode.postMessage({ type: 'newFile', text: block('data-file').code, language: block('data-file').lang });
  else if (target.id === 'apply') vscode.postMessage({ type: 'apply', text: lastAnswer });
  else if (target.id === 'copy') vscode.postMessage({ type: 'copy', text: lastAnswer });
  else if (target.id === 'newfile') vscode.postMessage({ type: 'newFile', text: mode === 'answer' ? lastAnswer : stripFences(lastAnswer) });
  else if (target.id === 'stop') vscode.postMessage({ type: 'stop' });
  else if (target.id === 'send') send();
});

function send(): void {
  const text = follow.value.trim();
  if (!text || streaming) return;
  follow.value = '';
  follow.style.height = '';
  vscode.postMessage({ type: 'followup', text });
}

follow.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    send();
  }
});
follow.addEventListener('input', () => {
  follow.style.height = 'auto';
  follow.style.height = `${Math.min(follow.scrollHeight, 160)}px`;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && streaming) {
    vscode.postMessage({ type: 'stop' });
    e.preventDefault();
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && lastAnswer && mode !== 'answer') {
    vscode.postMessage({ type: 'apply', text: lastAnswer });
    e.preventDefault();
  }
});

vscode.postMessage({ type: 'ready' });
