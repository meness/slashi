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

When code starts using a `vscode` API the mock doesn't have, extend `test/smoke/vscode-mock.cjs`, or activation fails in the smoke test.

## Which skill to load

| Task | Use | Notes |
|---|---|---|
| Any change | `ponytail` (already on) | Smallest complete diff. |
| Finding callers, types, definitions | `LSP` tool (typescript-lsp plugin), then grep | The repo is small enough that the codebase-memory index isn't worth building. |
| Bug | `investigate` | Root cause first, then a regression test (unit test for `src/core`, smoke check otherwise). |
| Anthropic SDK, model ids, effort, streaming (`src/llm/anthropic.ts`) | `claude-api` | Never pick model ids from memory. |
| Before committing | `/code-review` | Correctness pass on the diff. |
| Touches `spawn`, terminal, secrets, network, webview HTML, model output or packs | `/security-review` | Plus the checklist below. |
| Diff feels heavy | `/simplify` or `ponytail:ponytail-review` | Pick one, not both. |
| Whole-repo health (now and then) | `ponytail:ponytail-audit`; `security-audit` for a full security pass | Report-only. |

**Don't use here:** `clean-code` (fights ponytail and the repo's terse style), `zod` (not a dependency; validation is hand-written in `src/core/commandSchema.ts`), `bun-*`, `turborepo`, `docker-patterns`, `postgres-*`, `next-best-practices`, gstack `review`/`qa`/`health` (duplicate the built-ins above), and every `argent-*` skill (this isn't a mobile app; the global argent rule doesn't apply).

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
3. Real run: `npm run package`, then `code --install-extension slashi-<version>.vsix --profile "<profile>"` (without `--profile` it goes into the Default profile). Or press F5 for an Extension Development Host.

Say which of these you ran and which you skipped.
