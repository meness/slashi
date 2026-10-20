import * as vscode from 'vscode';
import { get, updateGlobal } from '../config';
import { AnthropicBackend } from './anthropic';
import { CliBackend } from './cli';
import { OLLAMA_DEFAULT_URL, OPENAI_URL, OpenAiCompatibleBackend } from './openaiCompatible';
import { AiNotConfiguredError, BACKEND_LABELS, type Backend, type BackendId, type ChatRequest, type ModelInfo } from './types';
import { VsCodeLmBackend } from './vscodeLm';

type ProviderSetting = 'auto' | BackendId;

export interface ResolvedModel {
  backend: Backend;
  model: string;
  label: string;
}

const KEY_BACKENDS: BackendId[] = ['anthropic', 'openai', 'openaiCompatible'];

/** Chooses the configured LLM backend and streams requests to it. */
export class AiManager {
  private readonly backends: Record<BackendId, Backend>;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private cachedLabel = '';

  constructor(private readonly secrets: vscode.SecretStorage) {
    const key = (id: BackendId) => async () => this.secrets.get(secretKey(id));
    this.backends = {
      vscode: new VsCodeLmBackend(),
      anthropic: new AnthropicBackend(key('anthropic'), () => get('ai.anthropicEffort', 'medium')),
      openai: new OpenAiCompatibleBackend('openai', () => OPENAI_URL, key('openai')),
      ollama: new OpenAiCompatibleBackend(
        'ollama',
        () => get('ai.baseUrl', '') || OLLAMA_DEFAULT_URL,
        async () => undefined,
      ),
      openaiCompatible: new OpenAiCompatibleBackend('openaiCompatible', () => get('ai.baseUrl', ''), key('openaiCompatible')),
      claudeCode: new CliBackend('claudeCode'),
      codex: new CliBackend('codex'),
    };
    secrets.onDidChange(() => this.changed());
    vscode.lm?.onDidChangeChatModels?.(() => this.changed());
    vscode.extensions.onDidChange(() => this.changed());
  }

  changed(): void {
    this.cachedLabel = '';
    this.onDidChangeEmitter.fire();
  }

  get provider(): ProviderSetting {
    return get<ProviderSetting>('ai.provider', 'auto');
  }

  async hasKey(id: BackendId): Promise<boolean> {
    return !!(await this.secrets.get(secretKey(id)));
  }

  async setKey(id: BackendId, value: string | undefined): Promise<void> {
    if (value) await this.secrets.store(secretKey(id), value.trim());
    else await this.secrets.delete(secretKey(id));
    this.changed();
  }

  /** Resolves which backend + model to use right now. Throws AiNotConfiguredError if none. */
  async resolve(): Promise<ResolvedModel> {
    const provider = this.provider;
    const model = get('ai.model', '');
    if (provider !== 'auto') {
      return { backend: this.backends[provider], model, label: `${BACKEND_LABELS[provider]}${model ? ` · ${model}` : ''}` };
    }
    // auto: VS Code models (Copilot…) → Claude key → OpenAI key → Claude Code / Codex sign-in → local Ollama.
    const lm = await this.backends.vscode.listModels().catch(() => []);
    if (lm.length) {
      const chosen = lm.find((m) => m.id === model) ?? lm[0];
      return { backend: this.backends.vscode, model: chosen.id, label: chosen.label };
    }
    if (await this.hasKey('anthropic')) return { backend: this.backends.anthropic, model, label: `Claude${model ? ` · ${model}` : ''}` };
    if (await this.hasKey('openai')) return { backend: this.backends.openai, model, label: `OpenAI${model ? ` · ${model}` : ''}` };
    for (const id of ['claudeCode', 'codex'] as const) {
      if ((await this.backends[id].listModels()).length) return { backend: this.backends[id], model: '', label: BACKEND_LABELS[id] };
    }
    const ollama = await this.backends.ollama.listModels().catch(() => []);
    if (ollama.length) {
      const chosen = ollama.find((m) => m.id === model) ?? ollama[0];
      return { backend: this.backends.ollama, model: chosen.id, label: `Ollama · ${chosen.id}` };
    }
    throw new AiNotConfiguredError();
  }

  /** Short label for the UI, e.g. “Claude · claude-opus-5-5”; empty when not configured. */
  async label(): Promise<string> {
    if (this.cachedLabel) return this.cachedLabel;
    try {
      this.cachedLabel = (await this.resolve()).label;
    } catch {
      this.cachedLabel = '';
    }
    return this.cachedLabel;
  }

  async stream(
    request: ChatRequest,
    onText: (text: string) => void,
    token: vscode.CancellationToken,
  ): Promise<{ text: string; label: string }> {
    const resolved = await this.resolve();
    const text = await resolved.backend.stream(resolved.model, request, onText, token);
    return { text, label: resolved.label };
  }

  async complete(request: ChatRequest, token: vscode.CancellationToken): Promise<string> {
    return (await this.stream(request, () => undefined, token)).text;
  }

  /** Every model Slashi can currently reach, across all backends. */
  async listAllModels(): Promise<ModelInfo[]> {
    const lists = await Promise.all(
      (Object.keys(this.backends) as BackendId[]).map(async (id) => {
        if (id === 'openaiCompatible' && !get('ai.baseUrl', '')) return [];
        if ((id === 'anthropic' || id === 'openai') && !(await this.hasKey(id))) return [];
        return this.backends[id].listModels().catch(() => []);
      }),
    );
    return lists.flat();
  }

  async selectModel(model: ModelInfo): Promise<void> {
    await updateGlobal('ai.provider', model.backend);
    await updateGlobal('ai.model', model.id);
    this.changed();
  }

  /** Backends that need a key, for the key picker. */
  keyBackends(): BackendId[] {
    return KEY_BACKENDS;
  }
}

function secretKey(id: BackendId): string {
  return `slashi.apiKey.${id}`;
}
