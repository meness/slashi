import * as vscode from 'vscode';
import { isFeatureEnabled } from '../config';
import type { SlashItem, SlashProvider } from '../types';
import { ensureArgs, itemFactory } from './util';

const make = itemFactory('git', 'Git');

interface Ref {
  type: number; // 0 head, 1 remote head, 2 tag
  name?: string;
  remote?: string;
  commit?: string;
}

interface Repo {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  state: { HEAD?: { name?: string }; refs?: Ref[]; workingTreeChanges: unknown[]; indexChanges: unknown[] };
  getRefs?(query?: { pattern?: string }): Promise<Ref[]>;
  checkout(treeish: string): Promise<void>;
  createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
  commit(message: string, opts?: { all?: boolean }): Promise<void>;
}

function repositories(): Repo[] {
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: Repo[] } }>('vscode.git');
  return ext?.isActive ? ext.exports.getAPI(1).repositories : [];
}

function currentRepo(): Repo {
  const repos = repositories();
  const uri = vscode.window.activeTextEditor?.document.uri;
  const repo = repos.find((r) => uri?.fsPath.startsWith(r.rootUri.fsPath)) ?? repos[0];
  if (!repo) throw new Error('No Git repository is open.');
  return repo;
}

/** Git commands (built-in Git extension) plus branch switching. */
export class GitProvider implements SlashProvider {
  readonly id = 'git' as const;
  readonly title = 'Git';
  readonly description = 'Commit, push, pull, branch, stash and more — plus one-key branch switching.';
  readonly icon = 'git-branch';
  readonly prefix = 'git';
  readonly placeholder = 'Git: commit, push, switch branch…';
  readonly volatile = true;
  readonly features = [
    { id: 'core', title: 'Git commands', description: 'commit, push, pull, sync, fetch, stage, undo, diff, history.' },
    { id: 'branches', title: 'Branches', description: 'Switch to any local or remote branch, create branches.' },
    { id: 'stash', title: 'Stash', description: 'Stash, pop and apply.' },
  ];

