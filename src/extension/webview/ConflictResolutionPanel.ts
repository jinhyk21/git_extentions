import * as vscode from "vscode";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { RepositoryManager } from "../../core/repository/RepositoryManager";
import { parseConflictMarkers, type ConflictSegment } from "../../core/git/parseConflictMarkers";
import { getConflictResolutionHtml } from "./conflictResolutionTemplate";

type WebviewOutboundMessage =
  | { readonly type: "save"; readonly content: string }
  | { readonly type: "cancel" };

function isWebviewOutboundMessage(value: unknown): value is WebviewOutboundMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  if (value.type === "cancel") {
    return true;
  }

  return value.type === "save" && "content" in value && typeof value.content === "string";
}

export class ConflictResolutionPanel {
  private static readonly openPanels = new Map<string, ConflictResolutionPanel>();

  private readonly panel: vscode.WebviewPanel;
  private disposed = false;

  public static async open(
    repositoryManager: RepositoryManager,
    repositoryRootPath: string,
    filePath: string,
    onResolved: () => void
  ): Promise<void> {
    const key = `${repositoryRootPath}:${filePath}`;
    const existing = ConflictResolutionPanel.openPanels.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    const instance = new ConflictResolutionPanel(repositoryManager, repositoryRootPath, filePath, onResolved, key);
    ConflictResolutionPanel.openPanels.set(key, instance);
    await instance.render();
  }

  private constructor(
    private readonly repositoryManager: RepositoryManager,
    private readonly repositoryRootPath: string,
    private readonly filePath: string,
    private readonly onResolved: () => void,
    private readonly key: string
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "gitWorkspacePro.conflictResolution",
      `Resolve: ${filePath}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.disposed = true;
      ConflictResolutionPanel.openPanels.delete(this.key);
    });

    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (isWebviewOutboundMessage(message)) {
        void this.handleMessage(message);
      }
    });
  }

  private resolveAbsolutePath(): string {
    const absolutePath = path.resolve(this.repositoryRootPath, this.filePath);
    const rootWithSep = this.repositoryRootPath.endsWith(path.sep)
      ? this.repositoryRootPath
      : `${this.repositoryRootPath}${path.sep}`;

    if (absolutePath !== this.repositoryRootPath && !absolutePath.startsWith(rootWithSep)) {
      throw new Error(`Refusing to resolve a path outside the repository: ${this.filePath}`);
    }

    return absolutePath;
  }

  private async render(): Promise<void> {
    const absolutePath = this.resolveAbsolutePath();
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
    const content = document.getText();
    const segments = parseConflictMarkers(content);

    if (!segments.some((segment) => segment.kind === "conflict")) {
      vscode.window.showInformationMessage(`No conflict markers found in ${this.filePath}.`);
      this.panel.dispose();
      return;
    }

    this.panel.webview.html = getConflictResolutionHtml(this.panel.webview, this.filePath, segments);
  }

  private async handleMessage(message: WebviewOutboundMessage): Promise<void> {
    if (message.type === "cancel") {
      this.panel.dispose();
      return;
    }

    if (message.type === "save") {
      await this.save(message.content);
    }
  }

  private async save(content: string): Promise<void> {
    if (this.disposed) {
      return;
    }

    try {
      const absolutePath = this.resolveAbsolutePath();
      await writeFile(absolutePath, content, "utf8");
      await this.repositoryManager.markResolved(this.repositoryRootPath, this.filePath);
      vscode.window.showInformationMessage(`Resolved and staged ${this.filePath}.`);
      this.onResolved();
      this.panel.dispose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to save resolved file: ${errorMessage}`);
    }
  }
}

export type { ConflictSegment };
