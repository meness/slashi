// Natural language → executable plan. Prompt building, parsing and validation are pure.

export interface IntentCandidate {
  /** Slashi item id, e.g. `cmd:editor.action.formatDocument`. */
  id: string;
  title: string;
  /** Short type hint for the model: command, setting, file, script… */
  kind: string;
  /** Present when the item accepts free-text arguments. */
  args?: string;
  /** For settings: type and allowed values. */
  hint?: string;
}

export type PlanStep =
  | { type: 'item'; id: string; args?: string; why?: string }
  | { type: 'setting'; key: string; value: unknown; why?: string }
  | { type: 'terminal'; command: string; why?: string };

export interface IntentPlan {
  reply: string;
  steps: PlanStep[];
}

export interface IntentContext {
  os: string;
  languageId?: string;
  fileName?: string;
  hasSelection: boolean;
  workspaceName?: string;
  stack?: string[];
}

export function buildIntentPrompt(task: string, candidates: readonly IntentCandidate[], context: IntentContext): { system: string; user: string } {
  const system = [
    'You are Slashi, an assistant that operates Visual Studio Code for a developer.',
    'Turn the developer\'s request into a short plan of concrete actions chosen ONLY from the catalog provided.',
    'Respond with a single JSON object and nothing else, using this shape:',
    '{"reply": "one short sentence describing what you will do (or the answer if no action is needed)",',
    ' "steps": [',
    '   {"type": "item", "id": "<catalog id>", "args": "<optional text for items that accept arguments>", "why": "<few words>"},',
    '   {"type": "setting", "key": "<setting key from the catalog>", "value": <JSON value>, "why": "<few words>"},',
    '   {"type": "terminal", "command": "<shell command>", "why": "<few words>"}',
    ' ]}',
    'Rules:',
    '- Prefer catalog items over terminal commands. Use a terminal step only when no catalog item fits.',
    '- Never invent ids or setting keys. If nothing fits, return an empty steps array and explain in reply.',
    '- Keep plans minimal: usually 1–3 steps, in execution order.',
    '- Never include destructive terminal commands (rm -rf, force pushes, dropping databases) unless explicitly requested.',
    `- The developer is on ${context.os}${context.languageId ? `, editing a ${context.languageId} file` : ''}${context.fileName ? ` (${context.fileName})` : ''}${context.hasSelection ? ' with text selected' : ''}.`,
    context.stack?.length ? `- The project uses: ${context.stack.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const catalog = candidates
    .map((c) => {
      const extra = [c.args ? `args: ${c.args}` : '', c.hint ?? ''].filter(Boolean).join('; ');
      return `- ${c.id} | ${c.kind} | ${c.title}${extra ? ` (${extra})` : ''}`;
    })
    .join('\n');

  const user = `Catalog (id | kind | title):\n${catalog}\n\nRequest: ${task}`;
  return { system, user };
}

/** Extracts the first top-level JSON object from model output (handles code fences and chatter). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const source = fenced ? fenced[1] : text;
  const start = source.indexOf('{');
  if (start === -1) throw new Error('The model did not return JSON.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(source.slice(start, i + 1));
    }
  }
  throw new Error('The model returned incomplete JSON.');
}

export function parseIntentResponse(text: string): IntentPlan {
  const raw = extractJson(text) as { reply?: unknown; steps?: unknown };
  const reply = typeof raw.reply === 'string' ? raw.reply : '';
  const steps: PlanStep[] = [];
  if (Array.isArray(raw.steps)) {
    for (const s of raw.steps as Record<string, unknown>[]) {
      if (!s || typeof s !== 'object') continue;
      const why = typeof s.why === 'string' ? s.why : undefined;
      if (s.type === 'item' && typeof s.id === 'string') {
        steps.push({ type: 'item', id: s.id, args: typeof s.args === 'string' && s.args ? s.args : undefined, why });
      } else if (s.type === 'setting' && typeof s.key === 'string' && 'value' in s) {
        steps.push({ type: 'setting', key: s.key, value: s.value, why });
      } else if (s.type === 'terminal' && typeof s.command === 'string' && s.command.trim()) {
        steps.push({ type: 'terminal', command: s.command.trim(), why });
      }
    }
  }
  return { reply, steps };
}

export interface ValidatedPlan extends IntentPlan {
  dropped: string[];
}

/** Drops steps that reference unknown items or settings so the model can't invent actions. */
export function validatePlan(plan: IntentPlan, knownItemIds: ReadonlySet<string>, knownSettingKeys: ReadonlySet<string>): ValidatedPlan {
  const steps: PlanStep[] = [];
  const dropped: string[] = [];
  for (const step of plan.steps) {
    if (step.type === 'item' && !knownItemIds.has(step.id)) dropped.push(`unknown action “${step.id}”`);
    else if (step.type === 'setting' && !knownSettingKeys.has(step.key)) dropped.push(`unknown setting “${step.key}”`);
    else steps.push(step);
  }
  return { reply: plan.reply, steps: steps.slice(0, 10), dropped };
}
