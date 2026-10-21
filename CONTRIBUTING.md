# Contributing to Slashi

Thanks for helping make Slashi better! Bug reports, ideas, action packs, docs and code are all welcome.

## Quick start

```bash
git clone https://github.com/meness/slashi && cd slashi
npm ci
npm run check        # typecheck, lint, format, unit tests, smoke test, marketplace validation
```

Open the folder in VS Code and press **F5** to launch an Extension Development Host with your build. Run `npm run watch` to rebuild on save, then **Developer: Reload Window** in the host.

## Project layout

```
src/
  extension.ts        activation: providers, commands, status bar, API
  registry.ts         provider registry, caching, remote search
  executor.ts         runs items, restores the editor, common actions
  core/               pure, unit-tested logic (no vscode import): search, query parsing,
                      project detection, pack and command validation, the webview protocol
  providers/          one file per provider (extension.ts wraps providers from the API)
  llm/                AI backends: VS Code LM, Anthropic SDK, OpenAI-compatible, Claude Code/Codex CLIs
  services/           history, terminal, editor snapshot, packs, macro runner
  ui/                 webview hosts: spotlight, native quick pick, answer, studio, onboarding
  webview/            browser code + styles for the webviews
test/
  unit/               Vitest tests for src/core
  smoke/              activates the bundle against a mocked vscode module
  integration/        runs inside a real VS Code (npm run test:integration)
  e2e/                user scenarios in a real VS Code on a throwaway Git repo (npm run test:e2e)
marketplace/          community action packs + generated index.json
schemas/              JSON schema for commands, team files and packs
docs/                 building actions, packs and the extension API
```

## Scripts

| Script | What it does |
|---|---|
| `npm run watch` | Rebuilds on change |
| `npm run check` | Everything CI runs except integration tests and packaging |
| `npm test` | Unit tests (Vitest, `test/unit`) |
| `npm run coverage` | Unit tests with coverage thresholds; updates the README badge |
| `npm run test:smoke` | Builds, then activates the bundle against a mocked VS Code API and drives the real popup protocol |
| `npm run test:integration` | Runs the integration suite in a real VS Code (downloads VS Code) |
| `npm run test:e2e` | User scenarios in a real VS Code on a throwaway Git repo. `SLASHI_E2E_AI=1` adds an AI scenario through the Claude Code CLI |
| `npm run lint` / `lint:fix` | oxlint, type-aware |
| `npm run format` / `format:check` | Prettier |
| `npm run bench` | Ranking benchmark |
| `npm run screenshots` | Re-renders the README images (needs Chromium; set `CHROME_PATH`) |
| `npm run marketplace` | Validates packs and regenerates `marketplace/index.json` |
| `npm run package` | Builds `slashi-<version>.vsix` |

## Guidelines

- **Keep `src/core` pure.** It must not import `vscode`, so it stays testable and can run in webviews.
- **Every icon is a [Phosphor](https://phosphoricons.com) name.** A unit test checks that each one exists.
- **Add tests** for new logic in `src/core` and new detections in `detect.ts`.
- **Lint and format.** oxlint (type-aware) and Prettier run on staged files before each commit and in CI. `npm run lint:fix && npm run format` fixes most findings. Turn a rule off only with a reason in `.oxlintrc.json`, or an inline `oxlint-disable-next-line` with a comment saying why.
- **Webviews** must work in light, dark and high-contrast themes. Use the tokens in `src/webview/styles/base.css`, never hard-coded colors, except the brand gradient. No inline `style` attributes (CSP).
- **Security first:** never run terminal commands without the user choosing them. Keep secrets in `SecretStorage` and escape model output.
- Run `npm run screenshots` if you change the UI, and include before/after images in your PR.

## Adding a provider

1. Create `src/providers/<name>.ts` implementing `SlashProvider` (`src/types.ts`): an id, a scope prefix, features, and `items()`.
2. Add the id to `BuiltinProviderId` in `src/core/protocol.ts`, plus a `slashi.providers.<id>` setting and its features in `slashi.disabledFeatures` in `package.json`.
3. Register it in `src/extension.ts`, add a tile color in `src/webview/styles/base.css`, and document it in the README.

A provider that belongs to another extension doesn't go here: that extension calls `registerProvider` (see [docs/BUILDING_ACTIONS.md](docs/BUILDING_ACTIONS.md#providers)).

## Commit & PR

- Small, focused PRs with a clear description.
- Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`, for example `feat(git): add stash provider`. Keep body lines to 100 characters. A `commit-msg` hook (lefthook, installed by `npm install`) and a CI check on PR titles enforce it. PRs are squash-merged, so the title becomes the commit on `main`.
- `main` only accepts branches that are up to date with it. If GitHub says the branch is behind, click **Update branch** (or run `gh pr update-branch`) and wait for CI again.
- The type decides the next version: `fix:` and `perf:` bump the patch, `feat:` the minor, and `!` after the type (`feat!:`) or a `BREAKING CHANGE:` footer the major. While Slashi is below 1.0, breaking changes bump the minor instead. `docs`, `build`, `ci`, `test`, `refactor`, `style` and `chore` don't trigger a release.
- CI must be green: lint and format, typecheck, unit tests, smoke test, marketplace validation and packaging on Linux, macOS and Windows.

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please). Don't edit the version in `package.json` or `CHANGELOG.md` by hand.

1. Every push to `main` updates an open **chore(main): release x.y.z** PR with the version bump and changelog.
2. Merging that PR tags `vx.y.z` and creates the GitHub release. The workflow then runs the full check, attaches the `.vsix` and publishes to the VS Code Marketplace and Open VSX.
3. To force a version, add a `Release-As: x.y.z` footer to a commit on `main`.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
