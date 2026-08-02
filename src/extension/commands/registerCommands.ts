import * as vscode from "vscode";
import path from "node:path";
import type { RepositoryManager } from "../../core/repository/RepositoryManager";
import type { GitChangedFile, RepositoryNode } from "../../shared/types/repository";

export function registerCommands(
  context: vscode.ExtensionContext,
  repositoryManager: RepositoryManager,
  refreshTree: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gitWorkspacePro.refreshRepositories", async () => {
      const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: "Refreshing Git repositories"
        },
        async () => {
          await repositoryManager.refresh(folders);
          refreshTree();
        }
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.openChangedFile", async (node: ChangedFileCommandNode) => {
      if (!isChangedFileCommandNode(node)) {
        return;
      }

      await vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.file(path.join(node.repository.rootPath, node.file.path))
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.stageFile", async (node: ChangedFileCommandNode) => {
      if (!isChangedFileCommandNode(node)) {
        return;
      }

      await repositoryManager.stageFile(node.repository.rootPath, node.file.path);
      await refreshWorkspace(repositoryManager, refreshTree);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.unstageFile", async (node: ChangedFileCommandNode) => {
      if (!isChangedFileCommandNode(node)) {
        return;
      }

      await repositoryManager.unstageFile(node.repository.rootPath, node.file.path);
      await refreshWorkspace(repositoryManager, refreshTree);
    })
  );
}

async function refreshWorkspace(repositoryManager: RepositoryManager, refreshTree: () => void): Promise<void> {
  const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  await repositoryManager.refresh(folders);
  refreshTree();
}

type ChangedFileCommandNode = {
  readonly type: "changedFile";
  readonly repository: RepositoryNode;
  readonly file: GitChangedFile;
};

function isChangedFileCommandNode(node: unknown): node is ChangedFileCommandNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    node.type === "changedFile" &&
    "repository" in node &&
    "file" in node
  );
}
