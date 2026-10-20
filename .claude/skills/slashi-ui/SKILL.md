---
name: slashi-ui
description: Skill routing and checklists for Slashi's visible surfaces — Spotlight, Studio, Onboarding, the Answer panel, the native QuickPick mode, status bar and UI copy — covering layout, tokens, icons, motion, accessibility, theming and screenshots. Use for any change in src/webview, src/ui, media/ or user-facing strings. Pair with slashi-tech when the change also touches the host side or the protocol.
---

# Slashi: UI work

Slashi has to look native in **every** VS Code theme: light, dark, high contrast and custom ones. Its own identity is limited to the brand gradient, tile colors and motion. [DESIGN.md](../../../DESIGN.md) is the source of truth, and `.impeccable/design.json` is its machine-readable sidecar. Read DESIGN.md before any change.

## Facts that constrain every change

- **Stack:** vanilla TypeScript building HTML template strings (`src/webview/*.ts`), bundled by esbuild. No React or component library, so React/shadcn guidance doesn't apply.
- **Styles:** `src/webview/styles/*.css`. Tokens live in `base.css` and map to `--vscode-*` variables. Component CSS uses tokens only: no hex literals and no new radii or shadows outside the scale.
- **CSP (`src/ui/html.ts`):** nonce scripts, bundled local assets only, no inline `style` attributes, no remote fonts or images.
- **Safety:** pass every interpolated value through `esc()` from `src/webview/common.ts`, including JSON in `data-*` attributes.
- **Icons:** Phosphor names only, through `icon()`. A unit test (`test/unit/icons.test.ts`) fails on unknown names.
- **Two surfaces:** Spotlight has a native QuickPick mode (`src/ui/native.ts`). A new item feature has to work in both or degrade cleanly.

## Which skill to load

| Task | Use | Notes |
|---|---|---|
| Design, redesign, critique, polish, layout, hierarchy, a11y audit | `impeccable:impeccable` | Primary skill. It's already set up for this repo (DESIGN.md + `.impeccable/`). |
| Changed the design system (tokens, scale, components) | `impeccable:impeccable-documenter` agent | Re-derives DESIGN.md from the shipped CSS, so the doc doesn't drift. |
| Keyboard feel, transitions, open/close timing, list motion in Spotlight | `emil-design-eng` | Respect `prefers-reduced-motion`. |
| Buttons, empty states, errors, onboarding text, setting descriptions | `ux-copy` | Short, specific, sentence case. |
| README, marketplace listing, walkthrough | `copywriting` for new copy, `copy-editing` for edits | |
| Accessibility checklist on a diff | `web-design-guidelines` | Run after impeccable on larger changes. |
| Extension icon / marketplace art (`media/icon.svg`) | `logo-design`, then `icon-export` | `npm run icon` regenerates the PNG. |

**Don't use here:** `design-taste-frontend`, the `ui-master` pipeline and its `ui-*` skills, `ui-ux-pro-max`, `minimalist-ui`, `high-end-visual-design`, `industrial-brutalist-ui`, `stitch-design-taste`, `gpt-taste`, `gsap-*`, `shadcn`, `ui-react`, `mobile-design`, `apple-design`, `prototype` and every `argent-*` skill. They push a self-contained web or mobile aesthetic or a stack this repo doesn't use. Slashi inherits the editor's theme instead of bringing its own.

## Checklist

- Works in light, dark and high contrast. In HC, borders carry the structure (`--vscode-contrastBorder`), not color or shadow.
- Keyboard-only path works: focus is visible, Esc closes, arrow keys and Enter behave like VS Code's own pickers.
- Interactive elements have accessible names; icon-only buttons need `aria-label`.
- Long names, empty lists, loading and error states are all handled.
- No layout jump while results stream in (Spotlight, Answer panel).

## Verify visually

1. `npm run screenshots`: runs the smoke test, then renders the real webviews in headless Chromium with VS Code theme colors into `media/screenshots/*.png`. On macOS, set `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.
2. Open the affected PNGs with the Read tool and check them. Don't judge from the code alone. `*-hc.png` files are the high-contrast check (Spotlight, Studio AI, Answer).
3. For a PR, include before/after images (CONTRIBUTING.md). Commit only the PNGs your change affects: a different Chromium re-renders every file with small pixel differences.
4. High-contrast light and onboarding aren't rendered. Check those in a real window (F5, then a high-contrast theme) and say whether you did.
