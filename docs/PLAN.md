# Slashi — Product & Engineering Plan

> **Mission:** do 99% of your daily VS Code work from one keyboard-driven popup that starts with `/` — without ever reaching for the mouse.

This document is the plan Slashi was built from. It contains the original plan (v1), an
honest audit of that plan, and the corrected plan (v2) that was implemented.

---

## 1. Plan v1

### 1.1 Experience

* One shortcut opens a centred, beautiful, theme-aware popup.
* Type `/` + a few letters → ranked results from every enabled **provider**.
* `/<prefix> ` scopes the search to one provider (`/set `, `/ext `, `/ai `…).
* `/<command> <args>` runs commands that take arguments (`/run npm test`, `/ask why…`).
* Plain English that matches nothing → **"Do with AI"** turns the sentence into a plan of real
  VS Code actions, shows it, and runs it after confirmation.

### 1.2 Providers (each can be enabled/disabled)

| Provider | Prefix | What it does |
|---|---|---|
| Commands | `/cmd` | Curated core commands + every command contributed by installed extensions |
| Settings | `/set` | Every setting from VS Code + extensions: toggle booleans, pick enums, type values |
| Extensions | `/ext` | Installed extensions: details, run their commands, settings, uninstall; marketplace search/install |
| AI | `/ai` | `/ask`, `/explain`, `/fix`, `/doc`, `/tests`, `/review`, `/edit`, `/commit-msg`, `/regex`, `/shell`, model picker |
| Natural language | — | "Understand human language": converts a sentence into executable steps |
| Text transforms | `/tx` | case conversions, sort/unique lines, JSON, base64, URL, UUID, dates, hashes, lorem |
| Terminal | `/term` | `/run <cmd>`, npm/pnpm/yarn/bun scripts, VS Code tasks, terminal management |
| Git | `/git` | commit, push, pull, branch, stash… + AI commit message |
| Themes | `/theme` | switch colour/icon themes, toggle light/dark |
| Web | `/web` | `/google`, `/so`, `/gh`, `/mdn`, `/npm` (+ custom engines) |
| Project *(added in v2)* | `/p` | auto-detects the repo stack and generates commands: package scripts + package-manager commands, frameworks/tools from dependencies, Docker, Make, Python, Rust, Go, .NET, Java, Terraform… |
| Marketplace *(added in v2)* | `/market` | browse community **action packs** from HTTPS registries, preview every step, install / update / uninstall in one keystroke |
| Custom | `/my` | user/team-defined commands (macros) |
| Files & folders *(added in v2)* | `/f` | search, create, open, rename/move, duplicate, delete (to trash), copy path, reveal |

### 1.3 Architecture

* TypeScript extension, bundled with esbuild.
* `core/` — pure, unit-tested logic: query parser, fuzzy ranker, frecency, text transforms,
  template variables, SSE parser, intent-plan parser.
* `providers/` — one file per provider, each returning `SlashItem[]`.
* `llm/` — backends: VS Code Language Model API (Copilot & other installed chat models),
  Anthropic (official SDK), OpenAI-compatible (OpenAI, Ollama, LM Studio, Groq, OpenRouter…).
* `ui/` — native QuickPick popup, "Spotlight" webview popup, AI answer panel, Studio settings panel.
* Keys live in VS Code `SecretStorage`, never in settings.

### 1.4 Quality

* Vitest unit tests for all pure modules, an integration suite for `@vscode/test-electron`.
* GitHub Actions CI: typecheck, test, build, package `.vsix` on Linux/macOS/Windows.

---

## 2. Audit of Plan v1

