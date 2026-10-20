import * as vscode from 'vscode';
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
      make({ id: `slashi:${name}`, name, title, description, icon, feature: 'default', run: () => vscode.commands.executeCommand(command, arg) });
    return [
      cmd('welcome', 'Slashi: Welcome & Onboarding', 'rocket-launch', 'slashi.welcome', 'Replay the onboarding'),
      cmd('help', 'Slashi: Help & Getting Started', 'question', 'workbench.action.openWalkthrough', 'Interactive walkthrough', 'meness.slashi#slashi.welcome'),
      cmd('providers', 'Slashi: Enable/Disable Providers & Features', 'toggle-right', 'slashi.toggleProviders', 'Choose what Slashi searches'),
      cmd('studio', 'Slashi: Open Studio', 'sliders-horizontal', 'slashi.studio', 'Providers, AI models and custom commands in one place'),
      cmd('shortcuts', 'Slashi: Customize Keyboard Shortcuts', 'keyboard', 'slashi.customizeShortcuts', 'Rebind Slashi or bind any slash command to a key'),
      cmd('native', 'Slashi: Open in Native Quick Pick', 'list-magnifying-glass', 'slashi.openNative'),
      cmd('refresh', 'Slashi: Refresh Catalogues', 'arrows-clockwise', 'slashi.refresh', 'Re-scan files, project, extensions and settings'),
      cmd('clear-history', 'Slashi: Clear Recent History', 'clock-counter-clockwise', 'slashi.clearHistory'),
      cmd('slashi-settings', 'Slashi: All Settings', 'gear-six', 'workbench.action.openSettings', undefined, '@ext:meness.slashi'),
      make({
        id: 'slashi:log', name: 'slashi-log', title: 'Slashi: Show Log', icon: 'scroll', feature: 'default',
        run: () => this.services.log.show(),
      }),
      make({
        id: 'slashi:feedback', name: 'feedback', title: 'Slashi: Report an Issue or Idea', icon: 'chat-teardrop-text', feature: 'default',
        run: () => vscode.env.openExternal(vscode.Uri.parse('https://github.com/meness/slashi/issues/new/choose')),
      }),
    ];
  }
}
