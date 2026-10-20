<div align="center">

<img src="media/icon.png" width="96" alt="Slashi logo">

# Slashi

### Do anything in VS Code. Just type `/`

One beautiful, keyboard-first popup for files, settings, extensions, git, terminal, your project’s scripts, AI — and the commands you build yourself.

[![CI](https://github.com/meness/slashi/actions/workflows/ci.yml/badge.svg)](https://github.com/meness/slashi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-8b5cf6.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.90%2B-06b6d4.svg)](https://code.visualstudio.com/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-22c55e.svg)](CONTRIBUTING.md)

<picture>
  <source media="(prefers-color-scheme: light)" srcset="media/screenshots/hero-light.png">
  <img src="media/screenshots/hero-dark.png" alt="Slashi Spotlight popup inside VS Code" width="900">
</picture>

</div>

---

## Why Slashi?

Slash commands are everywhere again — chat apps, Notion, AI agents. Slashi brings that muscle memory to VS Code so you can do **99% of your daily work without touching the mouse**:

- **One shortcut** — `Cmd` + `/` on macOS, `Ctrl` + `/` on Windows and Linux.
- **Everything in one list** — 170+ VS Code commands, every extension command, every setting, your workspace files, open tabs, symbols, problems, git branches, themes and more.
- **Knows your project** — detects npm/pnpm/yarn/bun, Next.js, Vite, Vitest, Jest, ESLint, Prettier, Prisma, Playwright, Docker, Make, Python, Rust, Go, .NET, Java, Terraform… and gives you `/test`, `/dev`, `/prisma-migrate`, `/compose-up` instantly.
- **Full file CRUD** — `/new`, `/mkdir`, `/rename`, `/move`, `/dup`, `/delete`, copy paths, reveal — from the keyboard.
- **AI built in** — `/ask`, `/explain`, `/fix`, `/edit`, `/tests`, `/review`, `/commit-msg` with GitHub Copilot, Claude Code, Codex, Claude, OpenAI, Ollama or any OpenAI-compatible server.
- **Plain English** — `/do make the font bigger and turn on word wrap` plans real actions and runs them after you confirm.
- **Make it yours** — build commands with a wizard, share them with your team, or install packs from the action marketplace.
- **Beautiful in every theme** — light, dark, high contrast and any custom theme, with [Phosphor](https://phosphoricons.com) icons for every action.

## Install

**From a `.vsix`** (until Slashi is on the Marketplace):

```bash
git clone https://github.com/meness/slashi && cd slashi
npm ci && npm run package          # creates slashi-0.1.0.vsix
code --install-extension slashi-0.1.0.vsix
```

Or in VS Code: **Extensions** → `…` → **Install from VSIX…**

On first launch Slashi opens a short onboarding. It sets up the shortcut, your providers and AI.

<p align="center">
  <img src="media/screenshots/hero-onboarding-dark.png" alt="Slashi onboarding" width="820">
</p>

## 30-second tour

| Do this | Keys |
|---|---|
| Open Slashi | `Cmd /` (macOS) · `Ctrl /` (Windows/Linux) |
| Move | `↑` `↓` (or `Ctrl N` / `Ctrl P`) |
| Run | `Enter` |
| Complete the command, then type its arguments | `Tab` — e.g. `/run` → `Tab` → `npm test` |
| Actions menu (rename, delete, copy path, hide, bind a key…) | `Shift Enter` or `→` |
| First action (e.g. open file to the side) | `Alt Enter` |
| Hand what you typed to AI | `Cmd Enter` / `Ctrl Enter` |
| Clear, then close | `Esc` |
| Do with AI from anywhere | `Ctrl Cmd /` (macOS) · `Ctrl Shift Alt /` |

Type `/` + a **scope** and a space to search just one area:

`/f` files · `/p` project · `/npm` scripts · `/set` settings · `/ext` extensions · `/git` · `/term` · `/ai` · `/do` · `/tx` text · `/tab` open tabs · `/@` symbols · `/err` problems · `/theme` · `/web` · `/my` your commands · `/market`

Typing `/` at the start of a line in Markdown or plain text (and the Git commit box) suggests slash commands inline, Notion-style.

<table>
<tr>
<td><img src="media/screenshots/hero-files-dark.png" alt="Files with actions menu"></td>
<td><img src="media/screenshots/hero-light.png" alt="Project scripts in the light theme"></td>
</tr>
<tr>
<td align="center"><sub>Files &amp; folders with full CRUD — <code>Shift Enter</code> for actions</sub></td>
<td align="center"><sub>Your project’s scripts and tools, detected automatically</sub></td>
</tr>
<tr>
<td><img src="media/screenshots/spotlight-settings-light.png" alt="Settings search"></td>
<td><img src="media/screenshots/hero-answer-dark.png" alt="AI answer panel"></td>
</tr>
<tr>
<td align="center"><sub>Toggle or edit any setting in place</sub></td>
<td align="center"><sub>Streaming AI answers with Apply / Insert / Copy</sub></td>
</tr>
</table>

## Providers

Everything Slashi can do comes from **providers**. Turn any provider off, or switch off individual **features** inside it. For example, you can keep Marketplace search but hide installed extensions. Use the **Studio** (`/studio`), the picker (`/providers`) or settings.

| Provider | Scope | Features (each can be toggled) |
|---|---|---|
| **Files & Folders** | `/f` | search · create (`/new`, `/mkdir`) · rename & move · duplicate · delete (to trash) · copy paths · reveal |
| **Navigate** | `/go` `/tab` `/@` `/err` | open tabs · symbols in file · problems · go to line (`/line 42:7`) |
| **Project** | `/p` `/npm` | scripts (package.json, Makefile, justfile, deno, composer) · package manager · frameworks & tools |
| **Commands** | `/cmd` | ~170 curated VS Code commands with slash names · every extension command |
| **Settings** | `/set` | core settings · every extension setting — booleans toggle, enums pick, numbers/strings edit |
| **Extensions** | `/ext` | installed extensions · Marketplace search & install · updates & uninstall |
| **AI** | `/ai` | ask/explain/summarize · fix/edit/doc/tests/review/convert · commit messages · regex & shell generators · models |
| **Natural language** | `/do` | turn a sentence into a validated plan of actions |
| **Text tools** | `/tx` | case conversion · lines · encode & hash · JSON · inserts (UUID, dates, lorem) · stats |
| **Terminal & Tasks** | `/term` | `/run <cmd>` · VS Code tasks · terminal management |
| **Git** | `/git` | commit/push/pull/sync/stage/undo/diff… · branch switching · stash |
| **Themes** | `/theme` | color themes · icon themes · light/dark toggle |
| **Web** | `/web` | Google, Stack Overflow, GitHub, MDN, npm, PyPI, crates.io, DevDocs, Can I Use, YouTube + your own engines |
| **My Commands** | `/my` | your commands · team commands · installed packs · commands from other extensions |
| **Marketplace** | `/market` | browse registries · install from URL or file |

<p align="center"><img src="media/screenshots/studio-providers-dark.png" alt="Studio providers" width="820"></p>

## AI

Slashi works without AI. When you want it, it picks the best model it can find:

1. **VS Code language models** — GitHub Copilot, or any extension that provides chat models. Nothing to set up.
2. **Claude** — `/ai-key` → Anthropic. Uses the official SDK; the default model is `claude-opus-5-5`, with the effort level in `slashi.ai.anthropicEffort`.
3. **OpenAI** — `/ai-key` → OpenAI.
4. **Claude Code / Codex CLI** — no key needed. Slashi reuses your existing sign-in from the Claude Code extension (or `claude` on your PATH) or the `codex` CLI.
5. **Ollama** — local and free; found automatically at `http://localhost:11434`.
6. **Any OpenAI-compatible server** — LM Studio, Groq, OpenRouter, Together, vLLM: set `slashi.ai.provider` to `openaiCompatible` and `slashi.ai.baseUrl`.

Switch models with `/models`. Test the connection in **Studio → AI & Models**. Add standing instructions with `slashi.ai.customInstructions`.

| Command | What it does |
|---|---|
| `/ask <question>` | Answer with your selection (or the current file) as context |
| `/explain`, `/summarize`, `/review` | Explain, summarize or review the selection or file |
| `/fix [hint]`, `/edit <instruction>`, `/doc` | Rewrite code; press **Apply** (`Cmd/Ctrl Enter`) to replace the original — undo with `Cmd/Ctrl Z` |
| `/tests`, `/convert <target>`, `/name` | Generate tests, translate code, suggest names |
| `/commit-msg` | Conventional commit message from staged (or unstaged) changes, written into the Source Control box |
| `/regex <description>` | Generates a regex and inserts it |
| `/shell <description>` | Writes a shell command; you review it before it runs |
| `/do <task>` | **Natural language**: Slashi sends your request plus a shortlist of matching actions to the model, validates the returned plan (unknown actions are dropped), shows it, and runs it after you confirm |

## Your own commands

### 1. The wizard

`/new-command` asks for a name and steps. It saves the command to your settings or to the team file, so you never touch JSON.

### 2. Settings or a team file

Add commands to `slashi.customCommands` (user settings) or to **`.vscode/slashi.json`**, which is shared with everyone on the repo. Autocomplete and validation come from the bundled [JSON schema](schemas/slashi.schema.json).

```jsonc
// .vscode/slashi.json
{
  "$schema": "https://raw.githubusercontent.com/meness/slashi/main/schemas/slashi.schema.json",
  "commands": [
    {
      "name": "ship",
      "title": "Ship It",
      "icon": "rocket-launch",
      "args": "commit message",
      "steps": [
        { "command": "workbench.action.files.saveAll" },
        { "slash": "/test" },
        { "terminal": "git add -A && git commit -m ${q:args} && git push" },
        { "notify": "Shipped 🚀" }
      ]
    }
  ]
}
```

| Step | Example |
|---|---|
| `command` | `{ "command": "editor.action.formatDocument" }` (optional `args`) |
| `slash` | `{ "slash": "/run npm test" }` |
| `terminal` | `{ "terminal": "npm run build", "cwd": "packages/web" }` |
| `setting` | `{ "setting": "editor.fontSize", "value": 18, "target": "user" }` |
| `insert` | `{ "insert": "// TODO(${env:USER}): " }` |
| `open` | `{ "open": "https://github.com/${input:repo}" }` or a workspace path |
| `ai` | `{ "ai": "Translate to German: ${selection}", "output": "replace" }` (`panel` · `replace` · `insert`) |
| `notify` | `{ "notify": "Done" }` |
| `input` / `pick` | `{ "input": "Ticket?", "var": "ticket" }` → `${input:ticket}`; `{ "pick": ["patch","minor"], "var": "bump" }` |
| `wait` | `{ "wait": 500 }` |

**Variables:** `${args}`, `${selection}`, `${file}`, `${fileBasename}`, `${fileBasenameNoExtension}`, `${fileDirname}`, `${fileExtname}`, `${relativeFile}`, `${workspaceFolder}`, `${lineNumber}`, `${language}`, `${date}`, `${time}`, `${datetime}`, `${uuid}`, `${clipboard}`, `${env:NAME}`, `${config:setting.key}`, `${input:var}`. Add a default with `${args:3000}`. Prefix with `q:` for shell-safe quoting, e.g. `${q:selection}`.

> Team files and packs ask before they run terminal commands for the first time. In [untrusted workspaces](https://code.visualstudio.com/docs/editor/workspace-trust), workspace-defined commands are ignored.

### 3. The action marketplace

`/market` browses community **action packs**: Git Power Moves, AI Writing Tools, Focus & Present, Web Dev Toolkit, Handy Inserts and more. Every pack shows all of its steps before you install it, and terminal steps are flagged. **Build and publish your own:** see [docs/BUILDING_ACTIONS.md](docs/BUILDING_ACTIONS.md). `/export-pack` turns your commands into a pack in one step, and companies can host private registries (`slashi.marketplace.registries`).

### 4. From another extension

```ts
const slashi = await vscode.extensions.getExtension('meness.slashi')?.activate();
slashi?.registerCommand({
  extensionId: 'acme.deploy',
  name: 'deploy',
  title: 'Deploy to Staging',
  icon: 'rocket-launch',
  args: 'service',
  run: (service) => deploy(service),
});
```

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| Open Slashi | `Cmd /` | `Ctrl /` |
| Do with AI | `Ctrl Cmd /` | `Ctrl Shift Alt /` |
| Toggle line comment (moved by Slashi) | `Cmd Alt /` | `Ctrl Alt /` |

Prefer VS Code’s default comment shortcut? Turn off `slashi.shortcut.useSlashKey`. Slashi then opens with `Cmd Shift ;` (macOS) or `Ctrl Shift /`. Everything can be rebound in **Keyboard Shortcuts** (`/shortcuts`), separately for each OS. You can also bind any slash command to its own key:

```jsonc
// keybindings.json
{ "key": "cmd+alt+u", "command": "slashi.run",  "args": "/upper" },
{ "key": "cmd+alt+g", "command": "slashi.open", "args": "/git " },
{ "key": "cmd+alt+t", "command": "slashi.run",  "args": "/run npm test" }
```

Scoped entry points such as `slashi.openFiles`, `slashi.openGit`, `slashi.openProject`, `slashi.openAI` and `slashi.doWithAI` can be bound too. Any result’s actions menu also has **Assign a keyboard shortcut…**.

## Settings

| Setting | Default | |
|---|---|---|
| `slashi.popup.style` | `spotlight` | `spotlight` (custom design) or `native` (VS Code Quick Pick, follows every accessibility setting) |
| `slashi.shortcut.useSlashKey` | `true` | `Cmd/Ctrl + /` opens Slashi; comment toggle moves to `+Alt` |
| `slashi.providers.*` | `true` | Enable or disable each provider |
| `slashi.disabledFeatures` | `[]` | Disable single features, e.g. `extensions.installed` |
| `slashi.hiddenCommands` | `[]` | Hide single results (supports a trailing `*`) |
| `slashi.inlineTrigger.languages` | markdown, plaintext, scminput | Where `/` at line start suggests commands (`*` = everywhere) |
| `slashi.ai.provider` / `model` / `baseUrl` | `auto` | AI backend (machine-scoped, so a workspace can’t redirect your key) |
| `slashi.ai.confirmBeforeRun` | `true` | Confirm Do-with-AI plans (terminal steps always ask) |
| `slashi.customCommands` | `[]` | Your commands |
| `slashi.marketplace.registries` | this repo | Registry index URLs (HTTPS) |
| `slashi.files.maxIndexed` | `20000` | File index size |

Search **@ext:meness.slashi** in Settings for everything else.

## Privacy & security

- **No telemetry.** Slashi collects nothing.
- **Keys** are stored only in VS Code Secret Storage. AI connection settings are machine-scoped, so a repository can’t send your key to another server.
- **AI requests** go only to the backend you chose. Do-with-AI plans are validated against real commands and settings, and shown before they run.
- **Webviews** use a strict nonce-based Content Security Policy and load only bundled assets. Model output is rendered with raw HTML escaped.
- **Untrusted workspaces:** workspace-defined commands are ignored. Team files and packs ask before running terminal commands.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Performance

VS Code only loads extensions in its Node.js extension host, so the extension itself has to be TypeScript/JavaScript. A Rust, Go or Python sidecar would add a process round-trip on every keystroke and require a separate build per platform. Instead, Slashi is bundled by **esbuild** (written in Go) into a single file that activates in about 50 ms.

Ranking uses a pre-lowercased index, a subsequence pre-filter, and computes highlights only for the visible results. Local results are ranked inside the popup itself; only large catalogues such as workspace files are ranked in the host.

`npm run bench` on a laptop-class CPU:

| Items | Average rank | p95 |
|---:|---:|---:|
| 1,000 | 0.8 ms | 1.4 ms |
| 5,000 | 2.9 ms | 6.8 ms |
| 20,000 | 11 ms | 20 ms |

## Develop and test locally

Requirements: **Node 20+** and **VS Code 1.90+**.

```bash
git clone https://github.com/meness/slashi && cd slashi
npm ci
npm run check       # typecheck + unit tests + build + smoke test
```

**Try it in VS Code:** open the folder and press **F5** (*Run Slashi*). A new Extension Development Host window opens with Slashi loaded, and the onboarding appears. Edit code, run `npm run watch`, then **Developer: Reload Window** in the host window.

| Script | |
|---|---|
| `npm run watch` | Rebuild on change |
| `npm test` | Unit tests (Vitest) |
| `npm run test:smoke` | Activates the bundled extension against a mocked VS Code API and drives the real popup protocol |
| `npm run test:integration` | Runs the integration suite in a real VS Code (downloads VS Code) |
| `npm run bench` | Ranking benchmark |
| `npm run screenshots` | Re-renders the README images (needs Chromium; set `CHROME_PATH`) |
| `npm run marketplace` | Validates packs and regenerates `marketplace/index.json` |
| `npm run package` | Builds `slashi-<version>.vsix` |

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [design plan & audit](docs/PLAN.md).

## License

[MIT](LICENSE) © meness and Slashi contributors. Icons by [Phosphor Icons](https://phosphoricons.com) (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
