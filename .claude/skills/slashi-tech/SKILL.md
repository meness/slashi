---
name: slashi-tech
description: Map, skill routing and checklists for technical work on the Slashi VS Code extension — providers, commands, settings, AI backends (src/llm), pure logic (src/core), packs and schemas, tests, builds and releases. Use for any non-visual change, bug fix, review or refactor in this repo. For anything a user sees in a webview, use slashi-ui as well.
---

# Slashi: technical work

CLAUDE.md and CONTRIBUTING.md hold the rules. This skill tells you where a change has to reach, which skill to load for it, and how to prove it works.

## Where a change must reach

| Area | Files | Must also touch | Guarded by |
|---|---|---|---|
| Pure logic | `src/core/*` (no `vscode` import, hook-enforced) | — | `test/unit/*.test.ts` (Vitest) |
| Provider | `src/providers/<id>.ts` | `ProviderId` in `src/core/protocol.ts`, `slashi.providers.<id>` + `slashi.disabledFeatures` in `package.json`, register in `src/extension.ts`, tile color in `base.css`, README | smoke test |
| AI backend | `src/llm/<name>.ts` implementing `Backend` (`src/llm/types.ts`) | `BackendId` + `BACKEND_LABELS`, `AiManager` backends map + auto order (`manager.ts`), `slashi.ai.provider` `enum` + `enumDescriptions`, Studio `BACKENDS` (`src/webview/studio.ts`), onboarding if it needs no setup, README "AI" section | smoke test, manual "Test connection" in Studio |
| Setting / command | code that reads it | `package.json` `contributes` (the smoke mock reads defaults from there) | smoke test |
| Webview protocol | `src/core/protocol.ts` | host (`src/ui/*`) **and** webview (`src/webview/*`) sides | typecheck (both tsconfigs) |
| Packs / team files | `marketplace/*`, `schemas/*`, `src/core/commandSchema.ts` | `npm run marketplace` (never hand-edit `marketplace/index.json`) | `npm run check` |

Every contributed command needs a `title` and `"category": "Slashi"`; hide internal ones from the palette with a `menus.commandPalette` `"when": "false"` entry.

Dispose what you register: push activation-time listeners, providers and panels to `context.subscriptions`; a listener created in a method that runs more than once (per search, per panel open) must be disposed by that method's owner, not added to the extension-wide list, or it leaks one per call.

When code starts using a `vscode` API the mock doesn't have, extend `test/smoke/vscode-mock.cjs`, or activation fails in the smoke test.

## Which skill to load

| Task | Use | Notes |
|---|---|---|
| Any change | `ponytail` (already on) | Smallest complete diff. |
| Finding callers, types, definitions | `LSP` tool (typescript-lsp plugin), then grep | The repo is small enough that the codebase-memory index isn't worth building. |
| Bug | `investigate` | Write the failing test first (unit test for `src/core`, smoke check otherwise), watch it fail, then fix the root cause. |
| Anthropic SDK, model ids, effort, streaming (`src/llm/anthropic.ts`) | `claude-api` | Never pick model ids from memory. |
| Before committing | `/code-review` | Correctness pass on the diff. |
| Touches `spawn`, terminal, secrets, network, webview HTML, model output or packs | `/security-review` | Plus the checklist below. |
| Diff feels heavy | `/simplify` or `ponytail:ponytail-review` | Pick one, not both. |
| Whole-repo health (now and then) | `ponytail:ponytail-audit`; `security-audit` for a full security pass | Report-only. |

**Don't use here:** `clean-code` (fights ponytail and the repo's terse style), `zod` (not a dependency; validation is hand-written in `src/core/commandSchema.ts`), `bun-*`, `turborepo`, `docker-patterns`, `postgres-*`, `next-best-practices`, gstack `review`/`qa`/`health` (duplicate the built-ins above), and every `argent-*` skill (this isn't a mobile app; the global argent rule doesn't apply).

## When to write the test first

- **`src/core` logic and every bug fix: test first.** The code is pure and Vitest is fast. A test that fails before the change proves the bug was reproduced and the fix is the reason it passes.
- **Providers, UI and glue code: test right after.** Their tests need the `vscode` mock or screenshots, and setting those up before the code exists costs more than it catches.
- **Prove a test can fail.** For a guard (validation, approval, parsing edge case), break the line it protects, confirm the test fails, then restore it. A test that passes against broken code is decoration.
- **Coverage only goes up.** Thresholds live in `vitest.config.mts`. When coverage rises, raise them and run `npm run coverage` to refresh the README badge.

