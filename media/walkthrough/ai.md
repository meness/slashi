# Bring your own AI

Slashi picks the best available model automatically:

1. **VS Code language models** — GitHub Copilot or any extension that provides chat models. Nothing to configure.
2. **Claude** — add an Anthropic API key (`/ai-key`).
3. **OpenAI** — add an OpenAI API key.
4. **Ollama** — runs locally, free and private. Slashi finds it at `http://localhost:11434`.
5. **Any OpenAI-compatible server** — LM Studio, Groq, OpenRouter, vLLM… set `slashi.ai.baseUrl`.

Keys are stored in VS Code Secret Storage, never in settings files. Use `/models` to switch models at any time.
