import * as vscode from 'vscode';
import { get, updateGlobal } from '../config';
import { innermostRoot } from '../core/paths';
import { stripFences } from '../core/text';
import { BACKEND_LABELS } from '../llm/types';
import type { Services } from '../services/services';
import type { RunContext, SlashItem, SlashProvider } from '../types';
import { ensureArgs, itemFactory } from './util';

const make = itemFactory('ai', 'AI');
const MAX_CONTEXT = 60_000;

export function baseSystem(services: Services, extra = ''): string {
  const custom = get('ai.customInstructions', '').trim();
  return [
    'You are Slashi, an expert software engineer working inside VS Code. Be accurate, direct and concise. Use Markdown; put code in fenced blocks with a language tag.',
    services.stack.length ? `The project uses: ${services.stack.join(', ')}.` : '',
    extra,
    custom ? `Developer instructions: ${custom}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const EDIT_RULES =
  'Reply with ONLY the complete replacement code for the snippet — no explanations, no Markdown fences. Preserve the original indentation, style and language.';

interface CodeContext {
  editor?: vscode.TextEditor;
  language: string;
  file: string;
  code: string;
  hasSelection: boolean;
  /** The code was cut at MAX_CONTEXT, so the model never saw all of what an edit would replace. */
  truncated: boolean;
  diagnostics: string;
}

async function codeContext(ctx: RunContext, requireCode: boolean): Promise<CodeContext | undefined> {
  const editor = await ctx.editor();
  if (!editor) {
    if (requireCode) void vscode.window.showWarningMessage('Open a file first. Select code to work on just that part.');
    return requireCode ? undefined : { language: '', file: '', code: '', hasSelection: false, truncated: false, diagnostics: '' };
  }
  const doc = editor.document;
  const sel = editor.selection;
  const hasSelection = !sel.isEmpty;
  const range = hasSelection ? new vscode.Range(sel.start, sel.end) : new vscode.Range(0, 0, doc.lineCount, 0);
  const includeFile = hasSelection || requireCode || get('ai.includeFileContext', true);
  let code = includeFile ? doc.getText(range) : '';
  const truncated = code.length > MAX_CONTEXT;
  if (truncated) code = `${code.slice(0, MAX_CONTEXT)}\n… (truncated)`;
  const diagnostics = vscode.languages
    .getDiagnostics(doc.uri)
    .filter((d) => range.intersection(d.range))
    .slice(0, 30)
    .map((d) => `- line ${d.range.start.line + 1}: ${d.message}${d.source ? ` (${d.source})` : ''}`)
    .join('\n');
  return {
    editor,
    language: doc.languageId,
    file: doc.isUntitled ? 'untitled' : vscode.workspace.asRelativePath(doc.uri),
    code,
    hasSelection,
    truncated,
    diagnostics,
  };
}

function codeBlock(c: CodeContext): string {
  if (!c.code) return '';
  return `${c.hasSelection ? 'Selected code' : 'File'} from ${c.file} (${c.language}):\n\`\`\`${c.language}\n${c.code}\n\`\`\``;
}

/** AI commands powered by the configured LLM. */
export class AiProvider implements SlashProvider {
  readonly id = 'ai' as const;
  readonly title = 'AI';
  readonly description = 'Ask, explain, fix, document, test, review and edit code with your AI model.';
  readonly icon = 'sparkle';
  readonly prefix = 'ai';
  readonly placeholder = 'Ask AI or pick an AI command…';
  readonly features = [
    { id: 'ask', title: 'Ask', description: '/ask, /explain, /summarize.' },
    { id: 'code', title: 'Code actions', description: '/fix, /doc, /tests, /review, /edit, /convert, /name.' },
    { id: 'commitMessage', title: 'Commit messages', description: '/commit-msg writes a commit message from your staged changes.' },
    { id: 'generate', title: 'Generators', description: '/regex and /shell.' },
    { id: 'models', title: 'Models', description: '/models, /ai-setup, /ai-key.' },
  ];

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(private readonly services: Services) {
    services.ai.onDidChange(() => this.emitter.fire());
  }

  items(): SlashItem[] {
    const s = this.services;
    const answer = (title: string, prompt: string, user: string, c?: CodeContext, extra = '') =>
      s.showAnswer({ title, prompt, system: baseSystem(s, extra), user, mode: 'answer', editor: c?.editor, language: c?.language });
    const edit = async (title: string, prompt: string, instruction: string, c: CodeContext) => {
      // Applying an answer for cut-off code would delete everything after the cut.
      if (c.truncated)
        throw new Error(
          `${c.hasSelection ? 'The selection' : c.file} is too large to edit in one go. Select ${c.hasSelection ? 'a smaller part' : 'the part to change'} and try again.`,
        );
      await s.showAnswer({
        title,
        prompt,
        system: baseSystem(s, EDIT_RULES),
        user: `${instruction}\n\n${codeBlock(c)}${c.diagnostics ? `\n\nDiagnostics:\n${c.diagnostics}` : ''}`,
        mode: 'edit',
        editor: c.editor,
        language: c.language,
      });
    };

    return [
      make({
        id: 'ai:ask',
        name: 'ask',
        title: 'Ask AI',
        description: 'Ask anything — the selection or current file is included as context',
        icon: 'chat-circle-dots',
        feature: 'ask',
        args: { placeholder: 'your question' },
        boost: 8,
        keywords: ['chat', 'question', 'llm', 'gpt', 'claude', 'copilot'],
        run: async (ctx) => {
          const q = await ensureArgs(ctx.args, 'Ask AI');
          if (!q) return;
          const c = await codeContext(ctx, false);
          await answer('Ask', q, c?.code ? `${q}\n\n${codeBlock(c)}` : q, c);
        },
      }),
      make({
        id: 'ai:explain',
        name: 'explain',
        title: 'Explain Code',
        description: 'Explain the selection or file',
        icon: 'lightbulb',
        feature: 'ask',
        boost: 4,
        run: async (ctx) => {
          const c = await codeContext(ctx, true);
          if (c)
            await answer(
              'Explain',
              `Explain ${c.hasSelection ? 'the selection' : c.file}`,
              `Explain what this code does, step by step, and point out anything surprising.\n\n${codeBlock(c)}`,
              c,
            );
        },
      }),
      make({
        id: 'ai:summarize',
        name: 'summarize',
        title: 'Summarize File',
        description: 'TL;DR of the current file or selection',
        icon: 'list-bullets',
        feature: 'ask',
        run: async (ctx) => {
          const c = await codeContext(ctx, true);
          if (c)
            await answer(
              'Summarize',
              `Summarize ${c.file}`,
              `Summarize this in a few bullet points: purpose, main parts, notable details.\n\n${codeBlock(c)}`,
              c,
            );
        },
      }),
      make({
        id: 'ai:fix',
        name: 'fix',
        title: 'Fix Code',
        description: 'Fix bugs and the problems reported in the selection',
        icon: 'first-aid',
        feature: 'code',
        boost: 5,
        run: async (ctx) => {
          const c = await codeContext(ctx, true);
          if (c)
            await edit(
              'Fix',
              `Fix ${c.hasSelection ? 'the selection' : c.file}`,
              `Fix the bugs in this code${c.diagnostics ? ' and resolve the diagnostics listed below' : ''}.${ctx.args ? ` Focus on: ${ctx.args}` : ''}`,
              c,
            );
        },
        args: { placeholder: 'what is wrong (optional)' },
      }),
      make({
        id: 'ai:edit',
        name: 'edit',
        title: 'Edit with AI',
        description: 'Rewrite the selection following your instruction',
        icon: 'pencil-simple',
        feature: 'code',
        boost: 5,
        args: { placeholder: 'instruction, e.g. "use async/await"' },
        run: async (ctx) => {
          const instruction = await ensureArgs(ctx.args, 'How should the code change?');
          const c = instruction ? await codeContext(ctx, true) : undefined;
          if (c && instruction) await edit('Edit', instruction, `Rewrite this code: ${instruction}`, c);
        },
      }),
      make({
        id: 'ai:doc',
        name: 'doc',
        title: 'Add Documentation Comments',
        description: 'Document the selection in the language’s doc style',
        icon: 'note-pencil',
        feature: 'code',
        run: async (ctx) => {
          const c = await codeContext(ctx, true);
          if (c)
            await edit(
              'Document',
              'Add documentation comments',
              'Add concise idiomatic documentation comments (JSDoc, docstrings, rustdoc…) to this code without changing behavior.',
              c,
            );
        },
      }),
      make({
        id: 'ai:tests',
        name: 'tests',
        title: 'Generate Tests',
        description: 'Write unit tests for the selection or file',
        icon: 'flask',
        feature: 'code',
        boost: 3,
        run: async (ctx) => {
          const c = await codeContext(ctx, true);
          if (c)
            await answer(
              'Tests',
              `Write tests for ${c.hasSelection ? 'the selection' : c.file}`,
              `Write thorough unit tests for this code using the project's test framework.${ctx.args ? ` ${ctx.args}` : ''}\n\n${codeBlock(c)}`,
              c,
            );
        },
        args: { placeholder: 'extra guidance (optional)' },
      }),
      make({
        id: 'ai:review',
        name: 'review',
        title: 'Review Code',
        description: 'Find bugs, risks and improvements',
        icon: 'magnifying-glass-plus',
        feature: 'code',
        boost: 3,
        run: async (ctx) => {
          const c = await codeContext(ctx, true);
          if (c)
            await answer(
              'Review',
              `Review ${c.hasSelection ? 'the selection' : c.file}`,
              `Review this code like a senior engineer. List concrete issues by severity (bugs, security, performance, readability) with suggested fixes.\n\n${codeBlock(c)}`,
              c,
            );
        },
      }),
      make({
        id: 'ai:convert',
        name: 'convert',
        title: 'Convert Code',
        description: 'Translate the selection to another language or library',
        icon: 'arrows-left-right',
        feature: 'code',
        args: { placeholder: 'target, e.g. Python, Go, React hooks' },
        run: async (ctx) => {
          const target = await ensureArgs(ctx.args, 'Convert to…');
          const c = target ? await codeContext(ctx, true) : undefined;
          if (c && target)
            await answer(
              'Convert',
              `Convert to ${target}`,
              `Convert this code to ${target}. Keep behavior identical.\n\n${codeBlock(c)}`,
              c,
            );
        },
      }),
      make({
        id: 'ai:name',
        name: 'name',
        title: 'Suggest Better Names',
        description: 'Naming ideas for the selected symbol or code',
        icon: 'tag',
        feature: 'code',
        run: async (ctx) => {
          const c = await codeContext(ctx, true);
          if (c)
            await answer(
              'Names',
              'Suggest better names',
              `Suggest clearer names for the identifiers in this code. Give a table: current → suggested → why.\n\n${codeBlock(c)}`,
              c,
            );
        },
      }),
      make({
        id: 'ai:regex',
        name: 'regex',
        title: 'Generate Regex',
        description: 'Describe a pattern, get a regular expression inserted',
        icon: 'asterisk',
        feature: 'generate',
        args: { placeholder: 'e.g. ISO dates like 2024-05-01' },
        run: async (ctx) => {
          const desc = await ensureArgs(ctx.args, 'Describe the pattern');
          if (!desc) return;
          const editor = await ctx.editor();
          await s.showAnswer({
            title: 'Regex',
            prompt: desc,
            system: baseSystem(s, 'Reply with ONLY the regular expression, no slashes, flags, fences or explanation.'),
            user: `Regular expression${editor ? ` for ${editor.document.languageId}` : ''} that matches: ${desc}`,
            mode: 'insert',
            editor,
            language: 'regex',
          });
        },
      }),
      make({
        id: 'ai:shell',
        name: 'shell',
        title: 'Generate Shell Command',
        description: 'Describe a task, get a terminal command to review and run',
        icon: 'terminal-window',
        feature: 'generate',
        boost: 2,
        args: { placeholder: 'e.g. find large files in this repo' },
        run: async (ctx) => {
          const desc = await ensureArgs(ctx.args, 'What should the command do?');
          if (desc) await shellCommand(s, desc);
        },
      }),
      make({
        id: 'ai:commit',
        name: 'commit-msg',
        title: 'Write Commit Message',
        description: 'Generate a commit message from staged (or all) changes',
        icon: 'git-commit',
        feature: 'commitMessage',
        boost: 3,
        run: () => commitMessage(s),
      }),
      make({
        id: 'ai:models',
        name: 'models',
        title: 'Choose AI Model',
        description: 'Pick from installed and configured models',
        icon: 'cpu',
        feature: 'models',
        run: () => vscode.commands.executeCommand('slashi.selectModel'),
      }),
      make({
        id: 'ai:setup',
        name: 'ai-setup',
        title: 'Set Up AI',
        description: 'Connect Copilot, Claude, OpenAI, Ollama or any OpenAI-compatible server',
        icon: 'plugs-connected',
        feature: 'models',
        run: () => vscode.commands.executeCommand('slashi.studio', 'ai'),
      }),
      make({
        id: 'ai:key',
        name: 'ai-key',
        title: 'Set AI API Key',
        icon: 'key',
        feature: 'models',
        run: () => vscode.commands.executeCommand('slashi.setApiKey'),
      }),
    ];
  }
}

async function shellCommand(services: Services, description: string): Promise<void> {
  const shell = vscode.env.shell || 'sh';
  const command = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Slashi is writing a command…', cancellable: true },
    (_p, token) =>
      services.ai.complete(
        {
          system: baseSystem(
            services,
            `Reply with ONLY one shell command for ${process.platform} (${shell}). No fences, no explanation. Prefer safe, non-destructive commands.`,
          ),
          messages: [{ role: 'user', content: description }],
          maxTokens: 400,
        },
        token,
      ),
  );
  const clean = stripFences(command).trim();
  if (!clean) return;
  const choice = await vscode.window.showInformationMessage(
    clean,
    { modal: true, detail: 'Review the command before running it.' },
    'Run in Terminal',
    'Copy',
  );
  if (choice === 'Run in Terminal') services.terminal.run(clean);
  if (choice === 'Copy') await vscode.env.clipboard.writeText(clean);
}

