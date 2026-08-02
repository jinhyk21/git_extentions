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
    }),
    vscode.commands.registerCommand("gitWorkspacePro.stageAll", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Stage all", node, () =>
        repositoryManager.stageAll(node.rootPath)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.commit", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      const message = await vscode.window.showInputBox({
        title: `Commit ${node.name}`,
        prompt: "Commit message",
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim().length === 0 ? "Commit message is required" : undefined)
      });

      if (!message) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Commit", node, () =>
        repositoryManager.commit(node.rootPath, message)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.fetch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Fetch", node, () =>
        repositoryManager.fetch(node.rootPath)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.pull", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Pull", node, () =>
        repositoryManager.pull(node.rootPath)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.push", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Push", node, () =>
        repositoryManager.push(node.rootPath)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.checkoutBranch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      const branch = await pickBranch(repositoryManager, node);
      if (!branch) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Checkout branch", node, () =>
        repositoryManager.checkoutBranch(node.rootPath, branch)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.createBranch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      const branch = await vscode.window.showInputBox({
        title: `Create branch in ${node.name}`,
        prompt: "New branch name",
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim().length === 0 ? "Branch name is required" : undefined)
      });

      if (!branch) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Create branch", node, () =>
        repositoryManager.createBranch(node.rootPath, branch)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.mergeBranch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      const branch = await pickBranch(repositoryManager, node);
      if (!branch) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Merge branch", node, () =>
        repositoryManager.mergeBranch(node.rootPath, branch)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.rebaseBranch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      const branch = await pickBranch(repositoryManager, node);
      if (!branch) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Rebase branch", node, () =>
        repositoryManager.rebaseBranch(node.rootPath, branch)
      );
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

type RepositoryCommandNode = RepositoryNode;

function isRepositoryCommandNode(node: unknown): node is RepositoryCommandNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "rootPath" in node &&
    "name" in node &&
    "children" in node
  );
}

async function pickBranch(repositoryManager: RepositoryManager, repository: RepositoryCommandNode): Promise<string | undefined> {
  const branches = await repositoryManager.listBranches(repository.rootPath);
  if (branches.length === 0) {
    vscode.window.showWarningMessage(`No branches found in ${repository.name}`);
    return undefined;
  }

  return vscode.window.showQuickPick([...branches], {
    title: repository.name,
    placeHolder: "Select branch"
  });
}

async function runRepositoryOperation(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  operationName: string,
  repository: RepositoryCommandNode,
  operation: () => Promise<void>
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${operationName}: ${repository.name}`
      },
      operation
    );
    await refreshWorkspace(repositoryManager, refreshTree);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`${operationName} failed: ${message}`);
    await refreshWorkspace(repositoryManager, refreshTree);
  }
}
