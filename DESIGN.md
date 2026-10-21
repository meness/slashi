---
name: Slashi
description: A Spotlight-style slash-command launcher that lives natively inside every VS Code theme.
colors:
  brand-violet: "#8b5cf6"
  brand-cyan: "#06b6d4"
  brand-ink-light: "#6d28d9"
  ai-rose: "#f472b6"
  ai-rose-light: "#be185d"
  celebrate-amber: "#f5a524"
  celebrate-amber-light: "#b45309"
  accent-fallback: "#7c5cff"
  button-fallback: "#7c5cff"
  button-hover-fallback: "#6a4cf0"
  danger-fallback: "#f14c4c"
  success-fallback: "#3fb950"
  editor-bg-fallback: "#1e1e1e"
  widget-surface-fallback: "#252526"
  input-bg-fallback: "#2a2a2a"
  foreground-fallback: "#cccccc"
  muted-fallback: "#9d9d9d"
typography:
  display:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "clamp(26px, 4.2vw, 40px)"
    fontWeight: 750
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  query:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 450
    letterSpacing: "-0.01em"
  title:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
  row-title:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
  body:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "var(--vscode-font-size, 13px)"
    fontWeight: 400
    lineHeight: 1.5
  secondary:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  meta:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
  section-label:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    letterSpacing: "0.08em"
  mono:
    fontFamily: "var(--vscode-editor-font-family), ui-monospace, monospace"
    fontSize: "11.5px"
    fontWeight: 400
rounded:
  xs: "5px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  overlay: "14px"
  pill: "999px"
spacing:
  hair: "2px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "18px"
  page: "28px"
components:
  button-primary:
    backgroundColor: "{colors.button-fallback}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "28px"
  button-primary-hover:
    backgroundColor: "{colors.button-hover-fallback}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground-fallback}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "28px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger-fallback}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "28px"
  input:
    backgroundColor: "{colors.input-bg-fallback}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "30px"
  tile:
    rounded: "{rounded.md}"
    size: "32px"
  result-row:
    rounded: "{rounded.md}"
    padding: "8px 12px"
  chip:
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "24px"
  card:
    backgroundColor: "{colors.widget-surface-fallback}"
    rounded: "{rounded.lg}"
    padding: "14px"
  spotlight-card:
    backgroundColor: "{colors.widget-surface-fallback}"
    rounded: "{rounded.overlay}"
    width: "min(760px, 100%)"
---

# Design System: Slashi

## Overview

**Creative North Star: "The Native Spotlight"**

Slashi should feel like a part of VS Code that was always there, only better made. Every neutral, every surface, the focus accent and the button color are borrowed from the active VS Code theme through `--vscode-*` variables, so Slashi looks at home in light, dark, high-contrast and any custom theme without a single override. The hex values in the frontmatter are **fallbacks only**: they render when a variable is missing (screenshots, tests), never as the design intent. In real use the theme decides.

What belongs to Slashi alone is small and deliberate: one violet-to-cyan gradient (the slash mark, the active-row bar, the streaming cursor, the onboarding progress pill), a family of soft per-provider tile colors that make results scannable at a glance, and a Spotlight-grade overlay with real depth. Everything else is quiet, dense and keyboard-first. The user sees kbd hints, slash syntax in mono, and a list that moves as fast as they type.

The surfaces split by mode. **Spotlight** and the **answer panel** are Operate surfaces: dense, fast, scannable. **Studio** is settings: calm, flat, predictable. **Onboarding** is the one place allowed to perform: ambient glow, a floating hero mark, keycaps that press, gradient headline text.

**Key Characteristics:**
- Theme-derived neutrals; brand is one gradient plus provider tiles
- Dense 13px UI that inherits the user's VS Code font and size
- Flat panels, lifted overlays
- Keyboard as visual language: kbd chips, mono slash commands, Enter glyph on the active row
- Fully legible in high contrast (shadows and soft fills switch off, borders take over)

## Colors

A borrowed neutral palette with a single owned gradient and a set of muted provider hues.

### Primary
- **Slash Violet** (`--brand-a`): the left stop of the brand gradient, the search caret, the spinner arc, match highlighting in result titles, and accent icons in Studio navigation and panel headings.
- **Slash Cyan** (`--brand-b`): the right stop of the gradient. Never used alone except as a link fallback and the onboarding glow.
- **Brand Gradient** (`--brand`, 135° violet→cyan): the slash mark, the 3px active-row indicator, the streaming cursor, and the active onboarding step pill.
- **Brand Ink** (`--brand-ink`): violet used *as text*. It equals Slash Violet in dark themes and deepens to `#6d28d9` in light themes for contrast. Use it for highlighted characters and slash-command text, never `--brand-a` directly.

### Secondary
- **AI Rose** (`--ai`, deepens to `#be185d` in light themes): marks AI. Used for the AI provider tile, the sparkle in the Spotlight footer and the answer panel's model chip.

