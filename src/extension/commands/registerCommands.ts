import * as vscode from "vscode";
import path from "node:path";
import type { RepositoryManager } from "../../core/repository/RepositoryManager";
import type { GitOperationType, PullStrategy } from "../../shared/types/repository";
import { ErrorCodes } from "../../shared/constants/errorCodes";
import { GitWorkspaceError } from "../../core/errors/GitWorkspaceError";
import { getLanguagePreference, t } from "../localization";
import { ConflictResolutionPanel } from "../webview/ConflictResolutionPanel";
import { CustomCommandPanel } from "../webview/CustomCommandPanel";
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

const runningRepositories = new Set<string>();

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
          title: t("Refreshing Git repositories")
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
        toGitRefUri(path.join(node.repository.rootPath, node.file.path), "HEAD"),
        vscode.Uri.file(path.join(node.repository.rootPath, node.file.path)),
        `${node.file.path} (${t("Working Tree")})`
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
    vscode.commands.registerCommand("gitWorkspacePro.runCustomCommand", async (node?: RepositoryCommandNode) => {
      const repository = isRepositoryCommandNode(node)
        ? node
        : await pickRepositoryForCustomCommand(repositoryManager.getRepositories());
      if (!repository) {
        return;
      }

      CustomCommandPanel.open(context, repository, () => refreshWorkspace(repositoryManager, refreshTree));
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
        const repositoryNodes = nodes.filter((entry) => entry.repository.rootPath === repository.rootPath);
        if (repositoryNodes.some((entry) => entry.file.kind === "conflicted")) {
          vscode.window.showWarningMessage(
            t("Conflicted files must be resolved with the conflict editor before they can be staged.")
          );
          return;
        }
        const filePaths = repositoryNodes.map((entry) => entry.file.path);

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

      const discardLabel = t("Discard");
      const answer = await vscode.window.showWarningMessage(
        t("Discard changes in {file}?", { file: node.file.path }),
        { modal: true },
        discardLabel
      );
      if (answer !== discardLabel) {
        return;
      }

      if (node.file.kind === "untracked") {
        await vscode.workspace.fs.delete(
          vscode.Uri.file(path.join(node.repository.rootPath, node.file.path)),
          { recursive: true, useTrash: true }
        );
      } else {
        await repositoryManager.discardFile(node.repository.rootPath, node.file.path);
      }
      await refreshWorkspace(repositoryManager, refreshTree);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.showRepositoryActions", async (node: RepositoryCommandNode | ActionMenuCommandNode) => {
      const repository =
        getRepositoryFromActionTarget(node) ?? await pickRepository(repositoryManager, t("Repository Actions"));
      if (!repository) {
        return;
      }

      const action = await pickRepositoryAction(repository);
      if (!action) {
        return;
      }

      await runRepositoryAction(context, repositoryManager, refreshTree, repository, action);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.stageAll", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, t("Stage All"), node, () =>
        repositoryManager.stageAll(node.rootPath)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.unstageAll", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, t("Unstage All"), node, () =>
        repositoryManager.unstageAll(node.rootPath)
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

      await commitRepository(repositoryManager, refreshTree, node);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.fetch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, t("Fetch"), node, () =>
        repositoryManager.fetch(node.rootPath)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.pull", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await pullRepository(repositoryManager, refreshTree, node);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.pullBranch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      const branch = await pickBranch(repositoryManager, node);
      if (!branch) {
        return;
      }

      const strategy = await pickPullStrategy(node);
      if (!strategy) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, t("Pull From Branch"), node, () =>
        repositoryManager.pullBranch(node.rootPath, branch, strategy)
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

      await runRepositoryOperation(repositoryManager, refreshTree, t("Checkout Branch"), node, () =>
        repositoryManager.checkoutBranch(node.rootPath, branch)
      );
    }),
    vscode.commands.registerCommand("gitWorkspacePro.createBranch", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      const branch = await vscode.window.showInputBox({
        title: t("Create branch in {repository}", { repository: node.name }),
        prompt: t("New branch name"),
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim().length === 0 ? t("Branch name is required") : undefined)
      });

      if (!branch) {
        return;
      }

      await runRepositoryOperation(repositoryManager, refreshTree, t("Create Branch"), node, () =>
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
    }),
    vscode.commands.registerCommand("gitWorkspacePro.stashPush", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await stashPush(repositoryManager, refreshTree, node);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.stashPop", async (node: RepositoryCommandNode) => {
      if (!isRepositoryCommandNode(node)) {
        return;
      }

      await stashPop(repositoryManager, refreshTree, node);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.continueOperation", async (node: RepositoryCommandNode) => {
      const repository = isRepositoryCommandNode(node)
        ? node
        : await pickRepository(repositoryManager, t("Continue Git Operation"), true);
      if (!repository) {
        return;
      }

      await continueOperation(repositoryManager, refreshTree, repository);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.abortOperation", async (node: RepositoryCommandNode) => {
      const repository = isRepositoryCommandNode(node)
        ? node
        : await pickRepository(repositoryManager, t("Abort Git Operation"), true);
      if (!repository) {
        return;
      }

      await abortOperation(repositoryManager, refreshTree, repository);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.skipOperation", async (node: RepositoryCommandNode) => {
      const repository = isRepositoryCommandNode(node)
        ? node
        : await pickRepository(repositoryManager, t("Skip Git Operation Step"), true);
      if (!repository) {
        return;
      }

      await skipOperation(repositoryManager, refreshTree, repository);
    }),
    vscode.commands.registerCommand("gitWorkspacePro.changeLanguage", async () => {
      const current = getLanguagePreference();
      const options = [
        { label: t("Automatic (VS Code language)"), value: "auto" as const },
        { label: t("Vietnamese"), value: "vi" as const },
        { label: t("English"), value: "en" as const },
        { label: t("Chinese (Simplified)"), value: "zh-cn" as const }
      ];
      const selected = await vscode.window.showQuickPick(options, {
        title: t("Select display language"),
        placeHolder: options.find((option) => option.value === current)?.label
      });
      if (!selected) {
        return;
      }
      await vscode.workspace
        .getConfiguration("gitWorkspacePro")
        .update("language", selected.value, vscode.ConfigurationTarget.Global);
      refreshTree();
      vscode.window.showInformationMessage(t("Language changed to {language}.", { language: selected.label }));
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
  | "continueOperation"
  | "abortOperation"
  | "skipOperation"
  | "showHistory"
  | "runCustomCommand";

type RepositoryActionOption = {
  readonly action: RepositoryAction;
  readonly label: string;
  readonly description: string;
};

async function pickBranch(repositoryManager: RepositoryManager, repository: RepositoryCommandNode): Promise<string | undefined> {
  const branches = await repositoryManager.listBranches(repository.rootPath);
  if (branches.length === 0) {
    vscode.window.showWarningMessage(t("No branches found in {repository}", { repository: repository.name }));
    return undefined;
  }

  return vscode.window.showQuickPick([...branches], {
    title: repository.name,
    placeHolder: t("Select branch")
  });
}

type BranchRef = { readonly name: string; readonly isRemote: boolean };

/** Like pickBranch, but groups local and remote-tracking branches under separators. */
async function pickBranchRef(
  repositoryManager: RepositoryManager,
  repository: RepositoryCommandNode
): Promise<BranchRef | undefined> {
  const [local, remote] = await Promise.all([
    repositoryManager.listBranches(repository.rootPath),
    repositoryManager.listRemoteBranches(repository.rootPath)
  ]);
  if (local.length === 0 && remote.length === 0) {
    vscode.window.showWarningMessage(t("No branches found in {repository}", { repository: repository.name }));
    return undefined;
  }

  type Item = vscode.QuickPickItem & { readonly ref?: BranchRef };
  const items: Item[] = [
    ...(local.length > 0
      ? [
          { label: t("Local branches"), kind: vscode.QuickPickItemKind.Separator } as Item,
          ...local.map((name): Item => ({ label: name, ref: { name, isRemote: false } }))
        ]
      : []),
    ...(remote.length > 0
      ? [
          { label: t("Remote branches"), kind: vscode.QuickPickItemKind.Separator } as Item,
          ...remote.map((name): Item => ({ label: name, ref: { name, isRemote: true } }))
        ]
      : [])
  ];

  const selected = await vscode.window.showQuickPick(items, {
    title: repository.name,
    placeHolder: t("Select branch")
  });
  return selected?.ref;
}

/**
 * Warns before checkout/merge/rebase when tracked files have uncommitted
 * changes. Returns false when the user cancels.
 */
async function confirmDirtyWorkingTree(
  repositoryManager: RepositoryManager,
  repository: RepositoryCommandNode,
  operationName: string
): Promise<boolean> {
  await repositoryManager.refreshRepositoryStatus(repository.rootPath).catch(() => undefined);
  const counts = (repositoryManager.findRepositoryForPath(repository.rootPath) ?? repository).status?.counts;
  const dirty = (counts?.staged ?? 0) + (counts?.unstaged ?? 0);
  if (dirty === 0) {
    return true;
  }

  const stashAndContinue = t("Stash & Continue");
  const continueAnyway = t("Continue Anyway");
  const answer = await vscode.window.showWarningMessage(
    t("{repository} has {count} uncommitted change(s). {operation} may fail or mix them into the result.", {
      repository: repository.name,
      count: dirty,
      operation: operationName
    }),
    { modal: true },
    stashAndContinue,
    continueAnyway
  );

  if (answer === stashAndContinue) {
    try {
      await repositoryManager.stashPush(repository.rootPath, `Auto-stash before ${operationName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t("{operation} failed: {message}", { operation: t("Stash Push"), message }));
      return false;
    }
    return true;
  }

  return answer === continueAnyway;
}

async function pickRepository(
  repositoryManager: RepositoryManager,
  title: string,
  operationOnly = false
): Promise<RepositoryCommandNode | undefined> {
  let repositories = flattenRepositories(repositoryManager.getRepositories());
  if (repositories.length === 0) {
    const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
    await repositoryManager.refresh(folders);
    repositories = flattenRepositories(repositoryManager.getRepositories());
  }

  const candidates = operationOnly
    ? repositories.filter((repository) => repository.status?.operation)
    : repositories;
  if (candidates.length === 0) {
    vscode.window.showInformationMessage(
      t(operationOnly ? "No repository has a Git operation in progress." : "No Git repositories were found.")
    );
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(
    candidates.map((repository) => ({
      label: repository.name,
      description: repository.status?.operation
        ? t("{operation} in progress", { operation: formatOperation(repository.status.operation.type) })
        : repository.status?.branch,
      detail: repository.rootPath,
      repository
    })),
    {
      title,
      placeHolder: t("Select repository")
    }
  );
  return selected?.repository;
}

function flattenRepositories(repositories: readonly RepositoryCommandNode[]): RepositoryCommandNode[] {
  return repositories.flatMap((repository) => [repository, ...flattenRepositories(repository.children)]);
}

async function runRepositoryOperation(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  operationName: string,
  repository: RepositoryCommandNode,
  operation: () => Promise<void>
): Promise<void> {
  if (runningRepositories.has(repository.rootPath)) {
    vscode.window.showWarningMessage(
      t("Another Git operation is already running in {repository}.", { repository: repository.name })
    );
    return;
  }
  runningRepositories.add(repository.rootPath);

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
    await refreshWorkspace(repositoryManager, refreshTree);
    const refreshedRepository = repositoryManager.findRepositoryForPath(repository.rootPath);
    const firstConflict = refreshedRepository?.status?.files.find((file) => file.kind === "conflicted");
    if (refreshedRepository && firstConflict) {
      const action = await vscode.window.showErrorMessage(
        t("{operation} stopped because of conflicts: {message}", { operation: operationName, message }),
        t("Resolve First Conflict")
      );
      if (action === t("Resolve First Conflict")) {
        await ConflictResolutionPanel.open(
          repositoryManager,
          refreshedRepository.rootPath,
          firstConflict.path,
          () => refreshWorkspace(repositoryManager, refreshTree)
        );
      }
      return;
    }

    vscode.window.showErrorMessage(
      error instanceof GitWorkspaceError && error.code === ErrorCodes.HookFailed
        ? t("{operation} was rejected by a Git hook: {message}", { operation: operationName, message })
        : t("{operation} failed: {message}", { operation: operationName, message })
    );
  } finally {
    runningRepositories.delete(repository.rootPath);
  }
}

async function pushRepository(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  if (runningRepositories.has(repository.rootPath)) {
    vscode.window.showWarningMessage(
      t("Another Git operation is already running in {repository}.", { repository: repository.name })
    );
    return;
  }
  runningRepositories.add(repository.rootPath);

  try {
    const remote = await pickRemote(repositoryManager, repository);
    if (!remote) {
      return;
    }

    let pushOutput = "";
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${t("Push")}: ${repository.name}`
      },
      async () => {
        pushOutput = await repositoryManager.push(repository.rootPath, remote);
      }
    );
    await refreshWorkspace(repositoryManager, refreshTree);
    await showMergeRequestLinkIfPresent(repositoryManager, repository, pushOutput, remote);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(t("{operation} failed: {message}", { operation: t("Push"), message }));
    await refreshWorkspace(repositoryManager, refreshTree);
  } finally {
    runningRepositories.delete(repository.rootPath);
  }
}

async function showMergeRequestLinkIfPresent(
  repositoryManager: RepositoryManager,
  repository: RepositoryCommandNode,
  pushOutput: string,
  remote: string
): Promise<void> {
  const mergeRequestUrl =
    findMergeRequestUrl(pushOutput) ?? (await buildFallbackCompareUrl(repositoryManager, repository, remote));

  if (!mergeRequestUrl) {
    vscode.window.showInformationMessage(t("Push completed."));
    return;
  }

  // Modal so the merge/pull request prompt stays on screen until the user
  // acts on it, instead of auto-dismissing like a regular notification toast.
  const action = await vscode.window.showInformationMessage(
    t("Push completed. A merge/pull request link is ready."),
    { modal: true },
    t("Open Merge Request")
  );

  if (action === t("Open Merge Request")) {
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
  repository: RepositoryCommandNode,
  remote: string
): Promise<string | undefined> {
  const [remoteUrl, branch] = await Promise.all([
    repositoryManager.getRemoteUrl(repository.rootPath, remote),
    repositoryManager.getCurrentBranch(repository.rootPath)
  ]);

  if (!remoteUrl || !branch) {
    return undefined;
  }

  return buildCompareUrl(remoteUrl, branch);
}

async function pickRepositoryAction(repository: RepositoryCommandNode): Promise<RepositoryAction | undefined> {
  const operationOptions: RepositoryActionOption[] = repository.status?.operation
    ? [
        {
          action: "continueOperation",
          label: `${t("Continue")} ${formatOperation(repository.status.operation.type)}`,
          description: t("Continue after all conflicts are resolved and staged")
        },
        ...(repository.status.operation.type === "merge"
          ? []
          : [{
              action: "skipOperation" as const,
              label: `${t("Skip Step")}: ${formatOperation(repository.status.operation.type)}`,
              description: t("Skip the current commit and continue")
            }]),
        {
          action: "abortOperation",
          label: `${t("Abort")} ${formatOperation(repository.status.operation.type)}`,
          description: t("Return the repository to its state before the operation")
        }
      ]
    : [];
  const options: RepositoryActionOption[] = [
    ...operationOptions,
    { action: "stageAll", label: t("Stage All"), description: t("Add all changed files to index") },
    { action: "unstageAll", label: t("Unstage All"), description: t("Remove all staged files from index") },
    {
      action: "restoreAll",
      label: t("Restore All"),
      description: t("Discard all working tree changes and remove untracked files")
    },
    { action: "commit", label: t("Commit"), description: t("Create commit for staged files") },
    { action: "fetch", label: t("Fetch"), description: t("Fetch all remotes and prune") },
    { action: "pull", label: t("Pull"), description: t("Pull current branch") },
    { action: "pullBranch", label: t("Pull From Branch"), description: t("Pull from selected branch") },
    { action: "push", label: t("Push"), description: t("Push current branch") },
    { action: "checkoutBranch", label: t("Checkout Branch"), description: t("Switch current repository branch") },
    { action: "createBranch", label: t("Create Branch"), description: t("Create and switch to new branch") },
    { action: "deleteBranch", label: t("Delete Branch"), description: t("Delete a local branch") },
    { action: "mergeBranch", label: t("Merge Branch"), description: t("Merge selected branch into current branch") },
    { action: "rebaseBranch", label: t("Rebase Onto Branch"), description: t("Rebase current branch onto selected branch") },
    { action: "stashPush", label: t("Stash Push"), description: t("Stash tracked and untracked changes") },
    { action: "stashPop", label: t("Stash Pop"), description: t("Apply latest stash and drop it") },
    { action: "showHistory", label: t("Show History"), description: t("View commit history and graph") },
    {
      action: "runCustomCommand",
      label: t("Run Command"),
      description: t("Run your own multi-line command in this repository")
    }
  ];

  const selected = await vscode.window.showQuickPick(options, {
    title: `${repository.name} — ${t("Repository Actions")}`,
    placeHolder: t("Select Git action")
  });

  return selected?.action;
}

async function runRepositoryAction(
  context: vscode.ExtensionContext,
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode,
  action: RepositoryAction
): Promise<void> {
  switch (action) {
    case "stageAll":
      await runRepositoryOperation(repositoryManager, refreshTree, t("Stage All"), repository, () =>
        repositoryManager.stageAll(repository.rootPath)
      );
      return;
    case "unstageAll":
      await runRepositoryOperation(repositoryManager, refreshTree, t("Unstage All"), repository, () =>
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
      await runRepositoryOperation(repositoryManager, refreshTree, t("Fetch"), repository, () =>
        repositoryManager.fetch(repository.rootPath)
      );
      return;
    case "pull":
      await pullRepository(repositoryManager, refreshTree, repository);
      return;
    case "pullBranch":
      await pullBranch(repositoryManager, refreshTree, repository);
      return;
    case "push":
      await pushRepository(repositoryManager, refreshTree, repository);
      return;
    case "checkoutBranch":
      await checkoutBranch(repositoryManager, refreshTree, repository);
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
    case "continueOperation":
      await continueOperation(repositoryManager, refreshTree, repository);
      return;
    case "abortOperation":
      await abortOperation(repositoryManager, refreshTree, repository);
      return;
    case "skipOperation":
      await skipOperation(repositoryManager, refreshTree, repository);
      return;
    case "showHistory":
      await HistoryPanel.open(repositoryManager, repository.rootPath, repository.name);
      return;
    case "runCustomCommand":
      CustomCommandPanel.open(context, repository, () => refreshWorkspace(repositoryManager, refreshTree));
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
  const branch = (await pickBranchRef(repositoryManager, repository))?.name;
  if (!branch) {
    return;
  }

  if (!(await confirmDirtyWorkingTree(repositoryManager, repository, t("Merge Branch")))) {
    return;
  }

  const confirmed = await confirmDestructiveAction(
    t('Merge "{branch}" into the current branch of {repository}? This may create conflicts.', {
      branch,
      repository: repository.name
    }),
    t("Merge")
  );
  if (!confirmed) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, t("Merge Branch"), repository, () =>
    repositoryManager.mergeBranch(repository.rootPath, branch)
  );
}

async function rebaseBranch(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const branch = (await pickBranchRef(repositoryManager, repository))?.name;
  if (!branch) {
    return;
  }

  if (!(await confirmDirtyWorkingTree(repositoryManager, repository, t("Rebase Onto Branch")))) {
    return;
  }

  const confirmed = await confirmDestructiveAction(
    t('Rebase the current branch of {repository} onto "{branch}"? This rewrites local history and may create conflicts.', {
      repository: repository.name,
      branch
    }),
    t("Rebase")
  );
  if (!confirmed) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, t("Rebase Onto Branch"), repository, () =>
    repositoryManager.rebaseBranch(repository.rootPath, branch)
  );
}

async function stashPop(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const confirmed = await confirmDestructiveAction(
    t("Apply and drop the latest stash in {repository}? This may create conflicts and the stash entry cannot be recovered after it is dropped.", {
      repository: repository.name
    }),
    t("Stash Pop")
  );
  if (!confirmed) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, t("Stash Pop"), repository, () =>
    repositoryManager.stashPop(repository.rootPath)
  );
}

async function commitRepository(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  let stageAllFirst = false;
  // During a merge/rebase/cherry-pick the commit may legitimately have nothing newly staged.
  if (!repository.status?.operation) {
    await repositoryManager.refreshRepositoryStatus(repository.rootPath).catch(() => undefined);
    const counts = (repositoryManager.findRepositoryForPath(repository.rootPath) ?? repository).status?.counts;
    if (counts && counts.conflicted > 0) {
      vscode.window.showWarningMessage(t("Resolve and stage every conflicted file before continuing."));
      return;
    }

    if (counts && counts.staged === 0) {
      if (counts.unstaged + counts.untracked === 0) {
        vscode.window.showInformationMessage(t("Nothing to commit in {repository}.", { repository: repository.name }));
        return;
      }

      const stageAllLabel = t("Stage All & Commit");
      const answer = await vscode.window.showWarningMessage(
        t("No files are staged in {repository}. Stage all changes and commit them?", { repository: repository.name }),
        { modal: true },
        stageAllLabel
      );
      if (answer !== stageAllLabel) {
        return;
      }
      stageAllFirst = true;
    }
  }

  const message = await vscode.window.showInputBox({
    title: t("Commit {repository}", { repository: repository.name }),
    prompt: t("Commit message"),
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? t("Commit message is required") : undefined)
  });

  if (!message) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, t("Commit"), repository, async () => {
    if (stageAllFirst) {
      await repositoryManager.stageAll(repository.rootPath);
    }
    await repositoryManager.commit(repository.rootPath, message);
  });
}