## Security checklist

- Start child processes with `spawn(bin, argsArray)`, never through a shell or with interpolated strings.
- Run terminal commands only after the user chooses them. Team and pack commands go through the confirmation in `src/services/macro.ts`.
- Keep keys in `SecretStorage` (`AiManager.setKey`), never in settings or logs.
- Escape model output and any file or workspace text before it reaches a webview.
- Treat the workspace as hostile when it's untrusted. Settings that pick a binary, URL or model need `"scope": "machine"` (like `slashi.ai.*`), or must be added to `capabilities.untrustedWorkspaces.restrictedConfigurations` (like `slashi.customCommands`).
- Never write into the user's repo without an explicit action. Prefer an unsaved editor (`untitled:` URI), as `editTeamCommands()` does.

## Tests must not depend on the machine

The smoke test hides `PATH` and `HOME` so installed `claude`/`codex` CLIs don't change "no AI configured". Keep new checks hermetic the same way: mock it, or hide it.

## Verify

1. `npm run check`: typecheck, unit, smoke, marketplace. The Stop hook runs typecheck + unit tests only, so run the full check yourself before saying you're done.
2. `npm run test:integration` when the change depends on real VS Code behavior the mock fakes (activation, `contributes`, editors, terminals, untitled docs).
3. `npm run test:e2e` when a change affects what a user does end to end: package scripts and terminals, Git, team files, name resolution, `/again`. Add a scenario to `test/e2e/scenarios.test.ts` for new user-facing behavior. `SLASHI_E2E_AI=1` adds the AI scenario (two small real requests on the Claude Code sign-in), so run it only for AI changes.
3. Real run: `npm run package`, then `code --install-extension slashi-<version>.vsix --profile "<profile>"` (without `--profile` it goes into the Default profile). Or press F5 for an Extension Development Host.

Say which of these you ran and which you skipped.

### Real VS Code from here: what `test:e2e` already handles, and what it can't

- It unsets `ELECTRON_RUN_AS_NODE` (Claude Code's terminal sets it, which starts VS Code as plain Node) and keeps `--user-data-dir` under `/tmp` (VS Code's socket path must stay under 103 characters). Don't call `vscode-test --config` from outside the repo: it resolves its runner next to the config.
- A test can't answer Slashi's dialogs or stub them: each extension gets its own `vscode` API object. Avoid dialogs with settings (as `git.enableSmartCommit` does) and leave dialog paths to the smoke test, whose mock can stub them.
- A missing AI backend shows a warning that waits for a click, so the scenario hangs until mocha's timeout. Check the CLI first: `claude --version` (repair a broken `~/.local/bin/claude` with `claude install` from the extension's `resources/native-binary/claude`).
- When a terminal scenario fails, the log prints the exact command that reached the shell and its exit code. Check it before blaming Slashi: a fixture script can fail on its own, as `node -e` did by treating `--check` as a Node flag.

## Shipping

Commit, push, open a PR or merge only when the user asks. Approval for one PR doesn't cover the next.

1. **Branch** from an up-to-date `main` (`git pull`), named `<type>/<topic>`, e.g. `feat/extension-providers`. One topic per branch: PRs are squash-merged, so separate topics need separate PRs.
2. **Commit** with a Conventional Commit subject. Keep body lines to 100 characters, or the `commit-msg` hook (commitlint) rejects the commit. The pre-commit hook runs oxlint and Prettier on staged files. Stage only your own changes; leave unrelated edits for their own commit.
3. **Before pushing**, run `npm run check`. When the branch depends on another open PR, test-merge them in a throwaway branch and run the check there too.
4. **Open the PR** with `gh pr create --title "<conventional title>" --body …`. The title becomes the squash commit on `main`, and its type sets the release bump (see CONTRIBUTING.md).
5. **Watch CI** with `gh pr checks <n> --watch`. Required: Lint & format, Check on ubuntu/macos/windows, CodeQL and Conventional Commit title. Fix failures on the branch; never merge red.
6. **Merge** with `gh pr merge <n> --squash --delete-branch`. If it fails with "head branch is not up to date", run `gh pr update-branch <n>`, wait for CI again, then merge. Merge stacked PRs one at a time for this reason.
7. **Afterwards**, `git checkout main && git pull`. release-please opens or updates a **chore(main): release x.y.z** PR. Merging that PR publishes to the Marketplace and Open VSX, so leave it to the maintainer unless they ask.
