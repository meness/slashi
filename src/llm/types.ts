import type * as vscode from 'vscode';

export type BackendId = 'vscode' | 'anthropic' | 'openai' | 'ollama' | 'openaiCompatible' | 'claudeCode' | 'codex';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface ModelInfo {
  backend: BackendId;
  id: string;
  label: string;
  detail?: string;
}

export interface Backend {
  readonly id: BackendId;
  /** Streams text and resolves with the full response. */
  stream(model: string, request: ChatRequest, onText: (text: string) => void, token: vscode.CancellationToken): Promise<string>;
  listModels(token?: vscode.CancellationToken): Promise<ModelInfo[]>;
}

export class AiNotConfiguredError extends Error {
  constructor(message = 'No AI model is configured yet.') {
    super(message);
  }
}

export const BACKEND_LABELS: Record<BackendId, string> = {
  vscode: 'VS Code',
  anthropic: 'Claude',
  openai: 'OpenAI',
  ollama: 'Ollama',
  openaiCompatible: 'OpenAI-compatible',
  claudeCode: 'Claude Code',
  codex: 'Codex CLI',
};

/** Turns a VS Code cancellation token into an AbortSignal for fetch/SDK calls. */
export function toAbortSignal(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  if (token.isCancellationRequested) controller.abort();
  else token.onCancellationRequested(() => controller.abort());
  return controller.signal;
}