interface GitRepository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  diff(cached?: boolean): Promise<string>;
}

export function gitApi(): { repositories: GitRepository[] } | undefined {
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: GitRepository[] } }>('vscode.git');
  return ext?.isActive ? ext.exports.getAPI(1) : undefined;
}

async function commitMessage(services: Services): Promise<void> {
  const api = gitApi();
  const uri = vscode.window.activeTextEditor?.document.uri;
  const repo = innermostRoot(uri?.fsPath, api?.repositories ?? [], (r) => r.rootUri.fsPath) ?? api?.repositories[0];
  if (!repo) throw new Error('No Git repository found.');
  let diff = await repo.diff(true);
  const staged = !!diff.trim();
  if (!staged) diff = await repo.diff(false);
  if (!diff.trim()) throw new Error('There are no changes to describe.');
  if (diff.length > 40_000) diff = `${diff.slice(0, 40_000)}\n… (diff truncated)`;
  const message = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.SourceControl, title: 'Writing commit message…', cancellable: true },
    (_p, token) =>
      services.ai.complete(
        {
          system: baseSystem(
            services,
            'Write a Conventional Commits message: a subject line under 72 characters, a blank line, then a short body explaining why. Reply with ONLY the message, no fences.',
          ),
          messages: [{ role: 'user', content: `${staged ? 'Staged' : 'Unstaged'} changes:\n${diff}` }],
          maxTokens: 600,
        },
        token,
      ),
  );
  repo.inputBox.value = stripFences(message).trim();
  await vscode.commands.executeCommand('workbench.view.scm');
  void vscode.window.setStatusBarMessage(`$(sparkle) Commit message written${staged ? '' : ' (from unstaged changes)'}`, 4000);
}

