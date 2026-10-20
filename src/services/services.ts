import * as vscode from 'vscode';
import { AiManager } from '../llm/manager';
import type { Registry } from '../registry';
import type { EditorSnapshot } from './editor';
import { History } from './history';
import { PackStore } from './packs';
import { TerminalRunner } from './terminal';

export interface AnswerRequest {
  title: string;
  /** Shown as the user's bubble. */
  prompt: string;
  system: string;
  user: string;
  /** Code-producing commands get Apply/Replace as the primary action. */
  mode: 'answer' | 'edit' | 'insert';
  editor?: vscode.TextEditor;
  /** Called with the final text when the user accepts an edit. */
  language?: string;
}

/** Shared services handed to every provider and UI component. */
export class Services implements vscode.Disposable {
  readonly history: History;
  readonly terminal = new TerminalRunner();
  readonly ai: AiManager;
  readonly packs: PackStore;
  /** Technologies detected by the Project provider. */
  stack: string[] = [];
  registry!: Registry;
  /** Editor captured when the current popup opened. */
  snapshot?: EditorSnapshot;
  /** Implemented by the UI layer. */
  openPopup!: (query?: string, style?: 'spotlight' | 'native') => Promise<void>;
  showAnswer!: (request: AnswerRequest) => Promise<void>;
  runSlash!: (text: string) => Promise<boolean>;

  constructor(
    readonly context: vscode.ExtensionContext,
    readonly log: vscode.LogOutputChannel,
  ) {
    this.history = new History(context.globalState);
    this.ai = new AiManager(context.secrets);
    this.packs = new PackStore(context, log);
  }

  dispose(): void {
    this.terminal.dispose();
  }
}
