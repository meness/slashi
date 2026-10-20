# Make the shortcut yours

Open **Keyboard Shortcuts** (`/shortcuts`) and search for `slashi` to rebind anything — macOS and Windows/Linux keys are independent.

Bind any slash command to its own key in `keybindings.json`:

```json
{ "key": "cmd+alt+u", "command": "slashi.run", "args": "/upper" },
{ "key": "cmd+alt+g", "command": "slashi.open", "args": "/git " }
```

Prefer VS Code’s original `Cmd/Ctrl + /` for comments? Turn off **Slashi › Shortcut: Use Slash Key** — Slashi then opens with `Cmd+Shift+;` (macOS) or `Ctrl+Shift+/`.
