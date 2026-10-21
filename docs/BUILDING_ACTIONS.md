# Building Slashi actions

There are four ways to add your own slash commands to Slashi. Pick the smallest one that does the job.

| | Where it lives | Shared with | Good for |
|---|---|---|---|
| **Custom command** | `slashi.customCommands` (user settings) | you | personal shortcuts |
| **Team command** | `.vscode/slashi.json` in a repo | everyone on the repo | project workflows |
| **Action pack** | a JSON file in a registry | anyone who installs it | reusable toolkits |
| **Extension API** | your VS Code extension | your extension’s users | anything that needs code |

## Commands and steps

A command is a name plus a list of steps that run in order:

```json
{
  "name": "release",
  "title": "Cut a Release",
  "description": "Bump the version, test and push tags",
  "icon": "tag",
  "args": "patch | minor | major",
  "languages": ["typescript"],
  "steps": [
    { "pick": ["patch", "minor", "major"], "var": "bump", "placeholder": "Version bump" },
    { "command": "workbench.action.files.saveAll" },
    { "slash": "/test" },
    { "terminal": "npm version ${input:bump} && git push --follow-tags" },
    { "notify": "Released ${input:bump} 🎉" }
  ]
}
```

- `name` — what you type: `/release`. Use lower-case letters, digits and dashes (1–40 characters).
- `icon` — any [Phosphor icon](https://phosphoricons.com) name, e.g. `rocket-launch`, `git-branch`, `flask`.
- `args` — a placeholder. If any step uses `${args}` and nothing was typed, Slashi asks for it.
- `languages` — show the command only when the active editor uses one of these language IDs.

All step types (`command`, `slash`, `terminal`, `setting`, `insert`, `open`, `ai`, `notify`, `input`, `pick`, `wait`) and all variables are listed in the [README](../README.md#your-own-commands) and in [`schemas/slashi.schema.json`](../schemas/slashi.schema.json). Add `"$schema"` to your file for autocomplete.

**Quoting:** variables are inserted as-is. In terminal steps, use `${q:args}` / `${q:selection}` to shell-quote values that come from the user.

## Action packs

A pack is one JSON file with metadata and commands:

```json
{
  "$schema": "https://raw.githubusercontent.com/meness/slashi/main/schemas/slashi.schema.json",
  "id": "my-toolkit",
  "name": "My Toolkit",
  "version": "1.0.0",
  "description": "What it’s for, in one sentence.",
  "author": "Your Name",
  "icon": "toolbox",
  "tags": ["git", "productivity"],
  "repository": "https://github.com/you/my-toolkit",
  "commands": [
    { "name": "hello", "title": "Say Hello", "steps": [{ "notify": "Hello from my pack!" }] }
  ]
}
```

**Fastest start:** run `/export-pack`. It turns the custom commands you already have into a pack.

**Try it locally:** run **Slashi: Install Action Pack from URL or File…** and pick your file. The install preview shows every step exactly as users will see it.

### Publish to the community marketplace

1. Fork [meness/slashi](https://github.com/meness/slashi).
2. Add your pack as `marketplace/packs/<id>.json`. The file name must match the `id`.
3. Run `npm ci && npm run marketplace`. This validates every pack and regenerates `marketplace/index.json`.
4. Open a pull request using the **Action pack** template. CI runs the same validator.

Review guidelines:

- Terminal steps must be obvious from the command title and safe by default. No `rm -rf /`-style surprises, and no downloads piped into shells.
- Don’t collect data or call third-party services without saying so in the description.
- Bump `version` whenever you change a pack. Users see an **update** badge.

`marketplace/index.json` records a SHA-256 digest of every pack, and Slashi refuses a download that doesn't match it. Packs the Slashi maintainers publish here (`"author": "Slashi"`, reserved for them) show a **verified** seal in `/market`. Community packs are reviewed but don't get the seal, and a pack from another registry whose author claims to be Slashi is labeled **(unverified)**.

### Private registries

A registry is just an `index.json`:

```json
{
  "version": 1,
  "name": "Acme internal actions",
  "packs": [
    { "id": "acme-deploy", "name": "Acme Deploy", "version": "2.1.0", "description": "…", "author": "Platform team", "url": "packs/acme-deploy.json", "commands": 4, "terminal": true }
  ]
}
```

Host it on any HTTPS server (or a private GitHub raw URL), then add it to `slashi.marketplace.registries`. Pack URLs are resolved relative to the index. Only HTTPS is allowed. Add an optional `"sha256"` to an entry (the digest `npm run marketplace` writes: SHA-256 of the pack's JSON re-serialized with `JSON.stringify`) and Slashi refuses a download that doesn't match it.

## Extension API

Other extensions can add commands that run real code:

```ts
import type * as vscode from 'vscode';

interface SlashiApi {
  version: 1;
  registerCommand(command: {
    extensionId: string;
    name: string;
    title?: string;
    description?: string;
    icon?: string;
    args?: string;
    run(args: string): unknown;
  }): vscode.Disposable;
  open(query?: string): Promise<void>;
  run(slash: string): Promise<boolean>;
}

export async function activate(context: vscode.ExtensionContext) {
  const slashi = await vscode.extensions.getExtension<SlashiApi>('meness.slashi')?.activate();
  if (!slashi) return; // Slashi is optional

  context.subscriptions.push(
    slashi.registerCommand({
      extensionId: 'acme.deploy',
      name: 'deploy',
      title: 'Deploy to Staging',
      icon: 'rocket-launch',
      args: 'service name',
      run: async (service) => vscode.window.showInformationMessage(`Deploying ${service || 'everything'}…`),
    }),
  );
}
```

Add `"extensionDependencies": ["meness.slashi"]` only if your extension can’t work without Slashi. Otherwise, treat it as optional as shown above.

## Teaching Slashi a new technology

The Project provider’s detection lives in [`src/core/detect.ts`](../src/core/detect.ts). It is a pure function from “files in a folder + manifest contents” to commands, with tests in [`test/unit/detect.test.ts`](../test/unit/detect.test.ts). Adding a framework is usually a few lines inside `nodeProject()` or `scanDirectory()`, plus a test. PRs are very welcome.
