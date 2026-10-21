# Slashi

VS Code extension (TypeScript, esbuild, Vitest). Node ≥ 20, VS Code ≥ 1.93.

@CONTRIBUTING.md

## Commands

- `npm run typecheck` — extension + webview tsconfigs
- `npm run lint` — oxlint, type-aware (`npm run lint:fix` applies safe fixes); config in `.oxlintrc.json`
- `npm run format` — Prettier (`npm run format:check` in CI); a pre-commit hook fixes and formats staged files
- `npm test` — Vitest unit tests (`test/unit`, covers `src/core`)
- `npm run test:smoke` — builds, then activates the bundle against a mocked `vscode`
- `npm run test:e2e` — real VS Code against a fresh throwaway Git repo (scripts, Git, team files); `SLASHI_E2E_AI=1` adds an AI scenario through the Claude Code CLI
- `npm run coverage` — unit tests with coverage thresholds, then updates the README badge
- `npm run check` — everything CI runs (typecheck, lint, format, unit, smoke, marketplace) except integration + packaging (fails if coverage drops or the badge is stale)
- `npm run marketplace` — regenerate `marketplace/index.json` after editing a pack

## Rules for Claude

- Load the `slashi-tech` skill for code changes and `slashi-ui` for anything visible; they list which other skills to use. This is not a mobile app, so the global argent rule doesn't apply here.

- Never hand-edit generated files: `dist/`, `marketplace/index.json`, `package-lock.json`, `*.vsix`. Change the source and run the generator (`npm run build`, `npm run marketplace`, `npm install`).
- Never bump `version` or edit `CHANGELOG.md` / `.release-please-manifest.json`; release-please owns them. Commit messages and PR titles must be Conventional Commits (commitlint enforces it), and the type picks the version bump (see CONTRIBUTING.md "Releases").
- `src/core` must not import `vscode` (a hook enforces this).
- Before any webview/UI change, read [DESIGN.md](DESIGN.md): tokens live in `src/webview/styles/base.css`, no hex literals in component CSS.
- New settings, commands or provider features must also be declared in `package.json` `contributes` (the smoke-test mock reads setting defaults from `contributes.configuration`).
- A Stop hook runs typecheck + lint + unit tests when `src/`, `test/`, `schemas/` or `marketplace/` changed; fix failures before finishing.
