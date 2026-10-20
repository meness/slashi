import * as vscode from 'vscode';
import { isFeatureEnabled } from '../config';
import { pickIcon } from '../core/icons';
import { CORE_COMMANDS } from '../data/coreCommands';
import type { SlashItem, SlashProvider } from '../types';
import { itemFactory } from './util';

const make = itemFactory('commands', 'Commands');
const OWN_EXTENSION = 'meness.slashi';

interface ContributedCommand {
  command: string;
  title: string | { value: string };
  category?: string | { value: string };
  enablement?: string;
}

const text = (v: string | { value: string } | undefined) => (typeof v === 'string' ? v : (v?.value ?? ''));

/** Built-in commands (curated) and every command contributed by installed extensions. */
export class CommandsProvider implements SlashProvider {
  readonly id = 'commands' as const;
  readonly title = 'Commands';
  readonly description = 'VS Code commands and commands from your installed extensions.';
  readonly icon = 'lightning';
  readonly prefix = 'cmd';
  readonly placeholder = 'Run any VS Code or extension command…';
  readonly features = [
    { id: 'core', title: 'VS Code commands', description: '~170 curated built-in commands with slash names (/format, /split, /zen…).' },
    {
      id: 'extensionCommands',
      title: 'Extension commands',
      description: 'Commands contributed by installed extensions (Git, Copilot, ESLint…).',
    },
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
    const seen = new Set<string>();
    if (isFeatureEnabled('commands', 'core')) {
      for (const cmd of CORE_COMMANDS) {
        seen.add(cmd.id);
        items.push(
          make({
            id: `cmd:${cmd.id}`,
            name: cmd.name ?? '',
            title: cmd.title,
            description: cmd.group,
            icon: cmd.icon,
            category: cmd.group,
            feature: 'core',
            keywords: cmd.keywords ? [cmd.keywords] : undefined,
            args: cmd.args ? { placeholder: cmd.args.placeholder } : undefined,
            boost: cmd.boost,
            aiKind: 'command',
            aiHint: cmd.args ? `args: ${cmd.args.placeholder}` : undefined,
            run: async (ctx) => {
              if (cmd.editor) await ctx.editor();
              const args = cmd.args && ctx.args ? cmd.args.map(ctx.args) : [];
              await vscode.commands.executeCommand(cmd.id, ...args);
            },
          }),
        );
      }
    }
    if (isFeatureEnabled('commands', 'extensionCommands')) {
      for (const ext of vscode.extensions.all) {
        if (ext.id === OWN_EXTENSION) continue;
        const contributes = ext.packageJSON?.contributes;
        const commands: ContributedCommand[] = Array.isArray(contributes?.commands) ? contributes.commands : [];
        if (!commands.length) continue;
        const hidden = hiddenInPalette(contributes?.menus?.commandPalette);
        const extName = String(ext.packageJSON?.displayName ?? ext.packageJSON?.name ?? ext.id);
        const isBuiltin = ext.packageJSON?.isBuiltin === true || ext.id.startsWith('vscode.');
        for (const cmd of commands) {
          if (!cmd?.command || seen.has(cmd.command) || hidden.has(cmd.command)) continue;
          seen.add(cmd.command);
          const category = text(cmd.category);
          const title = category ? `${category}: ${text(cmd.title)}` : text(cmd.title);
          items.push(
            make({
              id: `cmd:${cmd.command}`,
              title,
              description: isBuiltin ? `Built-in · ${extName}` : extName,
              icon: pickIcon(title),
              category: 'Extension Commands',
              feature: 'extensionCommands',
              keywords: [cmd.command],
              aiKind: 'command',
              run: async (ctx) => {
                await ctx.editor();
                await vscode.commands.executeCommand(cmd.command);
              },
            }),
          );
        }
      }
    }
    return items;
  }
}

/** Commands an extension hides from the palette with `"when": "false"`. */
function hiddenInPalette(entries: unknown): Set<string> {
  const hidden = new Set<string>();
  if (Array.isArray(entries)) {
    for (const e of entries as { command?: string; when?: string }[]) {
      if (e?.command && e.when === 'false') hidden.add(e.command);
    }
  }
  return hidden;
}
