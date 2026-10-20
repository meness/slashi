import * as path from 'node:path';
import * as vscode from 'vscode';
import { get } from '../config';

/** Runs shell commands in reusable `Slashi` terminals, one per working directory. */
export class TerminalRunner implements vscode.Disposable {
  private readonly terminals = new Map<string, vscode.Terminal>();
  private readonly sub = vscode.window.onDidCloseTerminal((t) => {
    for (const [key, value] of this.terminals) if (value === t) this.terminals.delete(key);
  });

  run(command: string, options: { cwd?: string; name?: string; reuse?: boolean } = {}): vscode.Terminal {
    const cwd = options.cwd ?? workspaceRoot();
    const reuse = options.reuse ?? get('terminal.reuse', true);
    const key = `${options.name ?? ''}|${cwd ?? ''}`;
    let terminal = reuse ? this.terminals.get(key) : undefined;
    if (!terminal || terminal.exitStatus) {
      const label = options.name ?? (cwd && cwd !== workspaceRoot() ? `Slashi · ${path.basename(cwd)}` : 'Slashi');
      terminal = vscode.window.createTerminal({ name: label, cwd, iconPath: new vscode.ThemeIcon('terminal-cmd') });
      if (reuse) this.terminals.set(key, terminal);
    }
    terminal.show(false);
    terminal.sendText(command, true);
    return terminal;
  }

  dispose(): void {
    this.sub.dispose();
  }
}

export function workspaceRoot(): string | undefined {
  const editorUri = vscode.window.activeTextEditor?.document.uri;
  const folder = (editorUri && vscode.workspace.getWorkspaceFolder(editorUri)) ?? vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath;
}

export function shellKind(): 'posix' | 'powershell' | 'cmd' {
  const shell = (vscode.env.shell || '').toLowerCase();
  if (shell.includes('pwsh') || shell.includes('powershell')) return 'powershell';
  if (shell.endsWith('cmd.exe')) return 'cmd';
  return 'posix';
}
