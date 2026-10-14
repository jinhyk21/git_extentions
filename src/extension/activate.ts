import * as vscode from "vscode";
import { RepositoryManager } from "../core/repository/RepositoryManager";
import type {
  GitChangedFile,
  GitFileStatusKind,
  GitOperationState,
  RepositoryNode
} from "../shared/types/repository";
import { registerCommands } from "./commands/registerCommands";
import { t } from "./localization";
import { shouldShowRepository } from "./repositoryVisibility";
import { CustomCommandPanel } from "./webview/CustomCommandPanel";
import { ConflictResolutionPanel } from "./webview/ConflictResolutionPanel";
import { HistoryPanel } from "./webview/HistoryPanel";
import { SIDEBAR_VIEW_ID, SidebarProvider } from "./sidebar/SidebarProvider";
import { RepositoryStatusBar } from "./sidebar/RepositoryStatusBar";

export function activate(context: vscode.ExtensionContext): void {
  const repositoryManager = new RepositoryManager();
  const treeProvider = new RepositoryTreeProvider(repositoryManager);
  const debugOutput = vscode.window.createOutputChannel("Git Workspace Pro (Debug)");
  context.subscriptions.push(debugOutput);

  const sidebar = new SidebarProvider(context.extensionUri, repositoryManager);
  const statusBar = new RepositoryStatusBar(repositoryManager);
  const refreshViews = () => {
    treeProvider.refresh();
    sidebar.refresh();
    statusBar.update();
  };

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("gitWorkspacePro.repositories", treeProvider),
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, sidebar, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    statusBar
  );
  registerCommands(context, repositoryManager, refreshViews, { focusSidebarSearch: () => sidebar.focusSearch() });
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => statusBar.update()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("gitWorkspacePro.sidebar.showCleanRepositories")) {
        sidebar.refresh();
      }
      if (
        event.affectsConfiguration("gitWorkspacePro.scan.excludeDirectories") ||
        event.affectsConfiguration("gitWorkspacePro.scan.maxDepth")
      ) {
        applyScanOptions();
        void vscode.commands.executeCommand("gitWorkspacePro.refreshRepositories");
      }
      if (event.affectsConfiguration("gitWorkspacePro.language")) {
        treeProvider.refresh();
        sidebar.reload();
        statusBar.update();
        ConflictResolutionPanel.refreshOpenPanels();
        HistoryPanel.refreshOpenPanels();
      }
    })
  );

  const applyScanOptions = () => {
    const config = vscode.workspace.getConfiguration("gitWorkspacePro");
    repositoryManager.setScanOptions({
      excludeDirectories: config.get<string[]>("scan.excludeDirectories", []),
      maxDepth: config.get<number>("scan.maxDepth", 0)
    });
  };
  applyScanOptions();

  const rescanWorkspace = () => {
    const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
    return repositoryManager.refresh(folders).then(() => {
      dumpRepositoryTreeForDebug(repositoryManager.getRepositories(), debugOutput);
      refreshViews();
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
        void repositoryManager.refreshRepositoryStatus(repositoryRootPath).then(() => refreshViews());
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
    { dispose: () => CustomCommandPanel.disposeAll() },
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

type TreeNode = RepositoryNode | ActionMenuNode | OperationNode | FileGroupNode | ChangedFileNode;

type ActionMenuNode = {
  readonly type: "actionMenu";
  readonly repository: RepositoryNode;
};

type OperationNode = {
  readonly type: "operation";
  readonly repository: RepositoryNode;
  readonly operation: GitOperationState;
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
    if (this.isOperationNode(element)) {
      const operationName = this.formatOperation(element.operation);
      const item = new vscode.TreeItem(
        t("{operation} in progress", { operation: operationName }),
        vscode.TreeItemCollapsibleState.None
      );
      item.id = `operation:${element.repository.rootPath}:${element.operation.type}`;
      item.description = element.repository.status?.counts.conflicted
        ? t(
            element.repository.status.counts.conflicted === 1 ? "{count} conflict" : "{count} conflicts",
            { count: element.repository.status.counts.conflicted }
          )
        : t("Ready to continue");
      item.tooltip = t("Click to continue, abort, skip, or inspect this Git operation.");
      item.contextValue = `gitOperation.${element.operation.type}`;
      item.iconPath = new vscode.ThemeIcon(
        element.repository.status?.counts.conflicted ? "warning" : "debug-continue",
        new vscode.ThemeColor(
          element.repository.status?.counts.conflicted
            ? "gitDecoration.conflictingResourceForeground"
            : "gitDecoration.addedResourceForeground"
        )
      );
      item.command = {
        command: "gitWorkspacePro.showRepositoryActions",
        title: t("Git Operation Actions"),
        arguments: [element.repository]
      };
      return item;
    }

    if (this.isActionMenuNode(element)) {
      const item = new vscode.TreeItem("...", vscode.TreeItemCollapsibleState.None);
      item.id = `actions:${element.repository.rootPath}`;
      item.contextValue = "actionMenu";
      item.tooltip = t("Repository actions");
      item.iconPath = new vscode.ThemeIcon("ellipsis");
      item.command = {
        command: "gitWorkspacePro.showRepositoryActions",
        title: t("Repository Actions"),
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
      return this.repositoryManager.getRepositories().filter(shouldShowRepository);
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

    if (this.isOperationNode(element)) {
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
      return repository.statusError ? t("Status unavailable") : t("Loading…");
    }

    const segments: string[] = [];
    if (status.operation) {
      segments.push(t("{operation} in progress", { operation: this.formatOperation(status.operation) }));
    }
    if (status.counts.conflicted > 0) {
      segments.push(
        t(status.counts.conflicted === 1 ? "{count} conflict" : "{count} conflicts", {
          count: status.counts.conflicted
        })
      );
    }
    if (status.counts.staged > 0) {
      segments.push(t("{count} staged", { count: status.counts.staged }));
    }
    if (status.counts.unstaged > 0) {
      segments.push(t("{count} unstaged", { count: status.counts.unstaged }));
    }
    if (status.counts.untracked > 0) {
      segments.push(t("{count} untracked", { count: status.counts.untracked }));
    }

    const syncParts: string[] = [];
    if (status.ahead > 0) {
      syncParts.push(`↑${status.ahead}`);
    }
    if (status.behind > 0) {
      syncParts.push(`↓${status.behind}`);
    }

    const workingTreeLabel = segments.length > 0 ? segments.join(", ") : t("Clean");
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
      t("Branch: {branch}", { branch: status.branch }),
      status.ahead > 0 || status.behind > 0
        ? t("Sync: {ahead} ahead, {behind} behind", { ahead: status.ahead, behind: status.behind })
        : t("Sync: up to date"),
      t("Staged: {staged}  Unstaged: {unstaged}  Untracked: {untracked}", {
        staged: status.counts.staged,
        unstaged: status.counts.unstaged,
        untracked: status.counts.untracked
      })
    ];

    if (status.counts.conflicted > 0) {
      lines.push(`⚠ ${status.counts.conflicted} conflicting file${status.counts.conflicted > 1 ? "s" : ""}`);
    }

    return lines.join("\n");
  }

  private getRepositoryChildren(repository: RepositoryNode): TreeNode[] {
    const operationNodes: OperationNode[] = repository.status?.operation
      ? [{
          type: "operation",
          repository,
          operation: repository.status.operation
        }]
      : [];
    const groups = this.getFileGroups(repository);
    const visibleChildren = repository.children.filter(shouldShowRepository);
    return [...operationNodes, ...groups, ...visibleChildren];
  }

  private getFileGroups(repository: RepositoryNode): FileGroupNode[] {
    const files = repository.status?.files ?? [];
    const groups: Array<{ kind: GitFileStatusKind; label: string }> = [
      { kind: "conflicted", label: t("Conflicted") },
      { kind: "staged", label: t("Staged") },
      { kind: "unstaged", label: t("Unstaged") },
      { kind: "untracked", label: t("Untracked") }
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

  private isOperationNode(element: TreeNode): element is OperationNode {
    return "type" in element && element.type === "operation";
  }

  private formatOperation(operation: GitOperationState): string {
    const name = formatOperationName(operation.type);
    if (operation.currentStep && operation.totalSteps) {
      return `${name} ${operation.currentStep}/${operation.totalSteps}`;
    }
    return name;
  }
}

function formatOperationName(operation: GitOperationState["type"]): string {
  switch (operation) {
    case "merge":
      return t("Merge");
    case "rebase":
      return t("Rebase");
    case "cherry-pick":
      return t("Cherry Pick");
    case "revert":
      return t("Revert");
  }
}
