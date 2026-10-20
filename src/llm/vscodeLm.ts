import * as vscode from 'vscode';
import { AiNotConfiguredError, type Backend, type ChatRequest, type ModelInfo } from './types';

/** Models contributed to VS Code's Language Model API (GitHub Copilot and other installed extensions). */
export class VsCodeLmBackend implements Backend {
  readonly id = 'vscode' as const;

  async listModels(): Promise<ModelInfo[]> {
    if (!vscode.lm?.selectChatModels) return [];
    const models = await vscode.lm.selectChatModels();
    return models.map((m) => ({ backend: this.id, id: m.id, label: m.name || m.family, detail: `${m.vendor} · ${m.family}` }));
  }

  private async pick(modelId: string): Promise<vscode.LanguageModelChat> {
    const models = await vscode.lm.selectChatModels(modelId ? { id: modelId } : undefined);
    const model = models[0] ?? (await vscode.lm.selectChatModels())[0];
    if (!model) throw new AiNotConfiguredError('No VS Code language model is installed (e.g. GitHub Copilot Chat).');
    return model;
  }

  async stream(modelId: string, request: ChatRequest, onText: (text: string) => void, token: vscode.CancellationToken): Promise<string> {
    const model = await this.pick(modelId);
    // The LM API has no system role; the instructions lead the first user message.
    const messages = request.messages.map((m, i) => {
      const content = i === 0 && request.system ? `${request.system}\n\n---\n\n${m.content}` : m.content;
      return m.role === 'user' ? vscode.LanguageModelChatMessage.User(content) : vscode.LanguageModelChatMessage.Assistant(content);
    });
    const response = await model.sendRequest(messages, { justification: 'Slashi uses the model to run the AI command you chose.' }, token);
    let full = '';
    for await (const chunk of response.text) {
      full += chunk;
      onText(chunk);
    }
    return full;
  }
}
