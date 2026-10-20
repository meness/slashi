import * as vscode from 'vscode';
import { isFeatureEnabled } from '../config';
import type { SlashItem, SlashProvider } from '../types';
import { itemFactory } from './util';

const make = itemFactory('themes', 'Themes');

interface ThemeContribution {
  id?: string;
  label?: string;
  uiTheme?: string;
}

/** Color, file icon and product icon themes from installed extensions. */
export class ThemesProvider implements SlashProvider {
  readonly id = 'themes' as const;
  readonly title = 'Themes';
  readonly description = 'Switch color, file icon and product icon themes; toggle light/dark.';
  readonly icon = 'palette';
  readonly prefix = 'theme';
  readonly placeholder = 'Switch theme…';
  readonly features = [
    { id: 'color', title: 'Color themes', description: 'Every installed color theme.' },
    { id: 'icon', title: 'Icon themes', description: 'File icon and product icon themes.' },
    { id: 'toggle', title: 'Light/Dark toggle', description: '/dark-light switches between your preferred themes.' },
  ];

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private readonly subs = [
    vscode.extensions.onDidChange(() => this.emitter.fire()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('workbench.colorTheme') || e.affectsConfiguration('workbench.iconTheme') || e.affectsConfiguration('workbench.productIconTheme')) this.emitter.fire();
    }),
  ];

  dispose(): void {
    this.subs.forEach((s) => s.dispose());
    this.emitter.dispose();
  }

  items(): SlashItem[] {
    const items: SlashItem[] = [];
    const config = vscode.workspace.getConfiguration('workbench');
    if (isFeatureEnabled('themes', 'toggle')) {
      items.push(
        make({ id: 'theme:toggle', name: 'dark-light', title: 'Toggle Light/Dark Theme', icon: 'circle-half-tilt', feature: 'toggle', boost: 3, keywords: ['dark mode', 'light mode'], run: () => vscode.commands.executeCommand('workbench.action.toggleLightDarkThemes') }),
        make({ id: 'theme:pick', name: 'themes', title: 'Browse Color Themes (live preview)', icon: 'palette', feature: 'toggle', run: () => vscode.commands.executeCommand('workbench.action.selectTheme') }),
        make({ id: 'theme:more', name: 'more-themes', title: 'Find More Themes in the Marketplace', icon: 'storefront', feature: 'toggle', run: () => vscode.commands.executeCommand('workbench.extensions.search', '@category:themes') }),
      );
    }
    for (const ext of vscode.extensions.all) {
      const contributes = ext.packageJSON?.contributes ?? {};
      const extName = String(ext.packageJSON?.displayName ?? ext.packageJSON?.name ?? ext.id);
      if (isFeatureEnabled('themes', 'color')) {
        for (const theme of (contributes.themes ?? []) as ThemeContribution[]) {
          const id = theme.id ?? theme.label;
          if (!id) continue;
          const kind = theme.uiTheme?.startsWith('hc') ? 'High Contrast' : theme.uiTheme === 'vs' ? 'Light' : 'Dark';
          items.push(this.themeItem('workbench.colorTheme', id, theme.label ?? id, `${kind} · ${extName}`, kind === 'Light' ? 'sun' : 'moon', 'color', config.get('colorTheme') === id));
        }
      }
      if (isFeatureEnabled('themes', 'icon')) {
        for (const theme of (contributes.iconThemes ?? []) as ThemeContribution[]) {
          if (theme.id) items.push(this.themeItem('workbench.iconTheme', theme.id, theme.label ?? theme.id, `File icons · ${extName}`, 'shapes', 'icon', config.get('iconTheme') === theme.id));
        }
        for (const theme of (contributes.productIconThemes ?? []) as ThemeContribution[]) {
          if (theme.id) items.push(this.themeItem('workbench.productIconTheme', theme.id, theme.label ?? theme.id, `Product icons · ${extName}`, 'shapes', 'icon', config.get('productIconTheme') === theme.id));
        }
      }
    }
    return items;
  }

  private themeItem(setting: string, id: string, label: string, description: string, icon: string, feature: string, active: boolean): SlashItem {
    return make({
      id: `theme:${setting}:${id}`,
      title: label,
      description,
      badge: active ? 'active' : undefined,
      icon,
      category: setting === 'workbench.colorTheme' ? 'Color Themes' : 'Icon Themes',
      feature,
      keywords: ['theme'],
      run: async () => {
        await vscode.workspace.getConfiguration().update(setting, id, vscode.ConfigurationTarget.Global);
      },
    });
  }
}
