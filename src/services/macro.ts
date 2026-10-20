import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { approvalSteps, describeStep, sharedVariableAllowed, type CustomCommandDef, type StepDef } from '../core/commandSchema';
import { expandTemplate, shellQuote, templateVariables } from '../core/template';
import type { RunContext } from '../types';
import { selectionText } from './editor';
import { shellKind, workspaceRoot } from './terminal';

export type CommandSource = 'user' | 'team' | 'pack' | 'extension';

class Cancelled extends Error {}

/** Builds the `${…}` variable resolver for the current editor and run. */
export async function variableResolver(
  editor: vscode.TextEditor | undefined,
  args: string,
  vars: Record<string, string>,
): Promise<(name: string) => string | undefined> {
  const doc = editor?.document;
  const file = doc && !doc.isUntitled ? doc.uri.fsPath : '';
  const folder = (doc && vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath) ?? workspaceRoot() ?? '';
  const now = new Date();
  const clipboard = await vscode.env.clipboard.readText().then(
    (t) => t,
    () => '',
  );
  const values: Record<string, string> = {
    args,
    selection: selectionText(editor),
    file,
    fileBasename: file ? path.basename(file) : '',
    fileBasenameNoExtension: file ? path.basename(file, path.extname(file)) : '',
    fileExtname: file ? path.extname(file) : '',
    fileDirname: file ? path.dirname(file) : '',
    relativeFile: file && folder ? path.relative(folder, file) : file,
    workspaceFolder: folder,
    workspaceFolderBasename: folder ? path.basename(folder) : '',
    lineNumber: editor ? String(editor.selection.active.line + 1) : '',
    language: doc?.languageId ?? '',
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 8),
    datetime: now.toISOString(),
    uuid: randomUUID(),
    clipboard,
  };
  return (name) => {
    if (name.startsWith('env:')) return process.env[name.slice(4)];
    if (name.startsWith('input:')) return vars[name.slice(6)];
    if (name.startsWith('config:')) {
      const v = vscode.workspace.getConfiguration().get(name.slice(7));
      return v === undefined ? undefined : typeof v === 'string' ? v : JSON.stringify(v);
    }
    return vars[name] ?? values[name];
  };
}

function expandDeep(value: unknown, expand: (s: string) => string): unknown {
  if (typeof value === 'string') return expand(value);
  if (Array.isArray(value)) return value.map((v) => expandDeep(v, expand));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandDeep(v, expand)]));
  return value;
}

/** Commands from a shared workspace file or a pack ask once before running steps that can reach a shell. */
async function approveSteps(ctx: RunContext, def: CustomCommandDef, source: CommandSource): Promise<boolean> {
  if (source === 'user' || source === 'extension') return true;
  const risky = approvalSteps(def);
  if (!risky.length) return true;
  const state = source === 'team' ? ctx.services.context.workspaceState : ctx.services.context.globalState;
  const key = `slashi.approved.${source}.${def.name}`;
  const fingerprint = JSON.stringify(def.steps);
  if (state.get<string>(key) === fingerprint) return true;
  const detail = risky.map((s) => `• ${describeStep(s)}`).join('\n');
  const origin = source === 'team' ? 'this workspace (.vscode/slashi.json)' : 'an installed action pack';
  const choice = await vscode.window.showWarningMessage(
    `/${def.name} comes from ${origin} and will:`,
    { modal: true, detail },
    'Run',
    'Always Allow',
  );
  if (choice === 'Always Allow') await state.update(key, fingerprint);
  return choice === 'Run' || choice === 'Always Allow';
}

