# Contributing to Slashi

Thanks for helping make Slashi better! Bug reports, ideas, action packs, docs and code are all welcome.

## Quick start

```bash
git clone https://github.com/meness/slashi && cd slashi
npm ci
npm run check        # typecheck, unit tests, smoke test, marketplace validation
```

Open the folder in VS Code and press **F5** to launch an Extension Development Host with your build. Run `npm run watch` to rebuild on save, then **Developer: Reload Window** in the host.

## Project layout

```
src/
  extension.ts        activation: providers, commands, status bar, API
  registry.ts         provider registry, caching, remote search
  executor.ts         runs items, restores the editor, common actions
  core/               pure, unit-tested logic (no vscode import)
    query.ts search.ts frecency.ts transforms.ts template.ts
    detect.ts intent.ts commandSchema.ts sse.ts icons.ts protocol.ts
  providers/          one file per provider
  llm/                AI backends (VS Code LM, Anthropic SDK, OpenAI-compatible)
  services/           history, terminal, editor snapshot, packs, macro runner
  ui/                 webview hosts: spotlight, native quick pick, answer, studio, onboarding
  webview/            browser code + styles for the webviews
test/
  unit/               Vitest tests for src/core
  smoke/              activates the bundle against a mocked vscode module
  integration/        runs inside a real VS Code (npm run test:integration)
marketplace/          community action packs + generated index.json
schemas/              JSON schema for commands, team files and packs
docs/                 plan & audit, building actions
```

## Guidelines

- **Keep `src/core` pure.** It must not import `vscode`, so it stays testable and can run in webviews.
- **Every icon is a [Phosphor](https://phosphoricons.com) name.** A unit test checks that each one exists.
- **Add tests** for new logic in `src/core` and new detections in `detect.ts`.
- **Webviews** must work in light, dark and high-contrast themes. Use the tokens in `src/webview/styles/base.css`, never hard-coded colors, except the brand gradient. No inline `style` attributes (CSP).
- **Security first:** never run terminal commands without the user choosing them. Keep secrets in `SecretStorage` and escape model output.
- Run `npm run screenshots` if you change the UI, and include before/after images in your PR.

## Adding a provider

1. Create `src/providers/<name>.ts` implementing `SlashProvider` (`src/types.ts`): an id, a scope prefix, features, and `items()`.
2. Add the id to `ProviderId` in `src/core/protocol.ts`, plus a `slashi.providers.<id>` setting and its features in `slashi.disabledFeatures` in `package.json`.
3. Register it in `src/extension.ts`, add a tile color in `src/webview/styles/base.css`, and document it in the README.

## Commit & PR

- Small, focused PRs with a clear description. Conventional commit prefixes (`feat:`, `fix:`, `docs:`) are appreciated.
- CI must be green: typecheck, unit tests, smoke test, marketplace validation and packaging on Linux, macOS and Windows.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
