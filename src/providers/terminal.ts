import * as vscode from 'vscode';
import { isFeatureEnabled } from '../config';
import type { Services } from '../services/services';
import type { SlashItem, SlashProvider } from '../types';
import { ensureArgs, itemFactory } from './util';

const make = itemFactory('terminal', 'Terminal');
const TASK_TTL = 60_000;

/** Run shell commands and VS Code tasks, manage terminals. */
export class TerminalProvider implements SlashProvider {
  readonly id = 'terminal' as const;
  readonly title = 'Terminal & Tasks';
  readonly description = 'Run shell commands and VS Code tasks, and manage terminals.';
  readonly icon = 'terminal-window';
  readonly prefix = 'term';
  readonly placeholder = 'Run a command, a task, or manage terminals…';
  readonly features = [
    { id: 'run', title: 'Run commands', description: '/run <command> in a reusable terminal.' },
    { id: 'tasks', title: 'VS Code tasks', description: 'Tasks from tasks.json and task providers.' },
    { id: 'manage', title: 'Manage terminals', description: 'New, split, kill, clear, focus, maximize.' },
  ];

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private tasks?: { at: number; list: vscode.Task[] };

  constructor(private readonly services: Services) {}

  async items(): Promise<SlashItem[]> {
    const items: SlashItem[] = [];
    if (isFeatureEnabled('terminal', 'run')) {
      items.push(
        make({
          id: 'term:run',
          name: 'run',
          title: 'Run in Terminal',
          description: 'Run a shell command in the Slashi terminal',
          icon: 'terminal-window',
          feature: 'run',
          args: { placeholder: 'command, e.g. git status' },
          boost: 7,
          keywords: ['shell', 'exec', 'execute'],
          run: async (ctx) => {
            const cmd = await ensureArgs(ctx.args, 'Command to run');
            if (cmd) this.services.terminal.run(cmd);
          },
        }),
        make({
          id: 'term:run-new',
          name: 'run-new',
          title: 'Run in New Terminal',
          icon: 'terminal',
          feature: 'run',
          args: { placeholder: 'command' },
          run: async (ctx) => {
            const cmd = await ensureArgs(ctx.args, 'Command to run');
            if (cmd) this.services.terminal.run(cmd, { reuse: false });
          },
        }),
        make({
          id: 'term:selection',
          name: 'run-selection',
          title: 'Run Selected Text in Terminal',
          icon: 'play',
          feature: 'run',
          needsEditor: true,
          run: async (ctx) => {
            await ctx.editor();
            await vscode.commands.executeCommand('workbench.action.terminal.runSelectedText');
          },
        }),
      );
    }
    if (isFeatureEnabled('terminal', 'manage')) {
      const cmd = (name: string, title: string, icon: string, command: string, boost = 0) =>
        make({ id: `term:${name}`, name, title, icon, feature: 'manage', boost, run: () => vscode.commands.executeCommand(command) });
      items.push(
        cmd('terminal', 'Toggle Terminal', 'terminal-window', 'workbench.action.terminal.toggleTerminal', 4),
        cmd('new-terminal', 'New Terminal', 'plus-square', 'workbench.action.terminal.new', 2),
        cmd('split-terminal', 'Split Terminal', 'columns', 'workbench.action.terminal.split'),
        cmd('kill-terminal', 'Kill Terminal', 'skull', 'workbench.action.terminal.kill'),
        cmd('kill-all-terminals', 'Kill All Terminals', 'skull', 'workbench.action.terminal.killAll'),
        cmd('clear-terminal', 'Clear Terminal', 'broom', 'workbench.action.terminal.clear'),
        cmd('terminal-editor', 'New Terminal in Editor Area', 'browser', 'workbench.action.createTerminalEditor'),
        cmd('select-terminal', 'Switch Terminal…', 'list-bullets', 'workbench.action.quickOpenTerm'),
        cmd('default-shell', 'Select Default Shell Profile…', 'gear-six', 'workbench.action.terminal.selectDefaultShell'),
      );
    }
    if (isFeatureEnabled('terminal', 'tasks')) {
      const cmd = (name: string, title: string, icon: string, command: string) =>
        make({ id: `term:${name}`, name, title, icon, feature: 'tasks', run: () => vscode.commands.executeCommand(command) });
      items.push(
        cmd('task', 'Run Task…', 'list-checks', 'workbench.action.tasks.runTask'),
        cmd('build', 'Run Build Task', 'hammer', 'workbench.action.tasks.build'),
        cmd('test-task', 'Run Test Task', 'flask', 'workbench.action.tasks.test'),
        cmd('restart-task', 'Restart Running Task', 'arrow-clockwise', 'workbench.action.tasks.restartTask'),
        cmd('stop-task', 'Terminate Task', 'stop', 'workbench.action.tasks.terminate'),
        cmd('tasks-json', 'Configure Tasks (tasks.json)', 'gear-six', 'workbench.action.tasks.configureTaskRunner'),
      );
      for (const task of await this.fetchTasks()) {
        const source = task.source === 'Workspace' ? 'tasks.json' : task.source;
        items.push(
          make({
            id: `task:${source}:${task.name}:${task.definition.type}`,
            title: `${source}: ${task.name}`,
            description: task.detail ?? task.definition.type,
            icon: task.group === vscode.TaskGroup.Build ? 'hammer' : task.group === vscode.TaskGroup.Test ? 'flask' : 'list-checks',
            category: 'Tasks',
            feature: 'tasks',
            keywords: ['task', task.definition.type],
            run: () => vscode.tasks.executeTask(task),
          }),
        );
      }
    }
    return items;
  }

  private async fetchTasks(): Promise<vscode.Task[]> {
    if (this.tasks && Date.now() - this.tasks.at < TASK_TTL) return this.tasks.list;
    // Task providers can be slow (e.g. npm scanning); never block the popup for long.
    const list = await Promise.race([
      Promise.resolve(vscode.tasks.fetchTasks()).catch(() => [] as vscode.Task[]),
      new Promise<vscode.Task[] | undefined>((r) => {
        setTimeout(() => r(undefined), 1500);
      }),
    ]);
    if (!list) {
      // Finish in the background and refresh once ready.
      void Promise.resolve(vscode.tasks.fetchTasks()).then((full) => {
        this.tasks = { at: Date.now(), list: full.filter((t) => t.source !== 'npm') };
        this.emitter.fire();
      });
      return this.tasks?.list ?? [];
    }
    // npm scripts are covered (with the right package manager) by the Project provider.
    this.tasks = { at: Date.now(), list: list.filter((t) => t.source !== 'npm') };
    return this.tasks.list;
  }
}