export async function runCustomCommand(def: CustomCommandDef, ctx: RunContext, source: CommandSource): Promise<void> {
  if (!(await approveSteps(ctx, def, source))) return;
  const editor = await ctx.editor();
  let args = ctx.args;
  if (!args && usesArgs(def)) {
    const value = await vscode.window.showInputBox({
      title: def.title ?? `/${def.name}`,
      prompt: def.args ?? 'Arguments',
      ignoreFocusOut: true,
    });
    if (value === undefined) return;
    args = value;
  }
  const vars: Record<string, string> = {};
  const shell = shellKind();
  const shared = source === 'team' || source === 'pack';
  try {
    for (const step of def.steps) {
      const all = await variableResolver(editor, args, vars);
      const resolve = shared ? (name: string) => (sharedVariableAllowed(step, name) ? all(name) : undefined) : all;
      const expand = (s: string) => expandTemplate(s, resolve, (v) => shellQuote(v, shell));
      await runStep(step, ctx, expand, vars, editor);
    }
  } catch (err) {
    if (err instanceof Cancelled) return;
    throw err;
  }
}

async function runStep(
  step: StepDef,
  ctx: RunContext,
  expand: (s: string) => string,
  vars: Record<string, string>,
  editor: vscode.TextEditor | undefined,
): Promise<void> {
  if ('command' in step) {
    const args = step.args === undefined ? [] : [expandDeep(step.args, expand)];
    await vscode.commands.executeCommand(step.command, ...args);
  } else if ('slash' in step) {
    const ok = await ctx.services.runSlash(expand(step.slash));
    if (!ok) throw new Error(`Unknown slash command ${step.slash}`);
  } else if ('terminal' in step) {
    const root = workspaceRoot();
    const cwd = step.cwd ? path.resolve(root ?? '', expand(step.cwd)) : root;
    ctx.services.terminal.run(expand(step.terminal), { cwd, name: step.name });
  } else if ('setting' in step) {
    const target = step.target === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await vscode.workspace.getConfiguration().update(step.setting, expandDeep(step.value, expand), target);
  } else if ('insert' in step) {
    const target = editor ?? (await ctx.editor());
    if (!target) throw new Error('Inserting text needs an open editor.');
    const text = expand(step.insert);
    await target.edit((b) => target.selections.forEach((s) => b.replace(s, text)));
  } else if ('open' in step) {
    const value = expand(step.open);
    if (/^(https?|mailto|vscode):/i.test(value)) {
      await vscode.env.openExternal(vscode.Uri.parse(value));
    } else {
      const uri = vscode.Uri.file(path.isAbsolute(value) ? value : path.join(workspaceRoot() ?? '', value));
      await vscode.window.showTextDocument(uri);
    }
  } else if ('ai' in step) {
    const output = step.output ?? 'panel';
    await ctx.services.showAnswer({
      title: 'Custom AI step',
      prompt: expand(step.ai),
      system:
        'You are a concise, expert software engineer helping inside VS Code.' +
        (output === 'panel' ? '' : ' Reply with ONLY the resulting text or code, no explanations and no code fences.'),
      user: expand(step.ai),
      mode: output === 'panel' ? 'answer' : output === 'replace' ? 'edit' : 'insert',
      editor: editor ?? (await ctx.editor()),
    });
  } else if ('notify' in step) {
    void vscode.window.showInformationMessage(expand(step.notify));
  } else if ('input' in step) {
    const value = await vscode.window.showInputBox({ prompt: expand(step.input), placeHolder: step.placeholder, ignoreFocusOut: true });
    if (value === undefined) throw new Cancelled();
    vars[step.var] = value;
  } else if ('pick' in step) {
    const value = await vscode.window.showQuickPick(step.pick.map(expand), { placeHolder: step.placeholder ?? 'Choose…' });
    if (value === undefined) throw new Cancelled();
    vars[step.var] = value;
  } else if ('wait' in step) {
    await new Promise((r) => {
      setTimeout(r, step.wait);
    });
  }
}

/** True if any step references `${args}`. */
export function usesArgs(def: CustomCommandDef): boolean {
  return def.steps.some((s) => Object.values(s).some((v) => typeof v === 'string' && templateVariables(v).includes('args')));
}