async function createBranch(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const branch = await vscode.window.showInputBox({
    title: t("Create branch in {repository}", { repository: repository.name }),
    prompt: t("New branch name"),
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? t("Branch name is required") : undefined)
  });

  if (!branch) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, t("Create Branch"), repository, () =>
    repositoryManager.createBranch(repository.rootPath, branch)
  );
}

async function checkoutBranch(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const ref = await pickBranchRef(repositoryManager, repository);
  if (!ref) {
    return;
  }

  if (!(await confirmDirtyWorkingTree(repositoryManager, repository, t("Checkout Branch")))) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, t("Checkout Branch"), repository, () =>
    ref.isRemote
      ? repositoryManager.checkoutRemoteBranch(repository.rootPath, ref.name)
      : repositoryManager.checkoutBranch(repository.rootPath, ref.name)
  );
}

async function restoreAllRepository(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const restoreAll = t("Restore All");
  const answer = await vscode.window.showWarningMessage(
    t("Discard all working tree changes and delete untracked files in {repository}?", {
      repository: repository.name
    }),
    { modal: true },
    restoreAll
  );
  if (answer !== restoreAll) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, t("Restore All"), repository, () =>
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

  const merged = await repositoryManager.isBranchMergedIntoHead(repository.rootPath, branch).catch(() => false);
  const deleteBranchLabel = merged ? t("Delete Branch") : t("Force Delete");
  const answer = await vscode.window.showWarningMessage(
    merged
      ? t('Delete branch "{branch}" in {repository}?', { branch, repository: repository.name })
      : t('Branch "{branch}" in {repository} has commits that are not merged into the current branch. Delete it anyway?', {
          branch,
          repository: repository.name
        }),
    { modal: true },
    deleteBranchLabel
  );
  if (answer !== deleteBranchLabel) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, t("Delete Branch"), repository, () =>
    repositoryManager.deleteBranch(repository.rootPath, branch, !merged)
  );
}

