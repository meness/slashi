import * as vscode from 'vscode';

export interface EditorSnapshot {
  document: vscode.TextDocument;
  viewColumn?: vscode.ViewColumn;
  selections: readonly vscode.Selection[];
}

export function snapshotEditor(): EditorSnapshot | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  return { document: editor.document, viewColumn: editor.viewColumn, selections: editor.selections };
}

/**
 * Brings back the editor that was active before the popup opened.
 * A webview popup makes VS Code dispose `TextEditor` objects of hidden editors, so we wait briefly for
 * VS Code to re-activate the previous tab and fall back to revealing the document ourselves.
 */
export async function restoreEditor(snapshot: EditorSnapshot | undefined): Promise<vscode.TextEditor | undefined> {
  if (!snapshot || snapshot.document.isClosed) return vscode.window.activeTextEditor;
  const matches = (e: vscode.TextEditor | undefined) => e?.document === snapshot.document;
  let editor = vscode.window.activeTextEditor;
  if (!matches(editor)) {
    editor = await new Promise<vscode.TextEditor | undefined>((resolve) => {
      const timer = setTimeout(() => {
        sub.dispose();
        resolve(undefined);
      }, 250);
      const sub = vscode.window.onDidChangeActiveTextEditor((e) => {
        if (matches(e)) {
          clearTimeout(timer);
          sub.dispose();
          resolve(e);
        }
      });
    });
  }
  editor ??= await vscode.window.showTextDocument(snapshot.document, { viewColumn: snapshot.viewColumn, preserveFocus: false });
  const same =
    editor.selections.length === snapshot.selections.length && editor.selections.every((s, i) => s.isEqual(snapshot.selections[i]));
  if (!same) editor.selections = [...snapshot.selections];
  return editor;
}

/**
 * The document a command acts on: the active editor, or the one Slashi opened over while the popup is still closing.
 * The active editor comes first because the snapshot is stale for runs that never opened the popup (the API, keybindings).
 */
export function currentDocument(snapshot: EditorSnapshot | undefined): vscode.TextDocument | undefined {
  return vscode.window.activeTextEditor?.document ?? (snapshot && !snapshot.document.isClosed ? snapshot.document : undefined);
}

/** Selected text, or the word under the cursor, or the whole document. */
export function textTarget(editor: vscode.TextEditor, mode: 'word' | 'document'): { range: vscode.Range; text: string }[] {
  const doc = editor.document;
  const targets = editor.selections.map((sel) => {
    if (!sel.isEmpty) return { range: new vscode.Range(sel.start, sel.end), text: doc.getText(sel) };
    if (mode === 'word') {
      const word = doc.getWordRangeAtPosition(sel.active, /[\w$.-]+/);
      if (word) return { range: word, text: doc.getText(word) };
    }
    const all = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    return { range: all, text: doc.getText() };
  });
  // Several empty cursors in "document" mode would edit the same range repeatedly.
  if (mode === 'document' && editor.selections.every((s) => s.isEmpty)) return targets.slice(0, 1);
  return targets;
}

export function selectionText(editor: vscode.TextEditor | undefined): string {
  if (!editor) return '';
  return editor.selections
    .filter((s) => !s.isEmpty)
    .map((s) => editor.document.getText(s))
    .join('\n');
}
