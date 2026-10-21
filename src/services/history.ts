import type * as vscode from 'vscode';
import { recordUse } from '../core/frecency';
import type { FrecencyMap } from '../core/protocol';
import { get } from '../config';

const KEY = 'slashi.history';
/** `/again` itself is never the command to run again. */
export const AGAIN_ID = 'slashi:again';

export interface LastRun {
  id: string;
  args: string;
  action?: string;
}

/** Frecency store persisted in global state. */
export class History {
  /** In memory only: arguments can hold questions, shell commands or tokens, which must not be written to disk. */
  private lastRun?: LastRun;

  constructor(private readonly state: vscode.Memento) {}

  get map(): FrecencyMap {
    return get('history.enabled', true) ? this.state.get<FrecencyMap>(KEY, {}) : {};
  }

  /** The last command run, for `/again`. */
  get last(): LastRun | undefined {
    return get('history.enabled', true) ? this.lastRun : undefined;
  }

  async record(id: string, args = '', action?: string): Promise<void> {
    if (!get('history.enabled', true)) return;
    await this.state.update(KEY, recordUse(this.state.get<FrecencyMap>(KEY, {}), id, Date.now()));
    if (id !== AGAIN_ID) this.lastRun = { id, args, action };
  }

  async clear(): Promise<void> {
    await this.state.update(KEY, undefined);
    this.lastRun = undefined;
  }
}