| # | Area | Finding | Severity |
|---|---|---|---|
| A1 | Language | Request to use Rust/Go/Python "for performance". VS Code only loads extensions in its **Node.js extension host**; the entry point must be JS. A native sidecar adds process spawn + IPC latency per keystroke, per-platform builds (6+ `.vsix` targets), and (for Python) a runtime dependency on users' machines. The hot path (ranking ~5–20k items) is sub-millisecond-to-few-ms in JS. | High |
| A2 | Keyboard-only goal | v1 only searches *static* catalogues. Daily work is mostly **files, open tabs, symbols, errors, tasks** — not covered, so users would still reach for the mouse / other palettes. | High |
| A3 | Custom tasks | Macros only live in `settings.json` — hard to author, not shareable with a team, and other extensions cannot contribute commands. | High |
| A4 | Webview popup & editor context | A webview popup becomes the active editor; `activeTextEditor` is `undefined` and the previous `TextEditor` object may be disposed → transforms/AI-on-selection would fail. | High |
| A5 | Security | Workspace settings could define terminal-running macros or point `ai.baseUrl` at an attacker server, exfiltrating code **and the API key**. LLM markdown rendered in a webview is an XSS vector. AI "do" plans could run arbitrary commands. | High |
| A6 | Native QuickPick | Public API can't disable VS Code's own label filtering/sorting, so our ranking is re-ordered. | Medium |
| A7 | Shortcut | `Cmd+Shift+/` is the macOS system "Help menu search" shortcut; `Ctrl+Alt+/` collides with AltGr on European layouts. | Medium |
| A8 | Inline `/` trigger | Firing on every `/` breaks `//` comments, paths, regexes and division in code. | Medium |
| A9 | Performance | Building catalogues on every open would make the popup sluggish; posting large item lists on every keystroke is wasteful. | Medium |
| A10 | Onboarding | "Easy setup" isn't addressed — no first-run guidance, AI setup requires knowing setting names. | Medium |
| A11 | VS Code version | Using the newest `@types/vscode` silently allows APIs older VS Code builds lack. | Low |
| A12 | Testability | No VS Code download in CI sandboxes; UI can't be visually verified. | Low |
| A13 | Anthropic default model / refusals | Need correct current model id and refusal handling. | Low |
| A2b | Stack awareness | Generic commands ignore what the repo actually uses (npm scripts, Docker, Cargo…). | High |
| A3c | Ecosystem | No way to discover or share actions, or to build them beyond personal settings. | High |
| A14 | Visual identity | Generic codicons make every row look alike. | Medium |
| A3b | Granularity | Providers are all-or-nothing; users want e.g. marketplace search without the installed-extensions list. | Medium |

## 3. Fixes → Plan v2 (implemented)

