import * as vscode from "vscode";
import path from "node:path";
import type { RepositoryManager } from "../../core/repository/RepositoryManager";
import { ConflictResolutionPanel } from "../webview/ConflictResolutionPanel";
import { HistoryPanel } from "../webview/HistoryPanel";
import { buildCompareUrl } from "./buildCompareUrl";
import {
  findMergeRequestUrl,
  getRepositoryFromActionTarget,
  isChangedFileCommandNode,
  isRepositoryCommandNode,
  type ActionMenuCommandNode,
  type ChangedFileCommandNode,
  type RepositoryCommandNode
} from "./commandGuards";

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
    vscode.commands.registerCommand("gitWorkspacePro.openDiff", async (node: ChangedFileCommandNode) => {
      if (!isChangedFileCommandNode(node)) {
        return;
      }

      await vscode.commands.executeCommand(
        "vscode.diff",
        vscode.Uri.parse(`git:${path.join(node.repository.rootPath, node.file.path)}?HEAD`),
        vscode.Uri.file(path.join(node.repository.rootPath, node.file.path)),
        `${node.file.path} (Working Tree)`
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.resolveConflict", async (node: ChangedFileCommandNode) => {
      if (!isChangedFileCommandNode(node)) {
        return;
      }

      await ConflictResolutionPanel.open(repositoryManager, node.repository.rootPath, node.file.path, () =>
        refreshWorkspace(repositoryManager, refreshTree)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.showHistory", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await HistoryPanel.open(repositoryManager, node.rootPath, node.name);
    }),
    vscode.commands.registerCommand(
      "gitWorkspacePro.stageFile",
      async (node: ChangedFileCommandNode, selectedNodes?: ChangedFileCommandNode[]) => {
        const nodes = (selectedNodes ?? [node]).filter(isChangedFileCommandNode);
        const first = nodes[0];
        if (!first) {
          return;
        }

        const repository = first.repository;
        const filePaths = nodes.filter((entry) => entry.repository.rootPath === repository.rootPath).map((entry) => entry.file.path);

        await repositoryManager.stageFile(repository.rootPath, filePaths);
        await refreshWorkspace(repositoryManager, refreshTree);
      }
    ),
    vscode.commands.registerCommand("gitWorkspacePro.unstageFile", async (node: ChangedFileCommandNode) => {
      if (!isChangedFileCommandNode(node)) {
        return;
      }

      await repositoryManager.unstageFile(node.repository.rootPath, node.file.path);
      await refreshWorkspace(repositoryManager, refreshTree);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.discardFile", async (node: ChangedFileCommandNode) => {
      if (!isChangedFileCommandNode(node)) {
        return;
      }

      const answer = await vscode.window.showWarningMessage(
        `Discard changes in ${node.file.path}?`,
        { modal: true },
        "Discard"
      );
      if (answer !== "Discard") {
        return;
      }

      await repositoryManager.discardFile(node.repository.rootPath, node.file.path);
      await refreshWorkspace(repositoryManager, refreshTree);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.showRepositoryActions", async (node: RepositoryCommandNode | ActionMenuCommandNode) => {
      const repository = getRepositoryFromActionTarget(node);
      if (!repository) {
        return;
      }

      const action = await pickRepositoryAction(repository);
      if (!action) {
        return;
      }

      await runRepositoryAction(repositoryManager, refreshTree, repository, action);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.stageAll", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Stage all", node, () =>
        repositoryManager.stageAll(node.rootPath)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.restoreAll", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await restoreAllRepository(repositoryManager, refreshTree, node);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.deleteBranch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await deleteBranch(repositoryManager, refreshTree, node);
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
    vscode.commands.registerCommand("gitWorkspacePro.pullBranch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      const branch = await pickBranch(repositoryManager, node);
      if (!branch) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, "Pull branch", node, () =>
        repositoryManager.pullBranch(node.rootPath, branch)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.push", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await pushRepository(repositoryManager, refreshTree, node);
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

      await mergeBranch(repositoryManager, refreshTree, node);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.rebaseBranch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await rebaseBranch(repositoryManager, refreshTree, node);
    })
  );
}

async function refreshWorkspace(repositoryManager: RepositoryManager, refreshTree: () => void): Promise<void> {
  const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  await repositoryManager.refresh(folders);
  refreshTree();
}

type RepositoryAction =
  | "stageAll"
  | "unstageAll"
  | "restoreAll"
  | "commit"
  | "fetch"
  | "pull"
  | "pullBranch"
  | "push"
  | "checkoutBranch"
  | "createBranch"
  | "deleteBranch"
  | "mergeBranch"
  | "rebaseBranch"
  | "stashPush"
  | "stashPop"
  | "showHistory";

type RepositoryActionOption = {
  readonly action: RepositoryAction;
  readonly label: string;
  readonly description: string;
};

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

async function pushRepository(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  try {
    let pushOutput = "";
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Push: ${repository.name}`
      },
      async () => {
        pushOutput = await repositoryManager.push(repository.rootPath);
      }
    );
    await refreshWorkspace(repositoryManager, refreshTree);
    await showMergeRequestLinkIfPresent(repositoryManager, repository, pushOutput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Push failed: ${message}`);
    await refreshWorkspace(repositoryManager, refreshTree);
  }
}

