# Changelog

All notable changes to Slashi are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/).

## [0.1.0](https://github.com/meness/slashi/releases/tag/v0.1.0) (2026-10-20)

### Added
- Spotlight popup (custom webview) and native Quick Pick mode, both keyboard-first, with Phosphor icons and light/dark/high-contrast theming.
- `Cmd /` (macOS) / `Ctrl /` (Windows, Linux) shortcut; Toggle Line Comment moves to `Cmd/Ctrl Alt /` (optional).
- First-run onboarding: shortcut, providers, AI, detected stack and a cheat sheet.
- 16 providers with per-feature toggles: Files & Folders (full CRUD), Navigate, Project (stack detection), Commands, Settings, Extensions, AI, Natural Language, Text Tools, Terminal & Tasks, Git, Themes, Web, My Commands, Marketplace, Slashi.
- AI backends: VS Code Language Model API (GitHub Copilot…), Anthropic Claude (official SDK), OpenAI, Ollama and any OpenAI-compatible server; streaming answer panel with Apply/Insert/Copy and follow-ups.
- Do-with-AI: natural-language requests become validated, confirmed plans of real actions.
- Custom commands with 11 step types and 20 variables, a creation wizard, team commands in `.vscode/slashi.json`, JSON schema, action packs, the community marketplace, `/export-pack`, and a public extension API.
- Studio panel to manage providers, features, AI, commands and shortcuts.
- Inline `/` completions in Markdown, plain text and the Git commit box.
