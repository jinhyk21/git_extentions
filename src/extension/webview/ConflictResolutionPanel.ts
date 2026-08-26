import * as vscode from "vscode";
import path from "node:path";
import type { RepositoryManager } from "../../core/repository/RepositoryManager";
import { parseConflictMarkers, type ConflictSegment } from "../../core/git/parseConflictMarkers";
import { getActiveLanguage, t } from "../localization";
import { getConflictResolutionHtml } from "./conflictResolutionTemplate";

type WebviewOutboundMessage =
  | { readonly type: "save"; readonly content: string; readonly deleteFile: boolean }
  | { readonly type: "openNative" }
  | { readonly type: "cancel" };

function isWebviewOutboundMessage(value: unknown): value is WebviewOutboundMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  if (value.type === "cancel" || value.type === "openNative") {
    return true;
  }

  return (
    value.type === "save" &&
    "content" in value &&
    typeof value.content === "string" &&
    "deleteFile" in value &&
    typeof value.deleteFile === "boolean"
  );
}

export class ConflictResolutionPanel {
  private static readonly openPanels = new Map<string, ConflictResolutionPanel>();

  private readonly panel: vscode.WebviewPanel;
  private disposed = false;
  private saving = false;

  public static refreshOpenPanels(): void {
    for (const panel of ConflictResolutionPanel.openPanels.values()) {
      void panel.render();
    }
  }

  public static async open(
    repositoryManager: RepositoryManager,
    repositoryRootPath: string,
    filePath: string,
    onResolved: () => void | Promise<void>
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
    private readonly onResolved: () => void | Promise<void>,
    private readonly key: string
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "gitWorkspacePro.conflictResolution",
      t("Resolve: {file}", { file: filePath }),
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
    this.panel.title = t("Resolve: {file}", { file: this.filePath });
    const absolutePath = this.resolveAbsolutePath();
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
    const content = document.getText();
    const segments = parseConflictMarkers(content);
    const [base, current, incoming, baseExists, currentExists, incomingExists, operation] = await Promise.all([
      this.repositoryManager.readConflictStage(this.repositoryRootPath, this.filePath, 1),
      this.repositoryManager.readConflictStage(this.repositoryRootPath, this.filePath, 2),
      this.repositoryManager.readConflictStage(this.repositoryRootPath, this.filePath, 3),
      this.repositoryManager.hasConflictStage(this.repositoryRootPath, this.filePath, 1),
      this.repositoryManager.hasConflictStage(this.repositoryRootPath, this.filePath, 2),
      this.repositoryManager.hasConflictStage(this.repositoryRootPath, this.filePath, 3),
      this.repositoryManager.getOperationState(this.repositoryRootPath)
    ]);

    if ([base, current, incoming].some((value) => value.includes("\0"))) {
      await this.resolveBinaryConflict();
      return;
    }

    this.panel.webview.html = getConflictResolutionHtml(this.panel.webview, {
      filePath: this.filePath,
      repositoryName: path.basename(this.repositoryRootPath),
      result: content,
      base,
      current,
      incoming,
      baseExists,
      currentExists,
      incomingExists,
      segments,
      operation,
      language: getActiveLanguage()
    });
  }

  private async handleMessage(message: WebviewOutboundMessage): Promise<void> {
    if (message.type === "cancel") {
      this.panel.dispose();
      return;
    }

    if (message.type === "openNative") {
      await this.openNativeMergeEditor();
      return;
    }

    if (message.type === "save") {
      await this.save(message.content, message.deleteFile);
    }
  }