async function stashPush(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const message = await vscode.window.showInputBox({
    title: `${t("Stash Push")}: ${repository.name}`,
    prompt: t("Optional stash message"),
    ignoreFocusOut: true
  });

  await runRepositoryOperation(repositoryManager, refreshTree, t("Stash Push"), repository, () =>
    repositoryManager.stashPush(repository.rootPath, message)
  );
}

async function pullRepository(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const strategy = await pickPullStrategy(repository);
  if (!strategy) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, `${t("Pull")} (${formatPullStrategy(strategy)})`, repository, () =>
    repositoryManager.pull(repository.rootPath, strategy)
  );
}

async function pullBranch(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const branch = await pickBranch(repositoryManager, repository);
  if (!branch) {
    return;
  }

  const remote = await pickRemote(repositoryManager, repository);
  if (!remote) {
    return;
  }

  const strategy = await pickPullStrategy(repository);
  if (!strategy) {
    return;
  }

  await runRepositoryOperation(repositoryManager, refreshTree, `${t("Pull From Branch")} (${formatPullStrategy(strategy)})`, repository, () =>
    repositoryManager.pullBranch(repository.rootPath, branch, strategy, remote)
  );
}

async function pickPullStrategy(repository: RepositoryCommandNode): Promise<PullStrategy | undefined> {
  const configured = vscode.workspace.getConfiguration("gitWorkspacePro").get<string>("pullStrategy", "ask");
  if (configured === "ff-only" || configured === "rebase" || configured === "merge") {
    return configured;
  }

  const options: Array<{ readonly label: string; readonly description: string; readonly strategy: PullStrategy }> = [
    {
      label: t("Fast-forward only"),
      description: t("Safest: fail instead of creating a merge commit or rewriting history"),
      strategy: "ff-only"
    },
    {
      label: t("Rebase"),
      description: t("Replay local commits on top of the fetched branch"),
      strategy: "rebase"
    },
    {
      label: t("Merge"),
      description: t("Merge the fetched branch into the current branch"),
      strategy: "merge"
    }
  ];
  const selected = await vscode.window.showQuickPick(options, {
    title: `${t("Pull")} ${repository.name}`,
    placeHolder: t("Choose how divergent branches should be integrated")
  });
  return selected?.strategy;
}

