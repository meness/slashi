import * as vscode from 'vscode';
import type { ChatMessage } from '../llm/types';
import { reportError } from '../executor';
import type { AnswerRequest, Services } from '../services/services';
import { panelIcon, webviewHtml, webviewOptions } from './html';

type ToWebview =
  | { type: 'start'; title: string; prompt: string; mode: AnswerRequest['mode']; target?: string }
  | { type: 'user'; text: string }
  | { type: 'model'; label: string }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

type FromWebview =
  | { type: 'ready' }
  | { type: 'copy'; text: string }
  | { type: 'apply'; text: string }
  | { type: 'insert'; text: string }
  | { type: 'newFile'; text: string; language?: string }
  | { type: 'followup'; text: string }
  | { type: 'stop' }
  | { type: 'close' };

/** Removes a single wrapping Markdown code fence from model output meant to be code. */
export function stripFences(text: string): string {
  const m = /^\s*```[\w+-]*\s*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return m ? m[1] : text.trim();
}

/** Streams AI answers into a side panel with Apply / Insert / Copy / New File actions and follow-up questions. */
export class AnswerPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private ready?: Promise<void>;
  private cts?: vscode.CancellationTokenSource;
  private request?: AnswerRequest;
  private messages: ChatMessage[] = [];
  /** Where Apply writes: the original selection (edit) or cursor (insert). */
  private target?: { uri: vscode.Uri; range: vscode.Range; version: number };

  constructor(
    private readonly services: Services,
    private readonly extensionUri: vscode.Uri,
  ) {}

  async show(request: AnswerRequest): Promise<void> {
    this.cts?.cancel();
    this.request = request;
    this.messages = [{ role: 'user', content: request.user }];
    const editor = request.editor;
    if (editor) {
      const sel = editor.selection;
      const range = request.mode === 'edit' && sel.isEmpty ? new vscode.Range(0, 0, editor.document.lineCount, 0) : new vscode.Range(sel.start, sel.end);
      this.target = { uri: editor.document.uri, range, version: editor.document.version };
    } else {
      this.target = undefined;
    }
    this.ensurePanel();
    await this.ready;
    const targetLabel = this.target ? `${vscode.workspace.asRelativePath(this.target.uri)}${request.mode === 'edit' && !editor?.selection.isEmpty ? ` · lines ${this.target.range.start.line + 1}–${this.target.range.end.line + 1}` : ''}` : undefined;
    this.post({ type: 'start', title: request.title, prompt: request.prompt, mode: request.mode, target: targetLabel });
    await this.generate();
  }

  private ensurePanel(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, false);
      return;
    }
    const panel = vscode.window.createWebviewPanel('slashi.answer', 'Slashi AI', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false }, { ...webviewOptions(this.extensionUri), retainContextWhenHidden: true });
    this.panel = panel;
    panel.iconPath = panelIcon(this.extensionUri);
    let resolveReady!: () => void;
    this.ready = new Promise((r) => (resolveReady = r));
    panel.webview.html = webviewHtml(panel.webview, this.extensionUri, { title: 'Slashi AI', script: 'answer.js', styles: ['answer.css'] });
    panel.onDidDispose(() => {
      this.cts?.cancel();
      this.panel = undefined;
    });
    panel.webview.onDidReceiveMessage((m: FromWebview) => {
      if (m.type === 'ready') resolveReady();
      else void this.handle(m);
    });
  }

  private async handle(m: FromWebview): Promise<void> {
    try {
      switch (m.type) {
        case 'copy':
          await vscode.env.clipboard.writeText(m.text);
          void vscode.window.setStatusBarMessage('$(copy) Copied', 2000);
          break;
        case 'apply':
          await this.apply(this.request?.mode === 'answer' ? m.text : stripFences(m.text));
          break;
        case 'insert':
          await this.insertAtCursor(m.text);
          break;
        case 'newFile': {
          const doc = await vscode.workspace.openTextDocument({ content: m.text, language: m.language || this.request?.language });
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
          break;
        }
        case 'followup':
          this.messages.push({ role: 'user', content: m.text });
          this.post({ type: 'user', text: m.text });
          await this.generate();
          break;
        case 'stop':
          this.cts?.cancel();
          break;
        case 'close':
          this.panel?.dispose();
          break;
      }
    } catch (err) {
      await reportError(this.services, err, 'AI');
    }
  }

  private async generate(): Promise<void> {
    const request = this.request!;
    this.cts?.cancel();
    const cts = (this.cts = new vscode.CancellationTokenSource());
    let label = '';
    try {
      label = await this.services.ai.label();
      if (label) this.post({ type: 'model', label });
      const { text } = await this.services.ai.stream({ system: request.system, messages: this.messages }, (t) => this.post({ type: 'delta', text: t }), cts.token);
      this.messages.push({ role: 'assistant', content: text });
      this.post({ type: 'done' });
    } catch (err) {
      if (cts.token.isCancellationRequested) {
        this.post({ type: 'done' });
        return;
      }
      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      await reportError(this.services, err, request.title);
    }
  }

  private async apply(text: string): Promise<void> {
    if (!this.target) return this.insertAtCursor(text);
    const doc = await vscode.workspace.openTextDocument(this.target.uri);
    if (doc.version !== this.target.version) {
      const choice = await vscode.window.showWarningMessage('The file changed since the AI started. Apply anyway?', { modal: true }, 'Apply');
      if (!choice) return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, this.request?.mode === 'insert' ? new vscode.Range(this.target.range.start, this.target.range.end) : doc.validateRange(this.target.range), text);
    if (!(await vscode.workspace.applyEdit(edit))) throw new Error('The edit could not be applied.');
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
    const end = doc.positionAt(doc.offsetAt(this.target.range.start) + text.length);
    editor.selection = new vscode.Selection(this.target.range.start, end);
    editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    this.target = { uri: doc.uri, range: new vscode.Range(this.target.range.start, end), version: doc.version };
    void vscode.window.setStatusBarMessage('$(check) Applied — undo with Ctrl/Cmd+Z', 4000);
  }

  private async insertAtCursor(text: string): Promise<void> {
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === this.target?.uri.toString()) ?? vscode.window.visibleTextEditors[0];
    if (!editor) {
      const doc = await vscode.workspace.openTextDocument({ content: text });
      await vscode.window.showTextDocument(doc);
      return;
    }
    await vscode.window.showTextDocument(editor.document, editor.viewColumn);
    await editor.edit((b) => editor.selections.forEach((s) => b.replace(s, text)));
  }

  private post(message: ToWebview): void {
    void this.panel?.webview.postMessage(message);
  }

  dispose(): void {
    this.cts?.cancel();
    this.panel?.dispose();
  }
}
