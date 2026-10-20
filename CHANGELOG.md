# Changelog

All notable changes to Slashi are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/).

## [0.2.0](https://github.com/meness/slashi/compare/v0.1.0...v0.2.0) (2026-10-20)


### Features

* add Help & Support to Studio with diagnostics, docs, feedback and donation links ([020248b](https://github.com/meness/slashi/commit/020248ba1b2655e9b378701cfdc377bd42405750))


### Bug Fixes

* **ai:** keep a replaced answer out of the next conversation ([020248b](https://github.com/meness/slashi/commit/020248ba1b2655e9b378701cfdc377bd42405750))
* **ai:** refuse edits on code that was cut to fit the model ([020248b](https://github.com/meness/slashi/commit/020248ba1b2655e9b378701cfdc377bd42405750))
* **git:** pick the innermost repository for the active file ([020248b](https://github.com/meness/slashi/commit/020248ba1b2655e9b378701cfdc377bd42405750))
* never rewrite a team commands file Slashi can't parse ([020248b](https://github.com/meness/slashi/commit/020248ba1b2655e9b378701cfdc377bd42405750))
* **security:** confirm every Do-with-AI step that can reach a shell, and keep its settings out of workspace control ([020248b](https://github.com/meness/slashi/commit/020248ba1b2655e9b378701cfdc377bd42405750))
* **security:** neutralize newlines in cmd quoting and block config variables in shared steps ([020248b](https://github.com/meness/slashi/commit/020248ba1b2655e9b378701cfdc377bd42405750))


### Performance

* read disabled features once per search ([020248b](https://github.com/meness/slashi/commit/020248ba1b2655e9b378701cfdc377bd42405750))


### Documentation

* add a donation page and Sponsor links ([020248b](https://github.com/meness/slashi/commit/020248ba1b2655e9b378701cfdc377bd42405750))
* rewrite the README for Marketplace and Open VSX users ([020248b](https://github.com/meness/slashi/commit/020248ba1b2655e9b378701cfdc377bd42405750))
* **skills:** add command and disposable rules to slashi-tech ([#10](https://github.com/meness/slashi/issues/10)) ([71b502c](https://github.com/meness/slashi/commit/71b502c124b8cdbbb4547878880c571d6a69302a))

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
