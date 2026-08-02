import * as vscode from "vscode";
import { RepositoryManager } from "../core/repository/RepositoryManager";
import type { GitChangedFile, GitFileStatusKind, RepositoryNode } from "../shared/types/repository";
import { registerCommands } from "./commands/registerCommands";

export function activate(context: vscode.ExtensionContext): void {
  const repositoryManager = new RepositoryManager();
  const treeProvider = new RepositoryTreeProvider(repositoryManager);

  context.subscriptions.push(vscode.window.registerTreeDataProvider("gitWorkspacePro.repositories", treeProvider));
  registerCommands(context, repositoryManager, () => treeProvider.refresh());

  const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  void repositoryManager.refresh(folders).then(() => treeProvider.refresh());
}

export function deactivate(): void {}

type TreeNode = RepositoryNode | FileGroupNode | ChangedFileNode;

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
    if (this.isFileGroupNode(element)) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = "fileGroup";
      return item;
    }

    if (this.isChangedFileNode(element)) {
      const item = new vscode.TreeItem(element.file.path, vscode.TreeItemCollapsibleState.None);
      item.description = `${element.file.indexStatus}${element.file.workTreeStatus}`;
      item.tooltip = element.file.originalPath
        ? `${element.file.originalPath} -> ${element.file.path}`
        : element.file.path;
      item.contextValue = `changedFile.${element.file.kind}`;
      return item;
    }

    const item = new vscode.TreeItem(
      this.getRepositoryLabel(element),
      this.getRepositoryChildren(element).length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    item.description = element.status?.branch;
    item.tooltip = element.rootPath;
    item.contextValue = "repository";
    return item;
  }

  public getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return [...this.repositoryManager.getRepositories()];
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

    return this.getRepositoryChildren(element);
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
      status.counts.conflicted > 0 ? `!${status.counts.conflicted}` : ""
    ].filter(Boolean);

    return parts.length > 0 ? `${repository.name} (${parts.join(" ")})` : repository.name;
  }

  private getRepositoryChildren(repository: RepositoryNode): TreeNode[] {
    const groups = this.getFileGroups(repository);
    return [...groups, ...repository.children];
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
}
