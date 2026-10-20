import * as vscode from 'vscode';
import { validatePack, type PackDef } from '../core/commandSchema';

const KEY = 'slashi.packs';

/** Installed action packs, persisted in global state (packs are small JSON documents). */
export class PackStore {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  list(): PackDef[] {
    const raw = this.context.globalState.get<unknown[]>(KEY, []);
    const packs: PackDef[] = [];
    for (const entry of raw) {
      const { value, errors } = validatePack(entry);
      if (value) packs.push(value);
      else this.log.warn(`Ignoring invalid installed pack: ${errors.join('; ')}`);
    }
    return packs;
  }

  get(id: string): PackDef | undefined {
    return this.list().find((p) => p.id === id);
  }

  async install(pack: PackDef): Promise<void> {
    const others = this.list().filter((p) => p.id !== pack.id);
    await this.context.globalState.update(KEY, [...others, pack]);
    this.emitter.fire();
  }

  async uninstall(id: string): Promise<void> {
    await this.context.globalState.update(KEY, this.list().filter((p) => p.id !== id));
    this.emitter.fire();
  }
}
