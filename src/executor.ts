import * as vscode from 'vscode';
import { hideItem } from './config';
import { AiNotConfiguredError } from './llm/types';
import { restoreEditor, type EditorSnapshot } from './services/editor';
import type { Services } from './services/services';
import type { RunContext, SlashItem } from './types';

/** Actions every item gets in its actions menu. */
export const COMMON_ACTIONS = [
  { id: 'slashi.copyName', title: 'Copy slash command', icon: 'copy' },
  { id: 'slashi.keybinding', title: 'Assign a keyboard shortcut…', icon: 'keyboard' },
  { id: 'slashi.hide', title: 'Hide from Slashi', icon: 'eye-slash' },
];

export async function execute(services: Services, item: SlashItem, args: string, action: string | undefined, snapshot: EditorSnapshot | undefined): Promise<void> {
  if (action && (await runCommonAction(item, action))) return;
  await services.history.record(item.id);
  let restored: Promise<vscode.TextEditor | undefined> | undefined;
  const ctx: RunContext = {
    args: args.trim(),
    action,
    services,
    editor: () => (restored ??= restoreEditor(snapshot)),
  };
  try {
    if (item.needsEditor) {
      const editor = await ctx.editor();
      if (!editor) {
        void vscode.window.showWarningMessage(`“${item.title}” needs an open text editor.`);
        return;
      }
    }
    await item.run(ctx);
  } catch (err) {
    await reportError(services, err, item.title);
  }
}

async function runCommonAction(item: SlashItem, action: string): Promise<boolean> {
  const invocation = item.name ? `/${item.name}` : item.id;
  switch (action) {
    case 'slashi.copyName':
      await vscode.env.clipboard.writeText(invocation);
      void vscode.window.setStatusBarMessage(`$(check) Copied ${invocation}`, 2500);
      return true;
    case 'slashi.hide':
      await hideItem(item.id);
      void vscode.window.showInformationMessage(`Hid “${item.title}” from Slashi. To show it again, remove it from the Hidden Commands setting.`, 'Open Setting').then((choice) => {
        if (choice) void vscode.commands.executeCommand('workbench.action.openSettings', 'slashi.hiddenCommands');
      });
      return true;
    case 'slashi.keybinding': {
      const snippet = JSON.stringify({ key: 'ctrl+alt+…', command: 'slashi.run', args: invocation }, null, 2);
      await vscode.env.clipboard.writeText(snippet);
      await vscode.commands.executeCommand('workbench.action.openGlobalKeybindingsFile');
      void vscode.window.showInformationMessage(`A keybinding for ${invocation} was copied — paste it into keybindings.json and choose your key.`);
      return true;
    }
  }
  return false;
}

export async function reportError(services: Services, err: unknown, title: string): Promise<void> {
  if (err instanceof AiNotConfiguredError) {
    const choice = await vscode.window.showWarningMessage(`${err.message} Connect a model to use AI commands.`, 'Set Up AI', 'Choose Model');
    if (choice === 'Set Up AI') await vscode.commands.executeCommand('slashi.studio', 'ai');
    if (choice === 'Choose Model') await vscode.commands.executeCommand('slashi.selectModel');
    return;
  }
  if (err instanceof vscode.CancellationError || (err as Error)?.name === 'AbortError') return;
  const message = err instanceof Error ? err.message : String(err);
  services.log.error(`${title}: ${message}`, err);
  void vscode.window.showErrorMessage(`Slashi · ${title}: ${message}`);
}
