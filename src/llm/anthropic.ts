import Anthropic from '@anthropic-ai/sdk';
import type * as vscode from 'vscode';
import { AiNotConfiguredError, toAbortSignal, type Backend, type ChatRequest, type ModelInfo } from './types';

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

const KNOWN_MODELS: ModelInfo[] = [
  { backend: 'anthropic', id: 'claude-opus-5-5', label: 'Claude Opus 5.5', detail: 'Default · best balance of intelligence and speed' },
  { backend: 'anthropic', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', detail: 'Fast everyday coding' },
  { backend: 'anthropic', id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', detail: 'Fastest and cheapest' },
  { backend: 'anthropic', id: 'claude-fable-5-1', label: 'Claude Fable 5.1', detail: 'Most capable' },
];

export class AnthropicBackend implements Backend {
  readonly id = 'anthropic' as const;

  constructor(
    private readonly apiKey: () => Promise<string | undefined>,
    private readonly effort: () => 'low' | 'medium' | 'high',
  ) {}

  private async client(): Promise<Anthropic> {
    const key = await this.apiKey();
    if (!key) throw new AiNotConfiguredError('Set your Anthropic API key with “Slashi: Set AI API Key”.');
    return new Anthropic({ apiKey: key });
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!(await this.apiKey())) return [];
    try {
      const client = await this.client();
      const models: ModelInfo[] = [];
      for await (const m of client.models.list({ limit: 50 })) {
        models.push({ backend: this.id, id: m.id, label: m.display_name || m.id, detail: m.id === ANTHROPIC_DEFAULT_MODEL ? 'Default' : undefined });
      }
      return models.length ? models : KNOWN_MODELS;
    } catch {
      return KNOWN_MODELS;
    }
  }

  async stream(model: string, request: ChatRequest, onText: (text: string) => void, token: vscode.CancellationToken): Promise<string> {
    const client = await this.client();
    const id = model || ANTHROPIC_DEFAULT_MODEL;
    const fallback = FALLBACK_MODELS.has(id);
    const stream = client.beta.messages.stream(
      {
        model: id,
        max_tokens: request.maxTokens ?? 16000,
        system: request.system,
        messages: request.messages,
        output_config: { effort: this.effort() },
        // Route refusals to a fallback model server-side instead of failing the command.
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal: toAbortSignal(token) },
    );
    stream.on('text', (text) => onText(text));
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new Error('Claude declined this request. Try rephrasing it.');
    }
    return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  }
}