async function continueOperation(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const operation = await resolveOperation(repositoryManager, repository);
  if (!operation) {
    return;
  }

  if ((repository.status?.counts.conflicted ?? 0) > 0) {
    vscode.window.showWarningMessage(t("Resolve and stage every conflicted file before continuing."));
    return;
  }

  await runRepositoryOperation(
    repositoryManager,
    refreshTree,
    `${t("Continue")} ${formatOperation(operation)}`,
    repository,
    () => repositoryManager.continueOperation(repository.rootPath, operation)
  );
}

async function abortOperation(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const operation = await resolveOperation(repositoryManager, repository);
  if (!operation) {
    return;
  }

  const confirmed = await confirmDestructiveAction(
    t("Abort the {operation} in {repository} and return to the pre-operation state?", {
      operation: formatOperation(operation),
      repository: repository.name
    }),
    `${t("Abort")} ${formatOperation(operation)}`
  );
  if (!confirmed) {
    return;
  }

  await runRepositoryOperation(
    repositoryManager,
    refreshTree,
    `${t("Abort")} ${formatOperation(operation)}`,
    repository,
    () => repositoryManager.abortOperation(repository.rootPath, operation)
  );
}

async function skipOperation(
  repositoryManager: RepositoryManager,
  refreshTree: () => void,
  repository: RepositoryCommandNode
): Promise<void> {
  const operation = await resolveOperation(repositoryManager, repository);
  if (!operation) {
    return;
  }

  if (operation === "merge") {
    vscode.window.showWarningMessage(t("A merge has no skippable commit. Continue it or abort it."));
    return;
  }

  const confirmed = await confirmDestructiveAction(
    t("Skip the current {operation} step in {repository}? The current commit's changes will not be applied.", {
      operation: formatOperation(operation),
      repository: repository.name
    }),
    t("Skip Step")
  );
  if (!confirmed) {
    return;
  }

  await runRepositoryOperation(
    repositoryManager,
    refreshTree,
    `${t("Skip Step")}: ${formatOperation(operation)}`,
    repository,
    () => repositoryManager.skipOperation(repository.rootPath, operation)
  );
}

