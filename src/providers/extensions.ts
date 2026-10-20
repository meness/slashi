import * as vscode from 'vscode';
import { isFeatureEnabled } from '../config';
import { pickIcon } from '../core/icons';
import type { RunContext, SlashItem, SlashProvider } from '../types';
import { ensureArgs, itemFactory, truncate } from './util';

const make = itemFactory('extensions', 'Extensions');

/** Installed extensions and the VS Code Marketplace. */
export class ExtensionsProvider implements SlashProvider {
  readonly id = 'extensions' as const;
  readonly title = 'Extensions';
  readonly description = 'Browse installed extensions, run their commands, search and install from the Marketplace.';
  readonly icon = 'puzzle-piece';
  readonly prefix = 'ext';
  readonly placeholder = 'Search installed extensions or the Marketplace…';
  readonly features = [
    { id: 'installed', title: 'Installed extensions', description: 'Details, commands, settings and ID of each installed extension.' },
    { id: 'marketplace', title: 'Marketplace search & install', description: '/ext-search, /install, recommended and popular extensions.' },
    { id: 'management', title: 'Updates & uninstall', description: 'Check for updates, update all, uninstall.' },
  ];

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private readonly sub = vscode.extensions.onDidChange(() => this.emitter.fire());

  dispose(): void {
    this.sub.dispose();
    this.emitter.dispose();
  }

  items(): SlashItem[] {
    const items: SlashItem[] = [];
    if (isFeatureEnabled('extensions', 'marketplace')) {
      items.push(
        make({
          id: 'ext:search', name: 'ext-search', title: 'Search the Marketplace', description: 'Find new extensions', icon: 'storefront', feature: 'marketplace', boost: 3,
          args: { placeholder: 'e.g. python, docker, theme' }, keywords: ['marketplace', 'find extension'],
          run: (ctx) => vscode.commands.executeCommand('workbench.extensions.search', ctx.args || ''),
        }),
        make({
          id: 'ext:install', name: 'install', title: 'Install Extension by ID', description: 'publisher.extension', icon: 'download-simple', feature: 'marketplace',
          args: { placeholder: 'publisher.extension, e.g. esbenp.prettier-vscode' },
          run: async (ctx) => {
            const id = await ensureArgs(ctx.args, 'Extension ID (publisher.name)');
            if (!id) return;
            await vscode.commands.executeCommand('workbench.extensions.installExtension', id);
            void vscode.window.showInformationMessage(`Installing ${id}…`);
          },
        }),
        make({ id: 'ext:recommended', name: 'recommended', title: 'Show Recommended Extensions', icon: 'thumbs-up', feature: 'marketplace', run: () => vscode.commands.executeCommand('workbench.extensions.action.showRecommendedExtensions') }),
        make({ id: 'ext:popular', name: 'popular', title: 'Show Popular Extensions', icon: 'fire', feature: 'marketplace', run: () => vscode.commands.executeCommand('workbench.extensions.action.showPopularExtensions') }),
      );
    }
    if (isFeatureEnabled('extensions', 'management')) {
      items.push(
        make({ id: 'ext:outdated', name: 'outdated', title: 'Show Outdated Extensions', icon: 'arrow-circle-up', feature: 'management', run: () => vscode.commands.executeCommand('workbench.extensions.action.listOutdatedExtensions') }),
        make({ id: 'ext:update-all', name: 'update-all', title: 'Update All Extensions', icon: 'arrows-clockwise', feature: 'management', run: () => vscode.commands.executeCommand('workbench.extensions.action.updateAllExtensions') }),
        make({ id: 'ext:check-updates', name: 'check-updates', title: 'Check for Extension Updates', icon: 'arrow-circle-up', feature: 'management', run: () => vscode.commands.executeCommand('workbench.extensions.action.checkForUpdates') }),
        make({ id: 'ext:installed', name: 'installed', title: 'Show Installed Extensions', icon: 'puzzle-piece', feature: 'management', run: () => vscode.commands.executeCommand('workbench.extensions.action.showInstalledExtensions') }),
      );
    }
    if (isFeatureEnabled('extensions', 'installed')) {
      for (const ext of vscode.extensions.all) {
        const pkg = ext.packageJSON ?? {};
        if (pkg.isBuiltin === true || ext.id.startsWith('vscode.')) continue;
        const name = String(pkg.displayName ?? pkg.name ?? ext.id);
        const commands: { command: string; title: string | { value: string } }[] = Array.isArray(pkg.contributes?.commands) ? pkg.contributes.commands : [];
        const manage = isFeatureEnabled('extensions', 'management');
        items.push(
          make({
            id: `ext:${ext.id}`,
            title: name,
            description: truncate(String(pkg.description ?? ''), 120),
            badge: `v${pkg.version ?? '?'}`,
            icon: pickIcon(`${name} ${(pkg.categories ?? []).join(' ')}`, 'puzzle-piece'),
            category: 'Installed Extensions',
            feature: 'installed',
            keywords: [ext.id, ...(Array.isArray(pkg.keywords) ? pkg.keywords.slice(0, 5) : [])],
            actions: [
              { id: 'details', title: 'Show details', icon: 'info' },
              ...(commands.length ? [{ id: 'commands', title: `Run one of its ${commands.length} commands…`, icon: 'lightning' }] : []),
              { id: 'settings', title: 'Open its settings', icon: 'gear-six' },
              { id: 'shortcuts', title: 'Open its keyboard shortcuts', icon: 'keyboard' },
              { id: 'copyId', title: 'Copy extension ID', icon: 'copy' },
              ...(manage ? [{ id: 'uninstall', title: 'Uninstall…', icon: 'trash', danger: true }] : []),
            ],
            run: (ctx) => extensionAction(ext, name, commands, ctx),
          }),
        );
      }
    }
    return items;
  }
}

async function extensionAction(ext: vscode.Extension<unknown>, name: string, commands: { command: string; title: string | { value: string } }[], ctx: RunContext): Promise<void> {
  switch (ctx.action) {
    case undefined:
    case 'details':
      await vscode.commands.executeCommand('extension.open', ext.id);
      return;
    case 'commands': {
      const pick = await vscode.window.showQuickPick(
        commands.map((c) => ({ label: typeof c.title === 'string' ? c.title : c.title.value, description: c.command })),
        { placeHolder: `${name} commands` },
      );
      if (pick) await vscode.commands.executeCommand(pick.description);
      return;
    }
    case 'settings':
      await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${ext.id}`);
      return;
    case 'shortcuts':
      await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', `@ext:${ext.id}`);
      return;
    case 'copyId':
      await vscode.env.clipboard.writeText(ext.id);
      return;
    case 'uninstall': {
      const choice = await vscode.window.showWarningMessage(`Uninstall ${name}?`, { modal: true }, 'Uninstall');
      if (choice) await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', ext.id);
      return;
    }
  }
}
