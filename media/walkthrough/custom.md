# Your own slash commands

Run `/new-command` for a guided wizard, or add JSON to your settings:

```json
"slashi.customCommands": [
  {
    "name": "ship",
    "title": "Ship it",
    "icon": "rocket-launch",
    "steps": [
      { "command": "workbench.action.files.saveAll" },
      { "slash": "/test" },
      { "terminal": "git push" }
    ]
  }
]
```

Share commands with your team in `.vscode/slashi.json`, or publish an action pack to the marketplace (`/market`).
