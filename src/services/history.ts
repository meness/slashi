import type * as vscode from 'vscode';
import { recordUse } from '../core/frecency';
import type { FrecencyMap } from '../core/protocol';
import { get } from '../config';

const KEY = 'slashi.history';

/** Frecency store persisted in global state. */
export class History {
  constructor(private readonly state: vscode.Memento) {}

  get map(): FrecencyMap {
    return get('history.enabled', true) ? this.state.get<FrecencyMap>(KEY, {}) : {};
  }

  async record(id: string): Promise<void> {
    if (!get('history.enabled', true)) return;
    await this.state.update(KEY, recordUse(this.state.get<FrecencyMap>(KEY, {}), id, Date.now()));
  }

  async clear(): Promise<void> {
    await this.state.update(KEY, undefined);
  }
}