/** Model picker shared by /models and the `slashi.selectModel` command. */
export async function pickModel(services: Services): Promise<void> {
  const models = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Finding AI models…' }, () =>
    services.ai.listAllModels(),
  );
  const current = get('ai.model', '');
  const items: (vscode.QuickPickItem & { model?: (typeof models)[number]; setup?: boolean })[] = [
    { label: '$(sparkle) Auto', description: 'Copilot/VS Code models → Claude → OpenAI → Ollama', detail: 'Use whatever is available' },
    ...models.map((m) => ({
      label: `${m.id === current ? '$(check) ' : ''}${m.label}`,
      description: BACKEND_LABELS[m.backend],
      detail: m.detail,
      model: m,
    })),
    { label: '$(plug) Connect another provider…', setup: true },
  ];
  const pick = await vscode.window.showQuickPick(items, {
    title: 'Slashi AI model',
    placeHolder: models.length ? 'Choose the model Slashi uses' : 'No models found yet — connect a provider',
    matchOnDescription: true,
  });
  if (!pick) return;
  if (pick.setup) {
    await vscode.commands.executeCommand('slashi.studio', 'ai');
  } else if (pick.model) {
    await services.ai.selectModel(pick.model);
    void vscode.window.setStatusBarMessage(`$(sparkle) Slashi uses ${pick.model.label}`, 3000);
  } else {
    await updateGlobal('ai.provider', 'auto');
    await updateGlobal('ai.model', '');
    services.ai.changed();
  }
}
