import type * as vscode from 'vscode';
import { openAiDelta, SseParser } from '../core/sse';
import { AiNotConfiguredError, toAbortSignal, type Backend, type BackendId, type ChatRequest, type ModelInfo } from './types';

export const OLLAMA_DEFAULT_URL = 'http://localhost:11434/v1';
export const OPENAI_URL = 'https://api.openai.com/v1';
/** Used when no model is set (documented in the `slashi.ai.model` setting). */
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';

/** OpenAI Chat Completions over fetch: OpenAI, Ollama, LM Studio, Groq, OpenRouter, vLLM… */
export class OpenAiCompatibleBackend implements Backend {
  /** The default model per base URL, so requests don't list models every time. */
  private defaultFor?: { base: string; model: string };

  constructor(
    readonly id: Extract<BackendId, 'openai' | 'ollama' | 'openaiCompatible'>,
    private readonly baseUrl: () => string,
    private readonly apiKey: () => Promise<string | undefined>,
  ) {}

  private async headers(): Promise<Record<string, string>> {
    const key = await this.apiKey();
    if (this.id === 'openai' && !key) throw new AiNotConfiguredError('Set your OpenAI API key with “Slashi: Set AI API Key”.');
    return { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) };
  }

  private url(path: string): string {
    const base = this.baseUrl().replace(/\/+$/, '');
    if (!base) throw new AiNotConfiguredError('Set “slashi.ai.baseUrl” to your OpenAI-compatible server, e.g. http://localhost:1234/v1.');
    return `${base}${path}`;
  }

  async listModels(token?: vscode.CancellationToken): Promise<ModelInfo[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    token?.onCancellationRequested(() => controller.abort());
    try {
      const res = await fetch(this.url('/models'), { headers: await this.headers(), signal: controller.signal });
      if (!res.ok) return [];
      const json = (await res.json()) as { data?: { id: string; owned_by?: string }[] };
      return (json.data ?? []).map((m) => ({ backend: this.id, id: m.id, label: m.id, detail: m.owned_by }));
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /** Picks a sensible chat model when none is configured. */
  async defaultModel(): Promise<string> {
    if (this.id === 'openai') return OPENAI_DEFAULT_MODEL;
    const base = this.baseUrl();
    if (this.defaultFor?.base === base) return this.defaultFor.model;
    const models = (await this.listModels()).map((m) => m.id);
    if (!models.length) throw new AiNotConfiguredError(`No models found at ${base}. Is the server running?`);
    const chat = models.filter((m) => !/embed|whisper|tts|dall-e|image|audio|moderation|realtime|transcribe/i.test(m));
    // Sorted so the pick doesn't depend on the order the server lists models in.
    const sorted = [...chat].sort();
    const model = sorted.find((m) => /mini/i.test(m)) ?? sorted[0] ?? models[0];
    this.defaultFor = { base, model };
    return model;
  }

  async stream(model: string, request: ChatRequest, onText: (text: string) => void, token: vscode.CancellationToken): Promise<string> {
    const id = model || (await this.defaultModel());
    const res = await fetch(this.url('/chat/completions'), {
      method: 'POST',
      headers: await this.headers(),
      signal: toAbortSignal(token),
      body: JSON.stringify({
        model: id,
        stream: true,
        // OpenAI's reasoning models reject max_tokens and count their hidden reasoning in max_completion_tokens, so a
        // small cap (/shell asks for 400) could leave no room for the answer. Local servers still expect max_tokens.
        ...(this.id === 'openai'
          ? { max_completion_tokens: Math.max(request.maxTokens ?? 4096, 4096) }
          : { max_tokens: request.maxTokens ?? 4096 }),
        messages: [{ role: 'system', content: request.system }, ...request.messages],
      }),
    });
    if (!res.ok || !res.body) {
      if (!model) this.defaultFor = undefined;
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    const parser = new SseParser();
    const decoder = new TextDecoder();
    let full = '';
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      const events = done ? parser.flush() : parser.push(decoder.decode(value, { stream: true }));
      for (const event of events) {
        const delta = openAiDelta(event.data);
        if (delta) {
          full += delta;
          onText(delta);
        }
      }
      if (done) break;
    }
    return full;
  }
}
