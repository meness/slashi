# Security Policy

## Supported versions

Security fixes are released for the latest minor version of Slashi.

## Reporting a vulnerability

Please **do not open a public issue.** Report it privately through [GitHub Security Advisories](https://github.com/meness/slashi/security/advisories/new). Include:

- what an attacker could do, and under which conditions (for example a malicious workspace, action pack or model output),
- steps to reproduce, and the Slashi and VS Code versions.

You’ll get an acknowledgement within a few days. Once a fix is available, we’ll credit you (unless you prefer otherwise).

## Security model

- **Workspace trust:** workspace-defined commands (`slashi.customCommands` in workspace settings, `.vscode/slashi.json`) are ignored in untrusted workspaces. Team commands and packs ask before steps that run terminal, VS Code or slash commands, change settings or open links. **Always Allow** skips the question until those steps change.
- **AI:** the backend, model, base URL, effort, custom instructions and plan confirmation are machine-scoped settings, so a repository can’t redirect requests or keys. API keys live only in VS Code Secret Storage. Do-with-AI plans are validated against known commands and settings and confirmed by the user. Terminal steps always require confirmation.
- **Webviews:** strict nonce-based CSP, local assets only. Model output is rendered with raw HTML escaped and links restricted to `http(s)`/`mailto`.
- **Marketplace:** registries and packs are fetched only over HTTPS (1 MB limit), validated, and fully previewed before installation. A pack must match the SHA-256 digest and id in its registry listing. The verified seal is derived from the official registry URL and the reserved author `Slashi`, never from what a pack or registry says about itself.
- **Extension providers:** providers registered through the API run with their extension's own permissions, like any VS Code extension. Slashi validates what they return and limits how long it waits for them.
- **Telemetry:** none.