async function resolveOperation(
  repositoryManager: RepositoryManager,
  repository: RepositoryCommandNode
): Promise<GitOperationType | undefined> {
  const operation = repository.status?.operation ?? await repositoryManager.getOperationState(repository.rootPath);
  if (!operation) {
    vscode.window.showInformationMessage(
      t("No merge, rebase, cherry-pick, or revert is in progress in {repository}.", {
        repository: repository.name
      })
    );
    return undefined;
  }
  return operation.type;
}

function formatOperation(operation: GitOperationType): string {
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

function formatPullStrategy(strategy: PullStrategy): string {
  switch (strategy) {
    case "ff-only":
      return t("Fast-forward only");
    case "rebase":
      return t("Rebase");
    case "merge":
      return t("Merge");
  }
}

function toGitRefUri(absolutePath: string, ref: string): vscode.Uri {
  return vscode.Uri.file(absolutePath).with({
    scheme: "git",
    query: JSON.stringify({ path: absolutePath, ref })
  });
}

async function pickRepositoryForCustomCommand(
  repositories: readonly RepositoryCommandNode[]
): Promise<RepositoryCommandNode | undefined> {
  const flat: RepositoryCommandNode[] = [];
  const visit = (nodes: readonly RepositoryCommandNode[]) => {
    for (const node of nodes) {
      flat.push(node);
      visit(node.children);
    }
  };
  visit(repositories);

  if (flat.length === 0) {
    vscode.window.showWarningMessage(t("No Git repositories found in the workspace."));
    return undefined;
  }

  if (flat.length === 1) {
    return flat[0];
  }

  const selected = await vscode.window.showQuickPick(
    flat.map((repository) => ({ label: repository.name, description: repository.rootPath, repository })),
    { title: t("Run Command"), placeHolder: t("Select repository") }
  );
  return selected?.repository;
}

/**
 * Picks the remote for push / pull-from-branch. The branch's own upstream
 * remote wins; otherwise a single remote is used directly and several remotes
 * are offered in a picker, so the common case never adds a prompt.
 */
async function pickRemote(
  repositoryManager: RepositoryManager,
  repository: RepositoryCommandNode
): Promise<string | undefined> {
  const remotes = await repositoryManager.listRemotes(repository.rootPath);
  if (remotes.length === 0) {
    vscode.window.showWarningMessage(t("{repository} has no remote configured.", { repository: repository.name }));
    return undefined;
  }

  const upstream = await repositoryManager.getUpstreamRemote(repository.rootPath);
  if (upstream && remotes.includes(upstream)) {
    return upstream;
  }

  if (remotes.length === 1) {
    return remotes[0];
  }

  const ordered = [...remotes].sort((left, right) => Number(right === "origin") - Number(left === "origin"));
  const selected = await vscode.window.showQuickPick(ordered, {
    title: `${repository.name} — ${t("Select remote")}`,
    placeHolder: t("Choose the remote to use")
  });
  return selected;
}
