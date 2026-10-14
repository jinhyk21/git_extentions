import * as vscode from "vscode";
import type { RepositoryManager } from "../../core/repository/RepositoryManager";
import type { RepositoryNode } from "../../shared/types/repository";
import { t } from "../localization";

/**
 * Status bar entry for the repository of the active editor: branch, sync
 * counts and a warning when something needs attention. Click opens that
 * repository's quick actions.
 */
export class RepositoryStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  public constructor(private readonly repositoryManager: RepositoryManager) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    this.item.command = "gitWorkspacePro.quickActions";
    this.update();
  }

  public update(): void {
    const repository = this.currentRepository();
    const status = repository?.status;
    if (!repository || !status) {
      this.item.hide();
      return;
    }

    const sync = [status.behind > 0 ? `↓${status.behind}` : "", status.ahead > 0 ? `↑${status.ahead}` : ""]
      .filter(Boolean)
      .join(" ");
    const changes = status.counts.staged + status.counts.unstaged + status.counts.untracked;
    const conflicted = status.counts.conflicted > 0;

    this.item.text = [
      conflicted ? "$(warning)" : "$(git-branch)",
      status.branch,
      changes > 0 ? "$(circle-filled)" : "",
      sync
    ]
      .filter(Boolean)
      .join(" ");
    this.item.tooltip = [
      repository.name,
      t("Branch: {branch}", { branch: status.branch }),
      status.ahead > 0 || status.behind > 0
        ? t("Sync: {ahead} ahead, {behind} behind", { ahead: status.ahead, behind: status.behind })
        : t("Sync: up to date"),
      conflicted ? t("{count} conflicts", { count: status.counts.conflicted }) : "",
      t("Repository Actions")
    ]
      .filter(Boolean)
      .join("\n");
    this.item.backgroundColor =
      conflicted || status.operation ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    this.item.show();
  }

  public dispose(): void {
    this.item.dispose();
  }

  private currentRepository(): RepositoryNode | undefined {
    const filePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    const forActiveFile = filePath ? this.repositoryManager.findRepositoryForPath(filePath) : undefined;
    if (forActiveFile) {
      return forActiveFile;
    }

    const roots = this.repositoryManager.getRepositories();
    return roots.length === 1 ? roots[0] : undefined;
  }
}
