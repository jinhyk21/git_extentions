import * as vscode from "vscode";
import { RepositoryManager } from "../core/repository/RepositoryManager";
import type { GitChangedFile, GitFileStatusKind, RepositoryNode } from "../shared/types/repository";
import { registerCommands } from "./commands/registerCommands";

export function activate(context: vscode.ExtensionContext): void {
  const repositoryManager = new RepositoryManager();
  const treeProvider = new RepositoryTreeProvider(repositoryManager);

  context.subscriptions.push(vscode.window.registerTreeDataProvider("gitWorkspacePro.repositories", treeProvider));
  registerCommands(context, repositoryManager, () => treeProvider.refresh());

  const refresh = () => {
    const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
    return repositoryManager.refresh(folders).then(() => treeProvider.refresh());
  };

  void refresh();

  let refreshTimer: NodeJS.Timeout | undefined;
  const scheduleRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => void refresh(), 500);
  };

  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(scheduleRefresh),
    watcher.onDidCreate(scheduleRefresh),
    watcher.onDidDelete(scheduleRefresh),
    vscode.workspace.onDidChangeWorkspaceFolders(scheduleRefresh),
    { dispose: () => refreshTimer && clearTimeout(refreshTimer) }
  );
}

export function deactivate(): void {}

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
    item.tooltip = element.rootPath;
    item.contextValue = "repository";
    item.iconPath = new vscode.ThemeIcon(
      "repo",
      (element.status?.counts.conflicted ?? 0) > 0
        ? new vscode.ThemeColor("gitDecoration.conflictingResourceForeground")
        : undefined
    );
    return item;
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

  private hasChanges(repository: RepositoryNode): boolean {
    const status = repository.status;
    if (!status) {
      return true;
    }

    if (status.files.length > 0 || status.ahead > 0 || status.behind > 0) {
      return true;
    }

    return repository.children.some((child) => this.hasChanges(child));
  }

  private getRepositoryLabel(repository: RepositoryNode): string {
    const status = repository.status;
    if (!status) {
      return repository.name;
    }

    const parts = [
      status.counts.staged > 0 ? `+${status.counts.staged}` : "",
      status.counts.unstaged > 0 ? `~${status.counts.unstaged}` : "",
      status.counts.untracked > 0 ? `?${status.counts.untracked}` : "",
      status.counts.conflicted > 0 ? `!${status.counts.conflicted}` : "",
      status.ahead > 0 ? `↑${status.ahead}` : "",
      status.behind > 0 ? `↓${status.behind}` : ""
    ].filter(Boolean);

    return parts.length > 0 ? `${repository.name} (${parts.join(" ")})` : repository.name;
  }

  private getRepositoryDescription(repository: RepositoryNode): string | undefined {
    const branch = repository.status?.branch;
    if (!this.hasNameCollision(repository)) {
      return branch;
    }

    return branch ? `${branch} • ${repository.rootPath}` : repository.rootPath;
  }

  private hasNameCollision(repository: RepositoryNode): boolean {
    const all = this.flattenRepositories(this.repositoryManager.getRepositories()).filter((candidate) =>
      this.hasChanges(candidate)
    );
    return all.filter((candidate) => candidate.name === repository.name).length > 1;
  }

  private flattenRepositories(repositories: readonly RepositoryNode[]): RepositoryNode[] {
    return repositories.flatMap((repository) => [repository, ...this.flattenRepositories(repository.children)]);
  }

  private getRepositoryChildren(repository: RepositoryNode): TreeNode[] {
    const groups = this.getFileGroups(repository);
    const children = repository.children.filter((child) => this.hasChanges(child));
    return [...groups, ...children];
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