async function showMergeRequestLinkIfPresent(
  repositoryManager: RepositoryManager,
  repository: RepositoryCommandNode,
  pushOutput: string
): Promise<void> {
  const mergeRequestUrl =
    findMergeRequestUrl(pushOutput) ?? (await buildFallbackCompareUrl(repositoryManager, repository));

  if (!mergeRequestUrl) {
    vscode.window.showInformationMessage("Push completed.");
    return;
  }

  // Modal so the merge/pull request prompt stays on screen until the user
  // acts on it, instead of auto-dismissing like a regular notification toast.
  const action = await vscode.window.showInformationMessage(
    "Push completed. A merge/pull request link is ready.",
    { modal: true },
    "Open Merge Request"
  );

  if (action === "Open Merge Request") {
    await vscode.env.openExternal(vscode.Uri.parse(mergeRequestUrl));
  }
}

/**
 * When pushing to a branch that already exists on the remote, GitHub/GitLab
 * print no "create a pull/merge request" hint in the push output — that
 * hint only appears for a brand-new branch. This builds the same
 * compare/merge-request URL directly from the remote + branch name instead,
 * so the "Open Merge Request" prompt is offered consistently either way.
 */
async function buildFallbackCompareUrl(
  repositoryManager: RepositoryManager,
  repository: RepositoryCommandNode
): Promise<string | undefined> {
  const [remoteUrl, branch] = await Promise.all([
    repositoryManager.getRemoteUrl(repository.rootPath),
    repositoryManager.getCurrentBranch(repository.rootPath)
  ]);

  if (!remoteUrl || !branch) {
    return undefined;
  }

  return buildCompareUrl(remoteUrl, branch);
}

async function pickRepositoryAction(repository: RepositoryCommandNode): Promise<RepositoryAction | undefined> {
  const options: RepositoryActionOption[] = [
    { action: "stageAll", label: "Stage All", description: "Add all changed files to index" },
    { action: "unstageAll", label: "Unstage All", description: "Remove all staged files from index" },
    {
      action: "restoreAll",
      label: "Restore All",
      description: "Discard all working tree changes and remove untracked files"
    },
    { action: "commit", label: "Commit", description: "Create commit for staged files" },
    { action: "fetch", label: "Fetch", description: "Fetch all remotes and prune" },
    { action: "pull", label: "Pull", description: "Pull current branch" },
    { action: "pullBranch", label: "Pull From Branch", description: "Pull from selected branch" },
    { action: "push", label: "Push", description: "Push current branch" },
    { action: "checkoutBranch", label: "Checkout Branch", description: "Switch current repository branch" },
    { action: "createBranch", label: "Create Branch", description: "Create and switch to new branch" },
    { action: "deleteBranch", label: "Delete Branch", description: "Delete a local branch" },
    { action: "mergeBranch", label: "Merge Branch", description: "Merge selected branch into current branch" },
    { action: "rebaseBranch", label: "Rebase Onto Branch", description: "Rebase current branch onto selected branch" },
    { action: "stashPush", label: "Stash Push", description: "Stash tracked and untracked changes" },
    { action: "stashPop", label: "Stash Pop", description: "Apply latest stash and drop it" },
    { action: "showHistory", label: "Show History", description: "View commit history and graph" }
  ];

  const selected = await vscode.window.showQuickPick(options, {
    title: `${repository.name} Actions`,
    placeHolder: "Select Git action"
  });

  return selected?.action;
}

