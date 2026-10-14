import * as vscode from "vscode";
import path from "node:path";
import type { RepositoryManager } from "../../core/repository/RepositoryManager";
import { buildCommitGraph } from "../../core/git/buildCommitGraph";
import { getActiveLanguage, t } from "../localization";
import { CommitDetailsPanel } from "./CommitDetailsPanel";
import { getHistoryHtml } from "./historyTemplate";

type WebviewOutboundMessage =
  | { readonly type: "openCommitDiff"; readonly hash: string; readonly hasParent: boolean }
  | { readonly type: "showCommitDetails"; readonly hash: string }
  | { readonly type: "refresh" };

function isWebviewOutboundMessage(value: unknown): value is WebviewOutboundMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  if (value.type === "refresh") {
    return true;
  }

  if (value.type === "showCommitDetails") {
    return "hash" in value && typeof value.hash === "string";
  }

  return (
    value.type === "openCommitDiff" &&
    "hash" in value &&
    typeof value.hash === "string" &&
    "hasParent" in value &&
    typeof value.hasParent === "boolean"
  );
}

export class HistoryPanel {
  private static readonly openPanels = new Map<string, HistoryPanel>();

  private readonly panel: vscode.WebviewPanel;
  private disposed = false;

  public static refreshOpenPanels(): void {
    for (const panel of HistoryPanel.openPanels.values()) {
      void panel.render();
    }
  }

  public static async open(repositoryManager: RepositoryManager, repositoryRootPath: string, repositoryName: string): Promise<void> {
    const existing = HistoryPanel.openPanels.get(repositoryRootPath);
    if (existing) {
      existing.panel.reveal();
      await existing.render();
      return;
    }

    const instance = new HistoryPanel(repositoryManager, repositoryRootPath, repositoryName);
    HistoryPanel.openPanels.set(repositoryRootPath, instance);
    await instance.render();
  }

  private constructor(
    private readonly repositoryManager: RepositoryManager,
    private readonly repositoryRootPath: string,
    private readonly repositoryName: string
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "gitWorkspacePro.history",
      t("History: {repository}", { repository: repositoryName }),
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.disposed = true;
      HistoryPanel.openPanels.delete(this.repositoryRootPath);
    });

    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (isWebviewOutboundMessage(message)) {
        void this.handleMessage(message);
      }
    });
  }

  private async render(): Promise<void> {
    if (this.disposed) {
      return;
    }

    try {
      this.panel.title = t("History: {repository}", { repository: this.repositoryName });
      const commits = await this.repositoryManager.getLog(
        this.repositoryRootPath,
        vscode.workspace.getConfiguration("gitWorkspacePro").get<number>("history.maxCount", 300)
      );
      const graph = buildCommitGraph(commits);
      this.panel.webview.html = getHistoryHtml(
        this.panel.webview,
        this.repositoryName,
        graph,
        getActiveLanguage()
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t("Failed to load history: {message}", { message }));
    }
  }

  private async handleMessage(message: WebviewOutboundMessage): Promise<void> {
    if (message.type === "refresh") {
      await this.render();
      return;
    }

    if (message.type === "showCommitDetails") {
      await CommitDetailsPanel.open(this.repositoryManager, this.repositoryRootPath, this.repositoryName, message.hash);
      return;
    }

    if (message.type === "openCommitDiff") {
      await this.openCommitDiff(message.hash, message.hasParent);
    }
  }

  private toGitRefUri(absolutePath: string, ref: string): vscode.Uri {
    return vscode.Uri.file(absolutePath).with({
      scheme: "git",
      query: JSON.stringify({ path: absolutePath, ref })
    });
  }

  private async openCommitDiff(hash: string, hasParent: boolean): Promise<void> {
    try {
      const files = await this.repositoryManager.getCommitDiffFiles(this.repositoryRootPath, hash);
      if (files.length === 0) {
        vscode.window.showInformationMessage(
          t("Commit {hash} has no file changes.", { hash: hash.slice(0, 7) })
        );
        return;
      }

      // Cap how many diff tabs a single click opens; a commit touching hundreds
      // of files would otherwise flood the editor with tabs.
      const filesToOpen = files.slice(0, 20);
      if (files.length > filesToOpen.length) {
        vscode.window.showInformationMessage(
          t("Commit {hash} changed {count} files — opening the first {limit}.", {
            hash: hash.slice(0, 7),
            count: files.length,
            limit: filesToOpen.length
          })
        );
      }

      for (const filePath of filesToOpen) {
        const absolutePath = path.join(this.repositoryRootPath, filePath);
        const label = `${filePath} (${hash.slice(0, 7)})`;

        // A root commit (no parent) has nothing to diff against — `SHA~1`
        // would fail with "unknown revision" since there is no parent to
        // resolve, and an empty ref string means HEAD, not "no content", in
        // the built-in Git extension's URI convention. Just open the
        // commit's version of the file instead of a two-way diff.
        if (!hasParent) {
          await vscode.commands.executeCommand("vscode.open", this.toGitRefUri(absolutePath, hash), {
            preview: false
          });
          continue;
        }

        await vscode.commands.executeCommand(
          "vscode.diff",
          this.toGitRefUri(absolutePath, `${hash}~1`),
          this.toGitRefUri(absolutePath, hash),
          label
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t("Failed to open commit diff: {message}", { message }));
    }
  }
}
