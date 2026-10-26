# Changelog

All notable changes to Slashi are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/).

## [0.9.1](https://github.com/meness/slashi/compare/v0.9.0...v0.9.1) (2026-10-26)


### Bug Fixes

* **deps:** bump serialize-javascript to 7.1.4 ([#45](https://github.com/meness/slashi/issues/45)) ([09651b8](https://github.com/meness/slashi/commit/09651b83373c95374b0f74345afa35ded0f85273))

## [0.9.0](https://github.com/meness/slashi/compare/v0.8.0...v0.9.0) (2026-10-26)


### Features

* **terminal:** run launch.json debug configurations by name ([#43](https://github.com/meness/slashi/issues/43)) ([483a827](https://github.com/meness/slashi/commit/483a82710254f6f409bc7fb5de6dbfb64c64d804))

## [0.8.0](https://github.com/meness/slashi/compare/v0.7.0...v0.8.0) (2026-10-26)


### Features

* **spotlight:** hide the Tab hint when the selected row can't complete ([#42](https://github.com/meness/slashi/issues/42)) ([bbd401f](https://github.com/meness/slashi/commit/bbd401f37631e6f601042802d4ec8ca71e8ba5e6))


### Bug Fixes

* open binary files and show the Slashi scope icon ([#40](https://github.com/meness/slashi/issues/40)) ([017d57a](https://github.com/meness/slashi/commit/017d57a7b97837bb6f64c2b6110267c476a812ba))

## [0.7.0](https://github.com/meness/slashi/compare/v0.6.1...v0.7.0) (2026-10-21)


### Features

* **commands:** wait for terminal steps and stop on failure ([#38](https://github.com/meness/slashi/issues/38)) ([f79342d](https://github.com/meness/slashi/commit/f79342d6f91d069bb283c3029fcf52c2a44f4005))

## [0.6.1](https://github.com/meness/slashi/compare/v0.6.0...v0.6.1) (2026-10-21)


### Documentation

* **marketplace:** clearer listing description and search keywords ([#37](https://github.com/meness/slashi/issues/37)) ([86a26a8](https://github.com/meness/slashi/commit/86a26a82ed2b61658365eb8afa69e24aecaf908d))
* **readme:** add a demo GIF under the hero image ([#35](https://github.com/meness/slashi/issues/35)) ([6ab6092](https://github.com/meness/slashi/commit/6ab6092d1b72ecb90ba96a7822aa25be908dd193))

## [0.6.0](https://github.com/meness/slashi/compare/v0.5.0...v0.6.0) (2026-10-21)


### Features

* **commands:** slash names for Chat and popular extension commands ([#33](https://github.com/meness/slashi/issues/33)) ([f542e21](https://github.com/meness/slashi/commit/f542e21d8fa1901b7c1800354d709b36e972fdd3))
* **project:** detect more of the Flutter, frontend and backend stacks ([#31](https://github.com/meness/slashi/issues/31)) ([90b08b4](https://github.com/meness/slashi/commit/90b08b424eb12999e2f9ccefd57dcc05c2083c5c))
* **settings:** list every VS Code setting and set values per language ([#29](https://github.com/meness/slashi/issues/29)) ([5593f83](https://github.com/meness/slashi/commit/5593f832e2b0b622c398f6a2c25e211afa248fbd))


### Bug Fixes

* **marketplace:** reload packs when registries change during a fetch ([#32](https://github.com/meness/slashi/issues/32)) ([4f5b6d2](https://github.com/meness/slashi/commit/4f5b6d2e939a9608f6f6f6002c3ec2e33cede39d))
* **project:** use Yarn 1 commands in Yarn 1 projects ([#30](https://github.com/meness/slashi/issues/30)) ([ad2bac8](https://github.com/meness/slashi/commit/ad2bac8748e6b86da94154462543dc366e2a8ef5))

## [0.5.0](https://github.com/meness/slashi/compare/v0.4.0...v0.5.0) (2026-10-21)


### Features

* **api:** let extensions register whole providers ([#24](https://github.com/meness/slashi/issues/24)) ([9b47be5](https://github.com/meness/slashi/commit/9b47be5ba216502372d9c433d9fb83e9495bff43))
* **marketplace:** verified seal and digest check for official packs ([#25](https://github.com/meness/slashi/issues/25)) ([0c74dde](https://github.com/meness/slashi/commit/0c74dde99a50098b29f86c216557f7bcae8c1d6e))


### Bug Fixes

* **scripts:** escape captured data in the screenshot pages' inline scripts ([#28](https://github.com/meness/slashi/issues/28)) ([1610727](https://github.com/meness/slashi/commit/16107278d243c71eb8ee59ab99fe62add3a8c3ca))


### Documentation

* remove the outdated original plan ([#23](https://github.com/meness/slashi/issues/23)) ([48a5145](https://github.com/meness/slashi/commit/48a514595c72b3b20721be9a4590ec298003f122))
* reorganize the README, fix stale docs and badges, add a shipping guide ([#27](https://github.com/meness/slashi/issues/27)) ([b81b6e1](https://github.com/meness/slashi/commit/b81b6e1fdce6a4ba36bba057a9b3a9ab5b1df6be))

## [0.4.0](https://github.com/meness/slashi/compare/v0.3.0...v0.4.0) (2026-10-21)


### ⚠ BREAKING CHANGES

* audit fixes, script arguments, /again, /review-changes and e2e tests ([#21](https://github.com/meness/slashi/issues/21))
* **config:** never copy workspace settings into user settings
* **custom:** slashi.customCommands set in workspace settings are now team commands: they ask before running steps that can reach a shell, and they no longer hide your user-settings commands.
* **web:** keep web search engines in user settings
* **custom:** slashi.web.engines is machine-scoped, so engines defined in workspace settings are ignored. Move them to user settings.

### Features

* add /again to repeat the last command ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* **ai:** add /review-changes ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* audit fixes, script arguments, /again, /review-changes and e2e tests ([#21](https://github.com/meness/slashi/issues/21)) ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* **project:** pass extra arguments to package scripts ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))


### Bug Fixes

* act on the active editor, falling back to the one the popup opened over ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* **ai:** send max_completion_tokens to OpenAI and refresh the model label ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* **config:** never copy workspace settings into user settings ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* **custom:** apply the languages filter when searching ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* **custom:** read team files as JSONC and keep their comments ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* **files:** respect .gitignore and the current workspace folder ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* **git:** ask before committing all changes when nothing is staged ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* run what the popup ranks first when slash names collide ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* **ui:** stop allowing remote images in webviews ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))
* **web:** keep web search engines in user settings ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))


### Performance

* **ai:** load the Anthropic SDK on first use ([2494c55](https://github.com/meness/slashi/commit/2494c5571cfe1bf3319a3bde7ef956c35da4ef56))

## [0.3.0](https://github.com/meness/slashi/compare/v0.2.0...v0.3.0) (2026-10-20)


### Features

* **ui:** add motion polish and clearer copy ([#15](https://github.com/meness/slashi/issues/15)) ([770f6fe](https://github.com/meness/slashi/commit/770f6fe47310298d112a8de6011ec1df211e2f1d))


### Bug Fixes

* handle unexpected setting and deno.json values ([#20](https://github.com/meness/slashi/issues/20)) ([2319233](https://github.com/meness/slashi/commit/231923354185b0e8839ac9fb1752dc84b572beb0))
* **ui:** keep slash-name badges readable in high contrast light ([#17](https://github.com/meness/slashi/issues/17)) ([71bd320](https://github.com/meness/slashi/commit/71bd320131586f275a7aa1e339dc7397f7d87c08))

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