### Tertiary
- **Provider tiles** (`--tile`, set by `[data-provider]`): one hue per provider (amber files, sky navigation, emerald project, rose git, lime terminal…). Each has a darker light-theme variant. Tiles, badges, scope chips and pressed chips all render as the tile hue at 12–15% fill with a 22–40% inner border, never at full saturation.
- **Celebrate Amber** (`--celebrate`, deepens to `#b45309` in light themes): the confetti icon on the final onboarding step. One moment, one use.

### Neutral
All theme-mapped: `--bg` (editor background), `--surface` (widget background), `--surface-2` (footer tint), `--fg`, `--muted` (description text), `--faint` (fg at 45%, for placeholders and section labels), `--border` (widget border), `--hairline` (fg at 9%, internal dividers), `--input-bg`, `--accent` (the theme's focus border), `--accent-soft` (accent at 16%, selected rows), `--button` / `--button-hover`, `--danger`, `--success`.

### Named Rules
**The Borrowed Palette Rule.** A new color must come from a `--vscode-*` variable, a `color-mix()` of existing tokens, or a new token in `base.css` with a `body.vscode-light` variant. Hex literals in component CSS are a bug. The only exception is `#fff` on the brand gradient.

**The Tint, Don't Fill Rule.** Accent and provider colors appear as 10–16% `color-mix` fills with a slightly stronger border, never as solid backgrounds. The single solid accent surface is the primary button, which takes the theme's own button color.

## Typography

**Body Font:** the user's VS Code UI font (`--vscode-font-family`), falling back to system-ui
**Mono Font:** the user's editor font (`--vscode-editor-font-family`), falling back to ui-monospace

**Character:** Slashi has no typeface of its own. It speaks in the editor's voice, so it feels native. Hierarchy comes from size, weight and tracking, not from a new face.

### Hierarchy
- **Display** (750, clamp 26–40px, 1.15, −0.03em): onboarding headlines only.
- **Headline** (700, 22px, −0.02em): Studio page titles.
- **Query** (450, 19px, −0.01em): the Spotlight search input. The biggest text in the operate surfaces, because what you type is the point.
- **Title** (700, 14px): panel headings, the answer-panel header.
- **Row title** (500, 13.5px): result titles, card names.
- **Body** (400, inherits `--vscode-font-size`, ~13px, 1.5–1.6): prose and answers. Answers cap at 860px.
- **Secondary** (400, 12px): descriptions, field labels, hints.
- **Meta** (600, 11–11.5px): badges, chips, footer hints, categories.
- **Section label** (700, 10.5px, 0.08em, uppercase): sticky result-group headers (`RECENT`, `SUGGESTED`) and action-menu heads.
- **Mono** (11.5–12.5px): slash commands, argument placeholders (italic, `--faint`), code, paths, model ids.

### Named Rules
**The Half-Step Rule.** The UI scale moves in half-pixel steps between 10.5 and 14.5px because it sits beside the editor's own 13px chrome. Pick an existing step; do not add new sizes inside that range.

**The Mono Means Syntax Rule.** Mono is only for things the user could type or copy: commands, args, paths, code, model ids. Never for decoration.

## Layout

The **Spotlight** is a single centered card, `min(760px, 100%)` wide, dropped `min(11vh, 96px)` from the top over a faint violet/cyan radial wash. Inside: a search header (14px 16px padding), a scrolling results list (6px inset, sticky section labels) and a footer bar of kbd hints. Rows are 8px 12px with a 12px gap between tile and text.

**Studio** is a two-column grid: a 220px nav rail plus content (max 880px, padding `28px clamp(18px, 4vw, 44px)`). Cards flow in an `auto-fill, minmax(260px, 1fr)` grid with a 12px gap. Form fields sit in a 170px label / 1fr control grid. Below 720px the nav becomes a horizontal scroller and fields stack.

The **answer panel** is header / scrolling thread / composer, with the thread and composer capped at 860px. **Onboarding** is a 980px shell with centered steps and a header/footer frame.

Spacing has no tokens. It follows a de-facto 2/6/8/10/12/14/16/18/28 rhythm; reuse those values. Breakpoints: 620px (Spotlight hides optional hints and categories), 640px (onboarding), 720px (Studio).

## Elevation & Depth

Flat panels, lifted overlays. Settings cards, panels and list items are flat: a hairline border and a translucent surface tint (`--surface` at 55–70%). Real elevation is reserved for things that float above the editor.

### Shadow Vocabulary
- **Overlay** (`--shadow`, dark: `0 24px 70px -12px rgb(0 0 0 / .55), 0 8px 24px -8px rgb(0 0 0 / .4)`; light: violet-tinted and softer): the Spotlight card, the actions menu and the onboarding demo card.
- **Brand glow** (`0 6px 18px -6px` violet at 70%): under the slash mark only.
- **Focus ring halo** (`0 0 0 3px var(--accent-soft)`): focused inputs and the composer.

### Named Rules
**The Float-Only Rule.** Only floating surfaces cast `--shadow`. A card inside a page never does.

**The High-Contrast Rule.** In `vscode-high-contrast*` themes, `--shadow` and `--accent-soft` are switched off and `--border` becomes the contrast border. The active row gets a dashed contrast outline instead of a tint, and filled buttons take `--vscode-button-border` (or the contrast border) so their shape survives a fill that matches the page. Every new state needs a visible non-color, non-shadow signal.

## Shapes

Gently rounded and nested: an outer container is always rounder than what it holds. Radii come from a scale in `base.css`: `--radius-xs` (5px: kbd, inline code), `--radius-sm` (8px: buttons, inputs, nav items, menu rows), `--radius-md` (10px: result rows, provider tiles, code blocks, notices), `--radius-lg` (12px: cards, panels, popover menus, composer) and `--radius` (14px: the floating Spotlight card). Pills (999px) for chips, badges, dots and switches.

The brand marks scale their own radius with their size (7px at 24px, 8px at 28px, 26px at 92px). The user chat bubble has one flattened corner (`14px 14px 4px 14px`). Borders are 1px, except kbd and keycaps, which carry a thicker bottom edge so they read as physical keys.

## Components

### Buttons
Compact and theme-native.
- **Primary:** the theme's button color with button foreground, 28px tall, 0 12px padding, `--radius-sm`, 600 at 12px, optional leading icon with a 6px gap.
- **Hover / Active / Focus:** hover takes the theme's hover color; active nudges down 1px; focus-visible gets a 2px accent outline offset by 2px.
- **Ghost:** transparent with a `--border` outline; hover adds a 7% fg tint.
- **Danger:** transparent, danger text, danger border at 40%.
- Onboarding footer buttons step up to 36px tall with `--radius-md`.

### Result row (signature)
32px provider tile, then title (13.5px/500) with the slash command in mono beside it, then a description line (12px muted). On the right sit a badge or category, which swaps to an Enter kbd when the row is active. The active row gets an `--accent-soft` fill plus the 3px gradient bar on the left edge. Matched characters render in Brand Ink at 700. Verified marketplace packs carry a seal-check icon in Brand Ink right after the title: a shape, so it survives high contrast, with "Verified" as its accessible name.

### Provider tile
32px square, `--radius-md`, Phosphor duotone icon at 18px in the tile hue, 15% hue fill, 22% hue inner ring. Every provider has one, and new providers must add a tile color for both theme kinds.

### Chips
Pills, 24px tall, 11.5px. **Filter chips** (Studio) are hairline and muted at rest; pressed state takes the tile hue at 12% fill with a 40% border. **Scope chip** (Spotlight) appears beside the input when a `/prefix` scopes the search. **Model chip** shows the AI sparkle in AI Rose.

### Cards / Panels
`--radius-lg`, hairline border, `--surface` at 70%, 14px (card) or 18px (panel) padding, no shadow. Hover strengthens the border to `--border`. Disabled cards drop to 60% opacity. Provider cards for providers added by other extensions add a "From <extension id>" line (11px/600, muted) under the description.

### Inputs / Fields
30px tall, `--input-bg`, `--border` outline, `--radius-sm`. Focus moves the border to `--accent` and adds the 3px accent-soft halo. The Spotlight query input is the exception: borderless, transparent, 19px, with a violet caret.

### Switch
34×20 pill, 14px knob, 160ms ease. On state takes the theme button color.

### Kbd
18px min box, 10.5px/600, muted text, 7% fg fill, hairline border with a 2px bottom edge, `--radius-xs`. Always use kbd for shortcut hints.

### Navigation (Studio)
34px rows, muted icon and text; hover adds a 6% fg tint; the current page gets `--accent-soft` with the icon in Slash Violet.

## Do's and Don'ts

### Do:
- **Do** take every neutral from a `--vscode-*` variable or a `color-mix()` of `base.css` tokens, and give every new hue a `body.vscode-light` variant.
- **Do** use `--brand-ink` for violet text and `--brand-a` only for fills, carets and icons.
- **Do** use the radius scale (`--radius-xs` … `--radius`) and keep containers rounder than their contents.
- **Do** verify every UI change in light, dark and high-contrast with `npm run screenshots`.
- **Do** use Phosphor icons only (regular for chrome, duotone for tiles); a unit test checks the names.
- **Do** honor `prefers-reduced-motion`; `base.css` drops movement and keyframes but keeps opacity and color fades, and the spinner slows instead of stopping.
- **Do** keep motion short and eased with `--ease` (`cubic-bezier(0.2, 0.8, 0.2, 1)`): 110–160ms for UI, up to 360ms for onboarding step entrances. Presses scale to 0.97, and popovers grow from their trigger. Spotlight itself opens with no animation, because it is a keyboard toggle used all day.

### Don't:
- **Don't** write hex literals in component CSS; add a token instead (the `#fff` on the brand gradient is the only exception).
- **Don't** put `--shadow` on anything that doesn't float above the editor.
- **Don't** use solid accent or provider backgrounds; tint at 10–16%.
- **Don't** use gradient text outside the onboarding hero headline.
- **Don't** add inline `style` attributes; the webview CSP forbids them.
- **Don't** introduce a webfont; Slashi always speaks in the user's VS Code font.
- **Don't** rely on color or shadow alone for state; high contrast removes both.
