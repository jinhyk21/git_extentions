import * as vscode from "vscode";
import path from "node:path";
import type { RepositoryManager } from "../../core/repository/RepositoryManager";
import type { CommitDetails } from "../../shared/types/history";
import { getActiveLanguage, t } from "../localization";
import { getCommitDetailsHtml } from "./commitDetailsTemplate";

type DetailsMessage = { readonly type: "copyHash" } | { readonly type: "openFile"; readonly index: number };

function isDetailsMessage(value: unknown): value is DetailsMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  if (value.type === "copyHash") {
    return true;
  }

  return value.type === "openFile" && "index" in value && Number.isInteger(value.index);
}

export class CommitDetailsPanel {
  private static readonly openPanels = new Map<string, CommitDetailsPanel>();

  private readonly panel: vscode.WebviewPanel;
  private details: CommitDetails | undefined;

  public static async open(
    repositoryManager: RepositoryManager,
    repositoryRootPath: string,
    repositoryName: string,
    hash: string
  ): Promise<void> {
    let details: CommitDetails;
    try {
      details = await repositoryManager.getCommitDetails(repositoryRootPath, hash);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t("Failed to load commit details: {message}", { message }));
      return;
    }

    const existing = CommitDetailsPanel.openPanels.get(repositoryRootPath);
    if (existing) {
      existing.panel.reveal();
      existing.render(repositoryName, details);
      return;
    }

    const instance = new CommitDetailsPanel(repositoryRootPath, repositoryName);
    CommitDetailsPanel.openPanels.set(repositoryRootPath, instance);
    instance.render(repositoryName, details);
  }

  private constructor(
    private readonly repositoryRootPath: string,
    repositoryName: string
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "gitWorkspacePro.commitDetails",
      t("Commit details: {repository}", { repository: repositoryName }),
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    this.panel.onDidDispose(() => CommitDetailsPanel.openPanels.delete(this.repositoryRootPath));
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (isDetailsMessage(message)) {
        void this.handleMessage(message);
      }
    });
  }

  private render(repositoryName: string, details: CommitDetails): void {
    this.details = details;
    this.panel.title = `${details.hash.slice(0, 7)} — ${repositoryName}`;
    this.panel.webview.html = getCommitDetailsHtml(this.panel.webview, repositoryName, details, getActiveLanguage());
  }

  private async handleMessage(message: DetailsMessage): Promise<void> {
    const details = this.details;
    if (!details) {
      return;
    }

    if (message.type === "copyHash") {
      await vscode.env.clipboard.writeText(details.hash);
      vscode.window.showInformationMessage(t("Commit hash copied."));
      return;
    }

    const file = details.files[message.index];
    if (!file) {
      return;
    }

    const absolutePath = path.join(this.repositoryRootPath, file.path);
    const toRefUri = (ref: string) =>
      vscode.Uri.file(absolutePath).with({ scheme: "git", query: JSON.stringify({ path: absolutePath, ref }) });
    const label = `${file.path} (${details.hash.slice(0, 7)})`;

    if (details.parentHashes.length === 0) {
      await vscode.commands.executeCommand("vscode.open", toRefUri(details.hash), { preview: false });
      return;
    }

    await vscode.commands.executeCommand("vscode.diff", toRefUri(`${details.hash}~1`), toRefUri(details.hash), label);
  }
}
