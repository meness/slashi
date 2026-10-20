import * as vscode from 'vscode';
import { get } from '../config';
import { buildIntentPrompt, parseIntentResponse, stepReachesShell, validatePlan, type IntentCandidate, type PlanStep } from '../core/intent';
import { parseQuery } from '../core/query';
import { indexItems, rank } from '../core/search';
import { execute } from '../executor';
import type { EditorSnapshot } from '../services/editor';
import type { Services } from '../services/services';
import type { SlashItem, SlashProvider } from '../types';
import { baseSystem } from './ai';
import { collectSettings } from './settings';
import { ensureArgs, itemFactory, settingTitle } from './util';

const make = itemFactory('naturalLanguage', 'Natural Language');

const OS_NAMES: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

/** “Do with AI”: turns a sentence into a validated plan of Slashi actions. */
export class NaturalLanguageProvider implements SlashProvider {
  readonly id = 'naturalLanguage' as const;
  readonly title = 'Natural Language';
  readonly description = 'Describe a task in plain English, and AI picks the right actions and asks before running them.';
  readonly icon = 'magic-wand';
  readonly prefix = 'do';
  readonly placeholder = 'Describe what you want to do…';
  readonly features = [{ id: 'default', title: 'Do with AI', description: 'Plain-English requests become actions.' }];

  constructor(private readonly services: Services) {}

  items(): SlashItem[] {
    return [
      make({
        id: 'nl:do',
        name: 'do',
        title: 'Do With AI',
        description: 'Describe a task in plain English — e.g. “make the font bigger and turn on word wrap”',
        icon: 'magic-wand',
        feature: 'default',
        args: { placeholder: 'what you want to do' },
        boost: 6,
        keywords: ['natural language', 'agent', 'automate'],
        run: async (ctx) => {
          const task = await ensureArgs(ctx.args, 'What should Slashi do?');
          if (task) await doWithAi(this.services, task, this.services.snapshot);
        },
      }),
    ];
  }
}

export async function doWithAi(services: Services, task: string, snapshot: EditorSnapshot | undefined): Promise<void> {
  const all = (await services.registry.allItems()).filter((i) => i.providerId !== 'naturalLanguage' && i.providerId !== 'system');
  const query = parseQuery(task, []);
  const ranked = rank(indexItems(all), query, { limit: 60, mode: 'any' });
  const byId = new Map(all.map((i) => [i.id, i]));
  const settings = collectSettings(true, true);
  const settingKeys = new Set(settings.map((s) => s.key));

  const candidates: IntentCandidate[] = ranked.map((r) => {
    const item = byId.get(r.id)!;
    return {
      id: item.id,
      title: item.title,
      kind: item.aiKind ?? item.category.toLowerCase(),
      args: item.args?.placeholder,
      hint: item.aiHint,
    };
  });
  // Settings are referenced by key so the model can set exact values.
  for (const r of ranked) {
    if (r.id.startsWith('set:')) {
      const key = r.id.slice(4);
      const meta = settings.find((s) => s.key === key);
      candidates.push({ id: key, title: settingTitle(key), kind: 'setting key', hint: meta?.type === 'enum' ? `one of ${meta.enum!.join(' | ')}` : meta?.type });
    }
  }

  const editor = snapshot?.document;
  const prompt = buildIntentPrompt(task, candidates, {
    os: OS_NAMES[process.platform] ?? process.platform,
    languageId: editor?.languageId,
    fileName: editor && !editor.isUntitled ? vscode.workspace.asRelativePath(editor.uri) : undefined,
    hasSelection: !!snapshot?.selections.some((s) => !s.isEmpty),
    stack: services.stack,
  });

  const text = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Slashi is planning: “${task}”`, cancellable: true },
    (_p, token) => services.ai.complete({ system: baseSystem(services, prompt.system), messages: [{ role: 'user', content: prompt.user }], maxTokens: 1500 }, token),
  );

  const plan = validatePlan(parseIntentResponse(text), new Set(byId.keys()), settingKeys);
  if (plan.dropped.length) services.log.warn(`Do with AI dropped steps: ${plan.dropped.join(', ')}`);
  if (!plan.steps.length) {
    void vscode.window.showInformationMessage(plan.reply || 'Slashi could not find an action for that. Try rephrasing, or use /ask.');
    return;
  }

  const describe = (step: PlanStep): string => {
    if (step.type === 'item') return `${byId.get(step.id)!.title}${step.args ? ` — “${step.args}”` : ''}`;
    if (step.type === 'setting') return `Set ${settingTitle(step.key)} = ${JSON.stringify(step.value)}`;
    return `Run in terminal: ${step.command}`;
  };
  const reachesShell = plan.steps.some((s) => stepReachesShell(s, (id) => byId.get(id)?.providerId));
  if (get('ai.confirmBeforeRun', true) || reachesShell) {
    const detail = plan.steps.map((s, i) => `${i + 1}. ${describe(s)}${s.why ? `  (${s.why})` : ''}`).join('\n');
    const choice = await vscode.window.showInformationMessage(plan.reply || 'Run this plan?', { modal: true, detail }, 'Run Plan');
    if (choice !== 'Run Plan') return;
  }

  for (const step of plan.steps) {
    if (step.type === 'item') {
      await execute(services, byId.get(step.id)!, step.args ?? '', undefined, snapshot);
    } else if (step.type === 'setting') {
      await vscode.workspace.getConfiguration().update(step.key, step.value, vscode.ConfigurationTarget.Global);
    } else {
      services.terminal.run(step.command);
    }
  }
  void vscode.window.setStatusBarMessage(`$(sparkle) Done: ${plan.reply || task}`, 4000);
}