async function runRepositoryAction(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode,
  action: RepositoryAction
): Promise<void> {
  switch (action) {
    case "stageAll":
      await runRepositoryOperation(repositoryManager, refreshTree, "Stage all", repository, () =>
        repositoryManager.stageAll(repository.rootPath)
      );
      return;
    case "unstageAll":
      await runRepositoryOperation(repositoryManager, refreshTree, "Unstage all", repository, () =>
        repositoryManager.unstageAll(repository.rootPath)
      );
      return;
    case "restoreAll":
      await restoreAllRepository(repositoryManager, refreshTree, repository);
      return;
    case "commit":
      await commitRepository(repositoryManager, refreshTree, repository);
      return;
    case "fetch":
      await runRepositoryOperation(repositoryManager, refreshTree, "Fetch", repository, () =>
        repositoryManager.fetch(repository.rootPath)
      );
      return;
    case "pull":
      await runRepositoryOperation(repositoryManager, refreshTree, "Pull", repository, () =>
        repositoryManager.pull(repository.rootPath)
      );
      return;
    case "pullBranch":
      await runBranchOperation(repositoryManager, refreshTree, repository, "Pull branch", (branch) =>
        repositoryManager.pullBranch(repository.rootPath, branch)
      );
      return;
    case "push":
      await pushRepository(repositoryManager, refreshTree, repository);
      return;
    case "checkoutBranch":
      await runBranchOperation(repositoryManager, refreshTree, repository, "Checkout branch", (branch) =>
        repositoryManager.checkoutBranch(repository.rootPath, branch)
      );
      return;
    case "createBranch":
      await createBranch(repositoryManager, refreshTree, repository);
      return;
    case "deleteBranch":
      await deleteBranch(repositoryManager, refreshTree, repository);
      return;
    case "mergeBranch":
      await mergeBranch(repositoryManager, refreshTree, repository);
      return;
    case "rebaseBranch":
      await rebaseBranch(repositoryManager, refreshTree, repository);
      return;
    case "stashPush":
      await stashPush(repositoryManager, refreshTree, repository);
      return;
    case "stashPop":
      await stashPop(repositoryManager, refreshTree, repository);
      return;
    case "showHistory":
      await HistoryPanel.open(repositoryManager, repository.rootPath, repository.name);
      return;
  }
}

async function confirmDestructiveAction(message: string, confirmLabel: string): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(message, { modal: true }, confirmLabel);
  return answer === confirmLabel;
}

async function mergeBranch(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const branch = await pickBranch(repositoryManager, repository);
  if (!branch) {
    return;
  }

  const confirmed = await confirmDestructiveAction(
    `Merge "${branch}" into the current branch of ${repository.name}? This may create conflicts.`,
    "Merge"
  );
  if (!confirmed) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, "Merge branch", repository, () =>
    repositoryManager.mergeBranch(repository.rootPath, branch)
  );
}

async function rebaseBranch(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const branch = await pickBranch(repositoryManager, repository);
  if (!branch) {
    return;
  }

  const confirmed = await confirmDestructiveAction(
    `Rebase the current branch of ${repository.name} onto "${branch}"? This rewrites local history and may create conflicts.`,
    "Rebase"
  );
  if (!confirmed) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, "Rebase branch", repository, () =>
    repositoryManager.rebaseBranch(repository.rootPath, branch)
  );
}

async function stashPop(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const confirmed = await confirmDestructiveAction(
    `Apply and drop the latest stash in ${repository.name}? This may create conflicts and the stash entry cannot be recovered after it is dropped.`,
    "Stash Pop"
  );
  if (!confirmed) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, "Stash pop", repository, () =>
    repositoryManager.stashPop(repository.rootPath)
  );
}

async function commitRepository(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const message = await vscode.window.showInputBox({
    title: `Commit ${repository.name}`,
    prompt: "Commit message",
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? "Commit message is required" : undefined)
  });

  if (!message) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, "Commit", repository, () =>
    repositoryManager.commit(repository.rootPath, message)
  );
}

async function createBranch(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const branch = await vscode.window.showInputBox({
    title: `Create branch in ${repository.name}`,
    prompt: "New branch name",
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? "Branch name is required" : undefined)
  });

  if (!branch) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, "Create branch", repository, () =>
    repositoryManager.createBranch(repository.rootPath, branch)
  );
}

async function runBranchOperation(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode,
  operationName: string,
  operation: (branch: string) => Promise<void>
): Promise<void> {
  const branch = await pickBranch(repositoryManager, repository);
  if (!branch) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, operationName, repository, () => operation(branch));
}

async function restoreAllRepository(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const answer = await vscode.window.showWarningMessage(
    `Discard all working tree changes and delete untracked files in ${repository.name}?`,
    { modal: true },
    "Restore All"
  );
  if (answer !== "Restore All") {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, "Restore all", repository, () =>
    repositoryManager.restoreAll(repository.rootPath)
  );
}

async function deleteBranch(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const branch = await pickBranch(repositoryManager, repository);
  if (!branch) {
    return;
  }

  const answer = await vscode.window.showWarningMessage(
    `Delete branch "${branch}" in ${repository.name}?`,
    { modal: true },
    "Delete Branch"
  );
  if (answer !== "Delete Branch") {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, "Delete branch", repository, () =>
    repositoryManager.deleteBranch(repository.rootPath, branch)
  );
}

async function stashPush(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const message = await vscode.window.showInputBox({
    title: `Stash ${repository.name}`,
    prompt: "Optional stash message",
    ignoreFocusOut: true
  });

  await runRepositoryOperation(repositoryManager, refreshTree, "Stash push", repository, () =>
    repositoryManager.stashPush(repository.rootPath, message)
  );
}
