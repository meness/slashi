# Slashi

VS Code extension (TypeScript, esbuild, Vitest). Node ≥ 20, VS Code ≥ 1.90.

@CONTRIBUTING.md

## Commands

- `npm run typecheck` — extension + webview tsconfigs
- `npm test` — Vitest unit tests (`test/unit`, covers `src/core`)
- `npm run test:smoke` — builds, then activates the bundle against a mocked `vscode`
- `npm run check` — everything CI runs except integration + packaging
- `npm run marketplace` — regenerate `marketplace/index.json` after editing a pack

## Rules for Claude

- Never hand-edit generated files: `dist/`, `marketplace/index.json`, `package-lock.json`, `*.vsix`. Change the source and run the generator (`npm run build`, `npm run marketplace`, `npm install`).
- `src/core` must not import `vscode` (a hook enforces this).
- Before any webview/UI change, read [DESIGN.md](DESIGN.md): tokens live in `src/webview/styles/base.css`, no hex literals in component CSS.
- New settings, commands or provider features must also be declared in `package.json` `contributes` (the smoke-test mock reads setting defaults from `contributes.configuration`).
- A Stop hook runs typecheck + unit tests when `src/`, `test/`, `schemas/` or `marketplace/` changed; fix failures before finishing.