  async items(): Promise<SlashItem[]> {
    const items: SlashItem[] = [];
    const cmd = (feature: string, name: string, title: string, icon: string, command: string, boost = 0) =>
      make({ id: `git:${name}`, name, title, icon, feature, boost, keywords: ['git'], aiKind: 'git command', run: () => vscode.commands.executeCommand(command) });

    if (isFeatureEnabled('git', 'core')) {
      items.push(
        make({
          id: 'git:commit', name: 'commit', title: 'Git: Commit', description: 'Commit staged changes (or everything) with a message', icon: 'git-commit', feature: 'core', boost: 6,
          args: { placeholder: 'commit message' }, keywords: ['git'],
          run: async (ctx) => {
            const repo = currentRepo();
            const message = await ensureArgs(ctx.args, 'Commit message', { value: repo.inputBox.value });
            if (!message) return;
            const all = repo.state.indexChanges.length === 0;
            await repo.commit(message, { all });
            void vscode.window.setStatusBarMessage(`$(git-commit) Committed${all ? ' all changes' : ''}: ${message}`, 4000);
          },
        }),
        cmd('core', 'push', 'Git: Push', 'cloud-arrow-up', 'git.push', 4),
        cmd('core', 'pull', 'Git: Pull', 'cloud-arrow-down', 'git.pull', 4),
        cmd('core', 'sync', 'Git: Sync (Pull & Push)', 'arrows-clockwise', 'git.sync', 2),
        cmd('core', 'fetch', 'Git: Fetch', 'cloud-arrow-down', 'git.fetch'),
        cmd('core', 'stage', 'Git: Stage Current File', 'plus-circle', 'git.stage'),
        cmd('core', 'stage-all', 'Git: Stage All Changes', 'plus-circle', 'git.stageAll', 2),
        cmd('core', 'unstage-all', 'Git: Unstage All Changes', 'minus-circle', 'git.unstageAll'),
        cmd('core', 'discard', 'Git: Discard Changes in Current File', 'arrow-counter-clockwise', 'git.clean'),
        cmd('core', 'undo-commit', 'Git: Undo Last Commit', 'arrow-u-up-left', 'git.undoCommit'),
        cmd('core', 'amend', 'Git: Commit (Amend)', 'git-commit', 'git.commitAmend'),
        cmd('core', 'diff', 'Git: Open Changes', 'git-diff', 'git.openChange', 2),
        cmd('core', 'git-file', 'Git: Open File (HEAD)', 'file', 'git.openFile'),
        cmd('core', 'blame', 'Git: Toggle Inline Blame', 'user-circle', 'git.blame.toggleEditorDecoration'),
        cmd('core', 'history', 'Git: File History (Timeline)', 'clock-counter-clockwise', 'timeline.focus'),
        cmd('core', 'clone', 'Git: Clone…', 'download-simple', 'git.clone'),
        cmd('core', 'init', 'Git: Initialize Repository', 'git-branch', 'git.init'),
        cmd('core', 'add-remote', 'Git: Add Remote…', 'globe', 'git.addRemote'),
        cmd('core', 'merge', 'Git: Merge Branch…', 'git-merge', 'git.merge'),
        cmd('core', 'rebase', 'Git: Rebase Branch…', 'git-merge', 'git.rebase'),
        cmd('core', 'tag', 'Git: Create Tag…', 'tag', 'git.createTag'),
        cmd('core', 'git-output', 'Git: Show Output', 'scroll', 'git.showOutput'),
      );
    }
    if (isFeatureEnabled('git', 'stash')) {
      items.push(
        cmd('stash', 'stash', 'Git: Stash', 'archive', 'git.stash', 2),
        cmd('stash', 'stash-pop', 'Git: Pop Latest Stash', 'archive', 'git.stashPopLatest'),
        cmd('stash', 'stash-apply', 'Git: Apply Stash…', 'archive', 'git.stashApply'),
        cmd('stash', 'stash-untracked', 'Git: Stash (Include Untracked)', 'archive', 'git.stashIncludeUntracked'),
        cmd('stash', 'stash-drop', 'Git: Drop Stash…', 'trash', 'git.stashDrop'),
      );
    }
    if (isFeatureEnabled('git', 'branches')) {
      items.push(
        make({
          id: 'git:branch', name: 'branch', title: 'Git: Create Branch', description: 'Create and switch to a new branch', icon: 'git-branch', feature: 'branches', boost: 3,
          args: { placeholder: 'branch-name' }, keywords: ['git', 'new branch'],
          run: async (ctx) => {
            const name = await ensureArgs(ctx.args, 'New branch name');
            if (name) await currentRepo().createBranch(name.replace(/\s+/g, '-'), true);
          },
        }),
        cmd('branches', 'checkout', 'Git: Checkout to…', 'git-branch', 'git.checkout'),
        cmd('branches', 'delete-branch', 'Git: Delete Branch…', 'trash', 'git.deleteBranch'),
        cmd('branches', 'rename-branch', 'Git: Rename Branch…', 'pencil-simple-line', 'git.renameBranch'),
        cmd('branches', 'publish-branch', 'Git: Publish Branch', 'cloud-arrow-up', 'git.publish'),
      );
      items.push(...(await this.branchItems()));
    }
    return items;
  }

  private async branchItems(): Promise<SlashItem[]> {
    const repos = repositories();
    const items: SlashItem[] = [];
    for (const repo of repos) {
      const refs = repo.getRefs ? await repo.getRefs().catch(() => repo.state.refs ?? []) : repo.state.refs ?? [];
      const head = repo.state.HEAD?.name;
      const repoName = repos.length > 1 ? `${vscode.workspace.asRelativePath(repo.rootUri)} · ` : '';
      for (const ref of refs.slice(0, 300)) {
        if (!ref.name || ref.type === 2 || ref.name.endsWith('/HEAD')) continue;
        const remote = ref.type === 1;
        items.push(
          make({
            id: `branch:${repo.rootUri.toString()}:${ref.name}`,
            title: ref.name,
            description: `${repoName}${remote ? 'remote branch' : 'branch'}${ref.commit ? ` · ${ref.commit.slice(0, 7)}` : ''}`,
            badge: ref.name === head ? 'current' : undefined,
            icon: remote ? 'cloud' : 'git-branch',
            category: 'Branches',
            feature: 'branches',
            keywords: ['branch', 'checkout', 'switch'],
            run: async () => {
              const target = remote ? ref.name!.replace(/^[^/]+\//, '') : ref.name!;
              if (!remote || refs.some((r) => r.type === 0 && r.name === target)) await repo.checkout(target);
              else await repo.createBranch(target, true, ref.name);
              void vscode.window.setStatusBarMessage(`$(git-branch) Switched to ${target}`, 3000);
            },
          }),
        );
      }
    }
    return items;
  }
}
