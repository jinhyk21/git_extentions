import * as vscode from "vscode";
import { RepositoryManager } from "../core/repository/RepositoryManager";
import type { GitChangedFile, GitFileStatusKind, RepositoryNode } from "../shared/types/repository";
import { registerCommands } from "./commands/registerCommands";

export function activate(context: vscode.ExtensionContext): void {
  const repositoryManager = new RepositoryManager();
  const treeProvider = new RepositoryTreeProvider(repositoryManager);
  const debugOutput = vscode.window.createOutputChannel("Git Workspace Pro (Debug)");
  context.subscriptions.push(debugOutput);

  context.subscriptions.push(vscode.window.registerTreeDataProvider("gitWorkspacePro.repositories", treeProvider));
  registerCommands(context, repositoryManager, () => treeProvider.refresh());

  const rescanWorkspace = () => {
    const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
    return repositoryManager.refresh(folders).then(() => {
      dumpRepositoryTreeForDebug(repositoryManager.getRepositories(), debugOutput);
      treeProvider.refresh();
    });
  };

  void rescanWorkspace();

  // Per-repository debounce: editing repo A must never delay or repeat-trigger
  // a status refresh for repo B, and must never re-scan the whole workspace.
  const pendingStatusRefreshes = new Map<string, NodeJS.Timeout>();
  const scheduleStatusRefresh = (repositoryRootPath: string) => {
    const existing = pendingStatusRefreshes.get(repositoryRootPath);
    if (existing) {
      clearTimeout(existing);
    }

    pendingStatusRefreshes.set(
      repositoryRootPath,
      setTimeout(() => {
        pendingStatusRefreshes.delete(repositoryRootPath);
        void repositoryManager.refreshRepositoryStatus(repositoryRootPath).then(() => treeProvider.refresh());
      }, 400)
    );
  };

  let rescanTimer: NodeJS.Timeout | undefined;
  const scheduleRescan = () => {
    if (rescanTimer) {
      clearTimeout(rescanTimer);
    }
    rescanTimer = setTimeout(() => void rescanWorkspace(), 500);
  };

  const onWorkspaceFileChanged = (uri: vscode.Uri) => {
    // Ignore .git/ internals (index, logs, refs) — they churn on every git
    // command and would otherwise re-trigger a refresh for our own operations.
    if (/[/\\]\.git([/\\]|$)/.test(uri.fsPath)) {
      return;
    }

    const repository = repositoryManager.findRepositoryForPath(uri.fsPath);
    if (repository) {
      scheduleStatusRefresh(repository.rootPath);
    }
  };

  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(onWorkspaceFileChanged),
    watcher.onDidCreate(onWorkspaceFileChanged),
    watcher.onDidDelete(onWorkspaceFileChanged),
    vscode.workspace.onDidChangeWorkspaceFolders(scheduleRescan),
    {
      dispose: () => {
        if (rescanTimer) {
          clearTimeout(rescanTimer);
        }
        for (const timer of pendingStatusRefreshes.values()) {
          clearTimeout(timer);
        }
        pendingStatusRefreshes.clear();
      }
    }
  );
}

export function deactivate(): void {}

function dumpRepositoryTreeForDebug(
  repositories: readonly RepositoryNode[],
  output: vscode.OutputChannel,
  depth = 0
): void {
  for (const repository of repositories) {
    const indent = "  ".repeat(depth);
    const status = repository.status;
    const statusSummary = status
      ? `files=${status.files.length} ahead=${status.ahead} behind=${status.behind} counts=${JSON.stringify(status.counts)}`
      : `NO STATUS (statusError=${repository.statusError ?? "none"})`;
    output.appendLine(`${indent}${repository.name} [${repository.rootPath}] -> ${statusSummary}`);
    dumpRepositoryTreeForDebug(repository.children, output, depth + 1);
  }
}

type TreeNode = RepositoryNode | ActionMenuNode | FileGroupNode | ChangedFileNode;

type ActionMenuNode = {
  readonly type: "actionMenu";
  readonly repository: RepositoryNode;
};

type FileGroupNode = {
  readonly type: "fileGroup";
  readonly repository: RepositoryNode;
  readonly kind: GitFileStatusKind;
  readonly label: string;
  readonly files: readonly GitChangedFile[];
};

type ChangedFileNode = {
  readonly type: "changedFile";
  readonly repository: RepositoryNode;
  readonly file: GitChangedFile;
};

class RepositoryTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly didChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  public readonly onDidChangeTreeData = this.didChangeTreeData.event;

  public constructor(private readonly repositoryManager: RepositoryManager) {}

  public refresh(): void {
    this.didChangeTreeData.fire(undefined);
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    if (this.isActionMenuNode(element)) {
      const item = new vscode.TreeItem("...", vscode.TreeItemCollapsibleState.None);
      item.id = `actions:${element.repository.rootPath}`;
      item.contextValue = "actionMenu";
      item.tooltip = "Repository actions";
      item.iconPath = new vscode.ThemeIcon("ellipsis");
      item.command = {
        command: "gitWorkspacePro.showRepositoryActions",
        title: "Repository Actions",
        arguments: [element]
      };
      return item;
    }

    if (this.isFileGroupNode(element)) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `group:${element.repository.rootPath}:${element.kind}`;
      item.contextValue = "fileGroup";
      item.iconPath = new vscode.ThemeIcon(this.getStatusIconId(element.kind), this.getStatusColor(element.kind));
      return item;
    }

    if (this.isChangedFileNode(element)) {
      const item = new vscode.TreeItem(element.file.path, vscode.TreeItemCollapsibleState.None);
      item.id = `file:${element.repository.rootPath}:${element.file.kind}:${element.file.path}`;
      item.description = `${element.file.indexStatus}${element.file.workTreeStatus}`;
      item.tooltip = element.file.originalPath
        ? `${element.file.originalPath} -> ${element.file.path}`
        : element.file.path;
      item.contextValue = `changedFile.${element.file.kind}`;
      item.iconPath = new vscode.ThemeIcon(
        this.getStatusIconId(element.file.kind),
        this.getStatusColor(element.file.kind)
      );
      return item;
    }

    const item = new vscode.TreeItem(
      this.getRepositoryLabel(element),
      this.getRepositoryChildren(element).length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    item.id = `repo:${element.rootPath}`;
    item.description = this.getRepositoryDescription(element);
    item.tooltip = this.getRepositoryTooltip(element);
    item.contextValue = "repository";
    item.iconPath = new vscode.ThemeIcon("repo", this.getRepositoryStateColor(element));
    return item;
  }

  private getRepositoryStateColor(repository: RepositoryNode): vscode.ThemeColor | undefined {
    const status = repository.status;
    if (!status) {
      return repository.statusError ? new vscode.ThemeColor("gitDecoration.conflictingResourceForeground") : undefined;
    }

    if (status.counts.conflicted > 0) {
      return new vscode.ThemeColor("gitDecoration.conflictingResourceForeground");
    }

    if (status.counts.staged + status.counts.unstaged + status.counts.untracked > 0) {
      return new vscode.ThemeColor("gitDecoration.modifiedResourceForeground");
    }

    if (status.ahead > 0 || status.behind > 0) {
      return new vscode.ThemeColor("gitDecoration.untrackedResourceForeground");
    }

    return undefined;
  }

  private getStatusIconId(kind: GitFileStatusKind): string {
    switch (kind) {
      case "staged":
        return "diff-added";
      case "unstaged":
        return "diff-modified";
      case "untracked":
        return "diff-ignored";
      case "conflicted":
        return "warning";
    }
  }

  private getStatusColor(kind: GitFileStatusKind): vscode.ThemeColor {
    switch (kind) {
      case "staged":
        return new vscode.ThemeColor("gitDecoration.addedResourceForeground");
      case "unstaged":
        return new vscode.ThemeColor("gitDecoration.modifiedResourceForeground");
      case "untracked":
        return new vscode.ThemeColor("gitDecoration.untrackedResourceForeground");
      case "conflicted":
        return new vscode.ThemeColor("gitDecoration.conflictingResourceForeground");
    }
  }

  public getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.repositoryManager.getRepositories().filter((repository) => this.hasChanges(repository));
    }

    if (this.isFileGroupNode(element)) {
      return element.files.map((file) => ({
        type: "changedFile",
        repository: element.repository,
        file
      }));
    }

    if (this.isChangedFileNode(element)) {
      return [];
    }

    if (this.isActionMenuNode(element)) {
      return [];
    }

    return this.getRepositoryChildren(element);
  }

  private getRepositoryLabel(repository: RepositoryNode): string {
    return repository.name;
  }

  /**
   * A short, glanceable state string shown next to the repository name, e.g.
   * "Clean", "2 staged, 1 conflict", "↑1 ↓2". This is the primary way a user
   * tells, without opening the tree, whether a repo has unstaged work,
   * uncommitted work, unpushed commits, or a conflict.
   */
  private getRepositoryDescription(repository: RepositoryNode): string {
    const status = repository.status;
    if (!status) {
      return repository.statusError ? "Status unavailable" : "Loading…";
    }

    const segments: string[] = [];
    if (status.counts.conflicted > 0) {
      segments.push(`${status.counts.conflicted} conflict${status.counts.conflicted > 1 ? "s" : ""}`);
    }
    if (status.counts.staged > 0) {
      segments.push(`${status.counts.staged} staged`);
    }
    if (status.counts.unstaged > 0) {
      segments.push(`${status.counts.unstaged} unstaged`);
    }
    if (status.counts.untracked > 0) {
      segments.push(`${status.counts.untracked} untracked`);
    }

    const syncParts: string[] = [];
    if (status.ahead > 0) {
      syncParts.push(`↑${status.ahead}`);
    }
    if (status.behind > 0) {
      syncParts.push(`↓${status.behind}`);
    }

    const workingTreeLabel = segments.length > 0 ? segments.join(", ") : "Clean";
    const branchLabel = `${status.branch}${syncParts.length > 0 ? ` ${syncParts.join(" ")}` : ""}`;

    return `${branchLabel} • ${workingTreeLabel}`;
  }

  private getRepositoryTooltip(repository: RepositoryNode): string {
    const status = repository.status;
    if (!status) {
      return repository.statusError
        ? `${repository.rootPath}\nStatus unavailable: ${repository.statusError}`
        : repository.rootPath;
    }

    const lines = [
      repository.rootPath,
      `Branch: ${status.branch}`,
      status.ahead > 0 || status.behind > 0
        ? `Sync: ${status.ahead} ahead, ${status.behind} behind`
        : "Sync: up to date",
      `Staged: ${status.counts.staged}  Unstaged: ${status.counts.unstaged}  Untracked: ${status.counts.untracked}`
    ];

    if (status.counts.conflicted > 0) {
      lines.push(`⚠ ${status.counts.conflicted} conflicting file${status.counts.conflicted > 1 ? "s" : ""}`);
    }

    return lines.join("\n");
  }

  private getRepositoryChildren(repository: RepositoryNode): TreeNode[] {
    const groups = this.getFileGroups(repository);
    const children = repository.children.filter((child) => this.hasChanges(child));
    return [...groups, ...children];
  }

  /**
   * A repository is shown in the tree only when it has something to act on:
   * working tree changes, unpushed/unpulled commits, or an unreadable status
   * (surfaced as an error rather than hidden). A repository whose own status
   * is clean is still shown if any nested child repository has changes, so
   * the tree stays navigable down to them.
   */
  private hasChanges(repository: RepositoryNode): boolean {
    const status = repository.status;
    if (!status) {
      // Either still loading or the status read failed — show it either way
      // rather than silently hiding a repository whose real state is unknown.
      return true;
    }

    if (status.files.length > 0 || status.ahead > 0 || status.behind > 0) {
      return true;
    }

    return repository.children.some((child) => this.hasChanges(child));
  }

  private getFileGroups(repository: RepositoryNode): FileGroupNode[] {
    const files = repository.status?.files ?? [];
    const groups: Array<{ kind: GitFileStatusKind; label: string }> = [
      { kind: "conflicted", label: "Conflicted" },
      { kind: "staged", label: "Staged" },
      { kind: "unstaged", label: "Unstaged" },
      { kind: "untracked", label: "Untracked" }
    ];

    return groups
      .map((group) => ({
        type: "fileGroup" as const,
        repository,
        kind: group.kind,
        label: `${group.label} (${files.filter((file) => file.kind === group.kind).length})`,
        files: files.filter((file) => file.kind === group.kind)
      }))
      .filter((group) => group.files.length > 0);
  }

  private isFileGroupNode(element: TreeNode): element is FileGroupNode {
    return "type" in element && element.type === "fileGroup";
  }

  private isChangedFileNode(element: TreeNode): element is ChangedFileNode {
    return "type" in element && element.type === "changedFile";
  }

  private isActionMenuNode(element: TreeNode): element is ActionMenuNode {
    return "type" in element && element.type === "actionMenu";
  }
}
