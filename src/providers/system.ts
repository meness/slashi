import * as os from 'node:os';
import * as vscode from 'vscode';
import { get, isProviderEnabled } from '../config';
import { HELP_LINKS, type HelpLink } from '../data/links';
import { execute } from '../executor';
import { AGAIN_ID } from '../services/history';
import type { Services } from '../services/services';
import type { SlashItem, SlashProvider } from '../types';
import { itemFactory } from './util';

const make = itemFactory('system', 'Slashi');

/** Slashi's own commands: help, providers, studio, shortcuts… Always enabled. */
export class SystemProvider implements SlashProvider {
  readonly id = 'system' as const;
  readonly title = 'Slashi';
  readonly description = 'Slashi itself: help, providers, AI setup, shortcuts.';
  readonly icon = 'slash';
  readonly prefix = 'slashi';
  readonly placeholder = 'Slashi settings and help…';
  readonly features = [{ id: 'default', title: 'Slashi', description: 'Help and configuration.' }];

  constructor(private readonly services: Services) {}

  items(): SlashItem[] {
    const cmd = (name: string, title: string, icon: string, command: string, description?: string, arg?: unknown) =>
      make({
        id: `slashi:${name}`,
        name,
        title,
        description,
        icon,
        feature: 'default',
        run: () => vscode.commands.executeCommand(command, arg),
      });
    // Names avoid common package-script names (docs, changelog), which would compete for the same slash name.
    const link = (name: string, title: string, icon: string, key: HelpLink, description?: string) =>
      make({
        id: `slashi:${name}`,
        name,
        title,
        description,
        icon,
        feature: 'default',
        run: () => vscode.env.openExternal(vscode.Uri.parse(HELP_LINKS[key])),
      });
    return [
      make({
        id: AGAIN_ID,
        name: 'again',
        title: 'Slashi: Run Last Command Again',
        description: 'Repeats the last command with the same arguments',
        icon: 'arrow-clockwise',
        feature: 'default',
        boost: 3,
        keywords: ['repeat', 'last', 'redo'],
        run: async () => {
          const last = this.services.history.last;
          const item = last && this.services.registry.find(last.id);
          if (!item) return void vscode.window.showInformationMessage('Slashi: there is no command to run again yet.');
          await execute(this.services, item, last.args, last.action, this.services.snapshot);
        },
      }),
      cmd('welcome', 'Slashi: Welcome & Onboarding', 'rocket-launch', 'slashi.welcome', 'Replay the onboarding'),
      cmd(
        'help',
        'Slashi: Getting Started Walkthrough',
        'question',
        'workbench.action.openWalkthrough',
        'Interactive walkthrough',
        'meness.slashi#slashi.welcome',
      ),
      cmd(
        'help-center',
        'Slashi: Help & Support',
        'lifebuoy',
        'slashi.studio',
        'Docs, troubleshooting, feedback and ways to support Slashi',
        'help',
      ),
      cmd(
        'providers',
        'Slashi: Enable/Disable Providers & Features',
        'toggle-right',
        'slashi.toggleProviders',
        'Choose what Slashi searches',
      ),
      cmd('studio', 'Slashi: Open Studio', 'sliders-horizontal', 'slashi.studio', 'Providers, AI models and custom commands in one place'),
      cmd(
        'shortcuts',
        'Slashi: Customize Keyboard Shortcuts',
        'keyboard',
        'slashi.customizeShortcuts',
        'Rebind Slashi or bind any slash command to a key',
      ),
      cmd('native', 'Slashi: Open in Native Quick Pick', 'list-magnifying-glass', 'slashi.openNative'),
      cmd(
        'refresh',
        'Slashi: Refresh Search Results',
        'arrows-clockwise',
        'slashi.refresh',
        'Re-scan files, project, extensions and settings',
      ),
      cmd('clear-history', 'Slashi: Clear Recent History', 'clock-counter-clockwise', 'slashi.clearHistory'),
      cmd('slashi-settings', 'Slashi: All Settings', 'gear-six', 'workbench.action.openSettings', undefined, '@ext:meness.slashi'),
      cmd(
        'diagnostics',
        'Slashi: Copy Diagnostics',
        'clipboard-text',
        'slashi.copyDiagnostics',
        'Versions and setup for a bug report (no keys, files or code)',
      ),
      make({
        id: 'slashi:log',
        name: 'slashi-log',
        title: 'Slashi: Show Log',
        icon: 'scroll',
        feature: 'default',
        run: () => this.services.log.show(),
      }),
      link('feedback', 'Slashi: Report an Issue or Idea', 'chat-teardrop-text', 'issues'),
      link('slashi-docs', 'Slashi: Documentation', 'book-open', 'docs', 'The full guide on GitHub'),
      link('whats-new', 'Slashi: What’s New', 'git-commit', 'changelog', 'Release notes'),
      link('rate', 'Slashi: Rate on the Marketplace', 'star', 'rate', 'A review helps others find Slashi'),
      link('support', 'Slashi: Support Development', 'hand-heart', 'donate', 'Donate to keep Slashi free and maintained'),
    ];
  }
}

/** Versions and setup for bug reports. Never includes keys, URLs, file names, paths or code. */
export async function diagnostics(services: Services): Promise<string> {
  const version = vscode.extensions.getExtension('meness.slashi')?.packageJSON?.version ?? 'dev';
  const off = services.registry
    .all()
    .filter((p) => !isProviderEnabled(p.id))
    .map((p) => p.id);
  const features = get<string[]>('disabledFeatures', []);
  return [
    `Slashi: ${version}`,
    `Editor: ${vscode.env.appName} ${vscode.version}`,
    `OS: ${process.platform} ${process.arch} ${os.release()}`,
    `Remote: ${vscode.env.remoteName ?? 'none'} · Trusted workspace: ${vscode.workspace.isTrusted ? 'yes' : 'no'}`,
    `Popup: ${get('popup.style', 'spotlight')} · Slash key: ${get('shortcut.useSlashKey', true) ? 'on' : 'off'}`,
    `AI: ${(await services.ai.label()) || 'not connected'} (setting: ${get('ai.provider', 'auto')})`,
    `Providers off: ${off.join(', ') || 'none'}`,
    `Features off: ${features.join(', ') || 'none'}`,
  ].join('\n');
}