  private async save(content: string, deleteFile: boolean): Promise<void> {
    if (this.disposed || this.saving) {
      return;
    }
    this.saving = true;

    try {
      const absolutePath = this.resolveAbsolutePath();
      const uri = vscode.Uri.file(absolutePath);
      if (deleteFile) {
        try {
          await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false });
        } catch (error) {
          if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) {
            throw error;
          }
        }
      } else {
        const document = await vscode.workspace.openTextDocument(uri);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
          content
        );
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) {
          throw new Error(t("VS Code rejected the resolved-file edit."));
        }
        await document.save();
      }
      await this.repositoryManager.markResolved(this.repositoryRootPath, this.filePath);
      vscode.window.showInformationMessage(
        deleteFile
          ? t("Resolved {file} as deleted.", { file: this.filePath })
          : t("Resolved and staged {file}.", { file: this.filePath })
      );
      await this.onResolved();
      await this.offerContinueWhenReady();
      this.panel.dispose();
    } catch (error) {
      this.saving = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t("Failed to save resolved file: {message}", { message: errorMessage }));
    }
  }

  private async openNativeMergeEditor(): Promise<void> {
    const uri = vscode.Uri.file(this.resolveAbsolutePath());
    try {
      await vscode.commands.executeCommand("git.openMergeEditor", uri);
    } catch {
      await vscode.commands.executeCommand("vscode.open", uri);
      vscode.window.showInformationMessage(
        t("The native Merge Editor command was unavailable, so the conflicted file was opened normally.")
      );
    }
  }

  private async offerContinueWhenReady(): Promise<void> {
    await this.repositoryManager.refreshRepositoryStatus(this.repositoryRootPath);
    const repository = this.repositoryManager.findRepositoryForPath(this.repositoryRootPath);
    const operation = repository?.status?.operation;
    const remainingConflicts = repository?.status?.files.filter((file) => file.kind === "conflicted") ?? [];
    if (remainingConflicts.length > 0) {
      const openNext = t("Open Next Conflict");
      const answer = await vscode.window.showInformationMessage(
        t(
          remainingConflicts.length === 1
            ? "{count} conflicted file remaining."
            : "{count} conflicted files remaining.",
          { count: remainingConflicts.length }
        ),
        openNext
      );
      if (answer === openNext) {
        const nextConflict = remainingConflicts[0];
        if (nextConflict) {
          await ConflictResolutionPanel.open(
            this.repositoryManager,
            this.repositoryRootPath,
            nextConflict.path,
            this.onResolved
          );
        }
      }
      return;
    }

    if (!operation) {
      return;
    }

    const continueLabel = t("Continue");
    const notNowLabel = t("Not Now");
    const answer = await vscode.window.showInformationMessage(
      t("All conflicts are resolved. Continue {operation}?", {
        operation: formatOperation(operation.type)
      }),
      { modal: true },
      continueLabel,
      notNowLabel
    );
    if (answer !== continueLabel) {
      return;
    }

    try {
      await this.repositoryManager.continueOperation(this.repositoryRootPath, operation.type);
      await this.onResolved();
      vscode.window.showInformationMessage(
        t("{operation} continued successfully.", { operation: formatOperation(operation.type) })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        t("Continue {operation} failed: {message}", {
          operation: formatOperation(operation.type),
          message
        })
      );
      await this.onResolved();
    }
  }

  private async resolveBinaryConflict(): Promise<void> {
    const keepCurrent = t("Keep Current");
    const keepIncoming = t("Keep Incoming");
    const cancel = t("Cancel");
    const answer = await vscode.window.showWarningMessage(
      t("{file} is a binary conflict. Choose the complete version to keep.", { file: this.filePath }),
      { modal: true },
      keepCurrent,
      keepIncoming,
      cancel
    );
    if (answer !== keepCurrent && answer !== keepIncoming) {
      this.panel.dispose();
      return;
    }

    try {
      const side = answer === keepCurrent ? "current" : "incoming";
      await this.repositoryManager.resolveConflictWithSide(this.repositoryRootPath, this.filePath, side);
      await this.onResolved();
      await this.offerContinueWhenReady();
      vscode.window.showInformationMessage(
        t("Resolved binary conflict in {file}.", { file: this.filePath })
      );
      this.panel.dispose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t("Failed to resolve binary conflict: {message}", { message }));
    }
  }
}

export type { ConflictSegment };

function formatOperation(operation: string): string {
  switch (operation) {
    case "merge":
      return t("Merge");
    case "rebase":
      return t("Rebase");
    case "cherry-pick":
      return t("Cherry Pick");
    case "revert":
      return t("Revert");
    default:
      return operation;
  }
}