| # | Resolution |
|---|---|
| A1 | **TypeScript** (required by VS Code) compiled by **esbuild (written in Go)** into a single minified bundle for fast activation. Ranking uses a pre-lowercased index and an allocation-light scorer; `npm run bench` proves the numbers (see README). No native sidecar → one universal `.vsix`, zero runtime dependencies. |
| A2 | Added a **Files & Folders provider with full CRUD** (`/f` search, `/new`, `/mkdir`, `/rename`, `/move`, `/dup`, `/delete`, copy path, reveal) and every item can expose an **actions menu** (`Shift+Enter` / `→`) so CRUD never needs the mouse. Added **live providers** queried as you type: **Files** (`/f`, cached workspace index, kept fresh by a file watcher), **Open tabs** (`/tab`), **Symbols in file** (`/@`), **Problems** (`/err`), **Tasks & scripts**, **Go to line** (`/line 42`). Added ~150 curated core commands covering navigation, editing, refactoring, search, debugging, testing, layout and windows. |
| A2b | **Project provider** with data-driven *tech packs* (pure, unit-tested detection over manifests found in the workspace, monorepo-aware) generating package-script, package-manager and tool commands; refreshed by a manifest file watcher. |
| A3c | **Action packs + marketplace**: packs are JSON (same schema as custom commands), listed in registry `index.json` files (default: `marketplace/` in this repo, configurable — machine-scoped — for private registries). Install shows a full preview (terminal steps flagged), validates against the schema, stores packs in extension storage; pack terminal steps ask once per command. Building: `/new-command` wizard, *Export my commands as a pack*, `docs/BUILDING_ACTIONS.md`, `npm run marketplace` validator in CI for community PRs, and a typed extension API for code-level actions. |
| A14 | **Phosphor Icons** (duotone tiles, regular UI) bundled locally in all webviews — every built-in action has a hand-picked icon, extension commands/settings get one from a keyword matcher; a unit test validates every name against the Phosphor catalog. Native mode maps to codicons. |
| A3b | **Per-feature toggles inside every provider** (`slashi.disabledFeatures`, e.g. keep marketplace search but hide installed extensions) and per-item hiding (`slashi.hiddenCommands`), editable from Studio and the `/providers` picker. |
| A3 | Custom commands from **three sources**: user settings, a team-shareable **`.vscode/slashi.json`**, and a public **extension API** (`registerCommand`). Plus a **`/new-command` wizard** that writes the JSON for you. Steps: `command`, `slash`, `terminal`, `setting`, `insert`, `open`, `ai`, `notify`, with `${selection}`, `${file}`, `${args}`, `${date}`… variables. |
| A4 | The executor snapshots the editor (document, view column, selections) before the popup opens and **re-reveals it with the original selections** before running any action. |
| A5 | `ai.provider`/`ai.baseUrl` are **machine-scoped** (cannot be set by a workspace); `customCommands` and `.vscode/slashi.json` are ignored in **untrusted workspaces** (`restrictedConfigurations`); workspace-file terminal steps ask once per command. API keys live only in `SecretStorage`. Webviews use a strict nonce CSP; LLM markdown is rendered with raw HTML escaped. AI plans are validated (unknown commands/settings dropped) and **always shown for confirmation**; terminal steps always require confirmation. |
| A6 | Default UI is the **Spotlight** webview where we fully control ranking & design; Native mode remains available (fastest, accessibility-first) and accepts VS Code's sorting. |
| A7 | **`Cmd+/` (macOS) and `Ctrl+/` (Windows/Linux)**, as requested. These keys toggle line comments by default, so Slashi moves *Toggle Line Comment* to `Cmd/Ctrl+Alt+/` (and `/comment`). The swap is controlled by `slashi.shortcut.useSlashKey` (asked during onboarding); when off, Slashi opens with `Cmd+Shift+;` / `Ctrl+Shift+/`. Everything is rebindable per OS; `/shortcuts` opens Keyboard Shortcuts filtered to Slashi; dedicated commands open pre-scoped popups; `slashi.run` binds any slash command to a key. |
| A8 | Inline `/` trigger only fires when `/` is the **first non-blank character of a line**, only in configured languages (default Markdown + plaintext + scminput), and can be turned off. |
| A9 | Catalogues are built lazily, cached and invalidated on `extensions.onDidChange` / configuration change, and pre-warmed after startup. Static items are posted to the webview **once per open** and ranked there; only live providers round-trip. |
| A10 | A **first-run onboarding** (welcome with a live demo, the shortcut with a try-it-now check, providers, AI auto-detection, detected stack, cheat sheet; replay with `/welcome`), a **Getting Started walkthrough**, a **Studio** panel (toggle providers, connect AI, test the connection, list models) and `/setup` items. Zero config needed for Copilot users — installed VS Code chat models are detected automatically. |
| A11 | `engines.vscode` and `@types/vscode` pinned to **1.90** (first release with the stable Language Model API). |
| A12 | All logic lives in pure modules with unit tests; webviews are rendered in headless Chromium with mocked VS Code theme variables (light & dark) to produce the README screenshots; the integration suite runs locally and in CI. |
| A13 | Anthropic backend uses the official `@anthropic-ai/sdk`, default model `claude-opus-5-5`, streaming, checks `stop_reason === "refusal"`, and opts into server-side refusal fallbacks for models that support it. |

## 4. Out of scope (for now)

* Telemetry (Slashi collects none).
* Disabling/enabling other extensions programmatically (no VS Code API) — Slashi opens the extension page instead.
* Registering a true Quick Access prefix in VS Code's own palette (proposed API only).
