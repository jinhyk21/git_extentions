import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { RepositoryStatusSummary } from "../../shared/types/repository";
import type {
  GitOperationState,
  GitOperationType,
  PullStrategy
} from "../../shared/types/repository";
import type { CommitDetails, CommitLogEntry } from "../../shared/types/history";
import { ErrorCodes } from "../../shared/constants/errorCodes";
import { GitWorkspaceError } from "../errors/GitWorkspaceError";
import { classifyGitError } from "./classifyGitError";
import { GIT_COMMIT_DETAILS_FORMAT, parseCommitMeta, parseNumstat } from "./parseCommitDetails";
import { GIT_LOG_PRETTY, parseGitLog } from "./parseGitLog";
import { GitProcessRunner, type GitProcessResult } from "./GitProcessRunner";
import { parseGitStatus } from "./parseGitStatus";

export class GitAdapter {
  /** The git directory of a working tree never moves, so resolve it once per repository. */
  private readonly gitDirectories = new Map<string, string>();

  public constructor(private readonly runner = new GitProcessRunner()) {}

  private async exec(args: readonly string[], cwd: string, timeoutMs?: number): Promise<GitProcessResult> {
    try {
      return await this.runner.run(args, cwd, timeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitWorkspaceError(classifyGitError(message), message, error);
    }
  }

  public async isRepository(path: string): Promise<boolean> {
    const result = await this.exec(["rev-parse", "--is-inside-work-tree"], path, 5_000);
    return result.exitCode === 0 && result.stdout.trim() === "true";
  }

  public async getStatus(path: string): Promise<RepositoryStatusSummary> {
    // Independent reads run concurrently: refreshes are latency-bound, not CPU-bound.
    const [branchResult, statusResult, operation] = await Promise.all([
      this.exec(["branch", "--show-current"], path, 5_000),
      this.exec(["status", "--porcelain=v1", "-z", "--branch"], path, 10_000),
      this.getOperationState(path)
    ]);

    if (statusResult.exitCode !== 0) {
      throw this.toGitError(statusResult.stderr, "Repository status failed");
    }

    const { hasUpstream, ...summary } = parseGitStatus(branchResult.stdout.trim() || "DETACHED", statusResult.stdout);
    if (hasUpstream) {
      return operation ? { ...summary, operation } : summary;
    }

    const unpushedCommits = await this.countUnpushedCommits(path);
    return operation
      ? { ...summary, ahead: unpushedCommits, operation }
      : { ...summary, ahead: unpushedCommits };
  }

  private async countUnpushedCommits(path: string): Promise<number> {
    const result = await this.exec(["rev-list", "--count", "HEAD", "--not", "--remotes"], path, 5_000);
    if (result.exitCode !== 0) {
      return 0;
    }

    return Number.parseInt(result.stdout.trim(), 10) || 0;
  }

  public async stageFile(repositoryPath: string, filePaths: string | readonly string[]): Promise<void> {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const result = await this.exec(["add", "--", ...paths], repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      throw this.toGitError(result.stderr, "Stage file failed");
    }
  }

  public async unstageFile(repositoryPath: string, filePath: string): Promise<void> {
    const hasHead = await this.hasHead(repositoryPath);
    const args = hasHead
      ? ["restore", "--staged", "--", filePath]
      : ["rm", "--cached", "--ignore-unmatch", "--", filePath];
    const result = await this.exec(args, repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      throw this.toGitError(result.stderr, "Unstage file failed");
    }
  }

  public async stageAll(repositoryPath: string): Promise<void> {
    await this.runOrThrow(["add", "-A"], repositoryPath, "Stage all failed");
  }

  public async unstageAll(repositoryPath: string): Promise<void> {
    const hasHead = await this.hasHead(repositoryPath);
    const args = hasHead
      ? ["restore", "--staged", "."]
      : ["rm", "-r", "--cached", "--ignore-unmatch", "."];
    await this.runOrThrow(args, repositoryPath, "Unstage all failed");
  }

  public async discardFile(repositoryPath: string, filePath: string): Promise<void> {
    await this.runOrThrow(["restore", "--worktree", "--", filePath], repositoryPath, "Discard file failed");
  }

  public async commit(repositoryPath: string, message: string): Promise<void> {
    await this.runOrThrow(["commit", "-m", message], repositoryPath, "Commit failed", 30_000);
  }

  public async fetch(repositoryPath: string): Promise<void> {
    await this.runOrThrow(["fetch", "--all", "--prune"], repositoryPath, "Fetch failed", 60_000);
  }

  public async pull(repositoryPath: string, strategy: PullStrategy = "ff-only"): Promise<void> {
    await this.runOrThrow(["pull", this.pullStrategyArgument(strategy)], repositoryPath, "Pull failed", 60_000);
  }

  public async pullBranch(
    repositoryPath: string,
    branch: string,
    strategy: PullStrategy = "ff-only",
    remote = "origin"
  ): Promise<void> {
    await this.runOrThrow(
      ["pull", this.pullStrategyArgument(strategy), remote, branch],
      repositoryPath,
      "Pull branch failed",
      60_000
    );
  }

  public async push(repositoryPath: string, remote = "origin"): Promise<string> {
    return this.runForOutputOrThrow(["push", "-u", remote, "HEAD"], repositoryPath, "Push failed", 60_000);
  }

  public async listRemotes(repositoryPath: string): Promise<readonly string[]> {
    const result = await this.exec(["remote"], repositoryPath, 5_000);
    if (result.exitCode !== 0) {
      return [];
    }

    return result.stdout.split(/\r?\n/).map((remote) => remote.trim()).filter(Boolean);
  }

  /** The remote the current branch tracks, if it has an upstream configured. */
  public async getUpstreamRemote(repositoryPath: string): Promise<string | undefined> {
    const branch = await this.getCurrentBranch(repositoryPath);
    if (!branch) {
      return undefined;
    }

    const result = await this.exec(["config", "--get", `branch.${branch}.remote`], repositoryPath, 5_000);
    const remote = result.stdout.trim();
    return result.exitCode === 0 && remote.length > 0 && remote !== "." ? remote : undefined;
  }

  public async getRemoteUrl(repositoryPath: string, remoteName = "origin"): Promise<string | undefined> {
    const result = await this.exec(["remote", "get-url", remoteName], repositoryPath, 5_000);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  }

  public async getCurrentBranch(repositoryPath: string): Promise<string | undefined> {
    const result = await this.exec(["branch", "--show-current"], repositoryPath, 5_000);
    const branch = result.stdout.trim();
    return result.exitCode === 0 && branch.length > 0 ? branch : undefined;
  }

  public async listBranches(repositoryPath: string): Promise<readonly string[]> {
    const result = await this.exec(["branch", "--format=%(refname:short)"], repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      throw this.toGitError(result.stderr, "List branches failed");
    }

    return result.stdout.split(/\r?\n/).map((branch) => branch.trim()).filter(Boolean);
  }

  /** Remote-tracking branches such as "origin/feature", without the symbolic "<remote>/HEAD" entries. */
  public async listRemoteBranches(repositoryPath: string): Promise<readonly string[]> {
    const result = await this.exec(["branch", "-r", "--format=%(refname:short)"], repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      return [];
    }

    return result.stdout
      .split(/\r?\n/)
      .map((branch) => branch.trim())
      .filter((branch) => branch.length > 0 && !branch.endsWith("/HEAD") && branch.includes("/"));
  }

  /**
   * Switches to a remote-tracking branch: reuses the local branch of the same
   * name when it exists, otherwise creates one that tracks the remote branch.
   */
  public async checkoutRemoteBranch(repositoryPath: string, remoteBranch: string): Promise<void> {
    const localName = remoteBranch.slice(remoteBranch.indexOf("/") + 1);
    const localExists =
      (await this.exec(["show-ref", "--verify", "--quiet", `refs/heads/${localName}`], repositoryPath, 5_000))
        .exitCode === 0;
    await this.runOrThrow(
      localExists ? ["switch", localName] : ["switch", "--track", remoteBranch],
      repositoryPath,
      "Checkout branch failed"
    );
  }

  public async checkoutBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.runOrThrow(["switch", branch], repositoryPath, "Checkout branch failed");
  }

  public async createBranch(repositoryPath: string, branch: string): Promise<void> {
    const validation = await this.exec(["check-ref-format", "--branch", branch], repositoryPath, 5_000);
    if (validation.exitCode !== 0) {
      throw new GitWorkspaceError(ErrorCodes.UnknownGitError, `"${branch}" is not a valid branch name.`);
    }
    await this.runOrThrow(["switch", "-c", branch], repositoryPath, "Create branch failed");
  }

  public async mergeBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.runOrThrow(["merge", branch], repositoryPath, "Merge branch failed", 60_000);
  }

  public async rebaseBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.runOrThrow(["rebase", branch], repositoryPath, "Rebase branch failed", 60_000);
  }

  public async continueOperation(repositoryPath: string, operation: GitOperationType): Promise<void> {
    const args = operation === "cherry-pick"
      ? ["cherry-pick", "--continue"]
      : [operation, "--continue"];
    await this.runOrThrow(args, repositoryPath, `Continue ${operation} failed`, 60_000);
  }

  public async abortOperation(repositoryPath: string, operation: GitOperationType): Promise<void> {
    const args = operation === "cherry-pick"
      ? ["cherry-pick", "--abort"]
      : [operation, "--abort"];
    await this.runOrThrow(args, repositoryPath, `Abort ${operation} failed`, 60_000);
  }

  public async skipOperation(repositoryPath: string, operation: GitOperationType): Promise<void> {
    if (operation === "merge") {
      throw new GitWorkspaceError(ErrorCodes.UnknownGitError, "Merge operations cannot skip a commit.");
    }

    const args = operation === "cherry-pick"
      ? ["cherry-pick", "--skip"]
      : [operation, "--skip"];
    await this.runOrThrow(args, repositoryPath, `Skip ${operation} failed`, 60_000);
  }

  public async stashPush(repositoryPath: string, message?: string): Promise<void> {
    const args = message && message.trim().length > 0
      ? ["stash", "push", "-u", "-m", message]
      : ["stash", "push", "-u"];
    await this.runOrThrow(args, repositoryPath, "Stash push failed", 30_000);
  }

  public async stashPop(repositoryPath: string): Promise<void> {
    await this.runOrThrow(["stash", "pop"], repositoryPath, "Stash pop failed", 30_000);
  }

  public async restoreAll(repositoryPath: string): Promise<void> {
    await this.runOrThrow(["restore", "--staged", "--worktree", "."], repositoryPath, "Restore all failed", 30_000);
    await this.runOrThrow(["clean", "-fd"], repositoryPath, "Clean untracked files failed", 30_000);
  }

  public async deleteBranch(repositoryPath: string, branch: string, force = true): Promise<void> {
    await this.runOrThrow(["branch", force ? "-D" : "-d", "--", branch], repositoryPath, "Delete branch failed");
  }

  public async isBranchMergedIntoHead(repositoryPath: string, branch: string): Promise<boolean> {
    const result = await this.exec(["merge-base", "--is-ancestor", branch, "HEAD"], repositoryPath, 10_000);
    return result.exitCode === 0;
  }

  public async readConflictStage(repositoryPath: string, filePath: string, stage: 1 | 2 | 3): Promise<string> {
    const result = await this.exec(["show", `:${stage}:${filePath}`], repositoryPath, 10_000);
    return result.exitCode === 0 ? result.stdout : "";
  }

  public async hasConflictStage(repositoryPath: string, filePath: string, stage: 1 | 2 | 3): Promise<boolean> {
    const result = await this.exec(["ls-files", "--unmerged", "-z", "--", filePath], repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      return false;
    }

    return result.stdout
      .split("\0")
      .filter(Boolean)
      .some((record) => {
        const metadata = record.slice(0, record.indexOf("\t"));
        return metadata.endsWith(` ${stage}`);
      });
  }

  public async markResolved(repositoryPath: string, filePath: string): Promise<void> {
    await this.runOrThrow(["add", "--", filePath], repositoryPath, "Mark resolved failed");
  }

  public async resolveConflictWithSide(
    repositoryPath: string,
    filePath: string,
    side: "current" | "incoming"
  ): Promise<void> {
    const stage = side === "current" ? 2 : 3;
    if (await this.hasConflictStage(repositoryPath, filePath, stage)) {
      await this.runOrThrow(
        ["checkout", side === "current" ? "--ours" : "--theirs", "--", filePath],
        repositoryPath,
        `Keep ${side} version failed`
      );
      await this.markResolved(repositoryPath, filePath);
      return;
    }

    await this.runOrThrow(
      ["rm", "--ignore-unmatch", "--", filePath],
      repositoryPath,
      `Resolve ${side} deletion failed`
    );
  }

  public async getLog(repositoryPath: string, maxCount = 300): Promise<readonly CommitLogEntry[]> {
    const result = await this.exec(
      ["log", "--all", "--date-order", `--max-count=${maxCount}`, GIT_LOG_PRETTY],
      repositoryPath,
      20_000
    );

    if (result.exitCode !== 0) {
      // An empty repository (no commits yet) is not an error condition.
      if (/does not have any commits yet|unknown revision/i.test(result.stderr)) {
        return [];
      }
      throw this.toGitError(result.stderr, "Read commit history failed");
    }

    return parseGitLog(result.stdout);
  }

  public async getCommitDiffFiles(repositoryPath: string, commitHash: string): Promise<readonly string[]> {
    // Diff against the first parent so merge commits show what the merge brought in.
    // A root commit has no parent, so fall back to diff-tree --root.
    const hasParent = (await this.exec(["rev-parse", "--verify", "--quiet", `${commitHash}^1`], repositoryPath, 5_000))
      .exitCode === 0;
    const args = hasParent
      ? ["diff", "--name-only", "-z", `${commitHash}^1`, commitHash]
      : ["diff-tree", "--no-commit-id", "--name-only", "-z", "-r", "--root", commitHash];
    const result = await this.exec(args, repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      throw this.toGitError(result.stderr, "Read commit files failed");
    }

    return result.stdout.split("\0").filter(Boolean);
  }

  public async getCommitDetails(repositoryPath: string, commitHash: string): Promise<CommitDetails> {
    const meta = await this.exec(["show", "-s", GIT_COMMIT_DETAILS_FORMAT, commitHash], repositoryPath, 10_000);
    if (meta.exitCode !== 0) {
      throw this.toGitError(meta.stderr, "Read commit details failed");
    }

    const parsed = parseCommitMeta(meta.stdout);
    const base = parsed.parentHashes[0];
    const stat = await this.exec(
      base
        ? ["-c", "core.quotePath=false", "diff", "--numstat", "--no-renames", base, commitHash]
        : ["-c", "core.quotePath=false", "diff-tree", "--numstat", "--no-renames", "--root", "-r", "--no-commit-id", commitHash],
      repositoryPath,
      15_000
    );

    return { ...parsed, files: stat.exitCode === 0 ? parseNumstat(stat.stdout) : [] };
  }

  public async getOperationState(repositoryPath: string): Promise<GitOperationState | undefined> {
    let gitDirectory = this.gitDirectories.get(repositoryPath);
    if (!gitDirectory) {
      const gitDirectoryResult = await this.exec(["rev-parse", "--absolute-git-dir"], repositoryPath, 5_000);
      if (gitDirectoryResult.exitCode !== 0) {
        return undefined;
      }

      gitDirectory = gitDirectoryResult.stdout.trim();
      this.gitDirectories.set(repositoryPath, gitDirectory);
    }

    const rebaseMergeDirectory = path.join(gitDirectory, "rebase-merge");
    const rebaseApplyDirectory = path.join(gitDirectory, "rebase-apply");

    if (await this.pathExists(rebaseMergeDirectory)) {
      return this.readRebaseState(rebaseMergeDirectory);
    }

    if (await this.pathExists(rebaseApplyDirectory)) {
      return this.readRebaseState(rebaseApplyDirectory);
    }

    const operationFiles: readonly [string, GitOperationType][] = [
      ["MERGE_HEAD", "merge"],
      ["CHERRY_PICK_HEAD", "cherry-pick"],
      ["REVERT_HEAD", "revert"]
    ];

    for (const [fileName, type] of operationFiles) {
      const operationPath = path.join(gitDirectory, fileName);
      if (await this.pathExists(operationPath)) {
        return {
          type,
          target: await this.readTrimmedFile(operationPath)
        };
      }
    }

    return undefined;
  }

  private async runOrThrow(
    args: readonly string[],
    repositoryPath: string,
    fallbackMessage: string,
    timeoutMs = 10_000
  ): Promise<void> {
    const result = await this.exec(args, repositoryPath, timeoutMs);
    if (result.exitCode !== 0) {
      throw this.toGitError(result.stderr, fallbackMessage);
    }
  }

  private async runForOutputOrThrow(
    args: readonly string[],
    repositoryPath: string,
    fallbackMessage: string,
    timeoutMs = 10_000
  ): Promise<string> {
    const result = await this.exec(args, repositoryPath, timeoutMs);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    if (result.exitCode !== 0) {
      throw this.toGitError(result.stderr || output, fallbackMessage);
    }

    return output;
  }

  private toGitError(stderr: string, fallbackMessage: string): GitWorkspaceError {
    const message = stderr.trim() || fallbackMessage;
    return new GitWorkspaceError(classifyGitError(message), message);
  }

  private async hasHead(repositoryPath: string): Promise<boolean> {
    const result = await this.exec(["rev-parse", "--verify", "HEAD"], repositoryPath, 5_000);
    return result.exitCode === 0;
  }

  private pullStrategyArgument(strategy: PullStrategy): string {
    switch (strategy) {
      case "ff-only":
        return "--ff-only";
      case "rebase":
        return "--rebase";
      case "merge":
        return "--no-rebase";
    }
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private async readTrimmedFile(targetPath: string): Promise<string | undefined> {
    try {
      const content = (await readFile(targetPath, "utf8")).trim();
      return content.length > 0 ? content : undefined;
    } catch {
      return undefined;
    }
  }

  private async readRebaseState(rebaseDirectory: string): Promise<GitOperationState> {
    const [target, msgnum, end, next, last] = await Promise.all([
      this.readTrimmedFile(path.join(rebaseDirectory, "onto")),
      this.readTrimmedFile(path.join(rebaseDirectory, "msgnum")),
      this.readTrimmedFile(path.join(rebaseDirectory, "end")),
      this.readTrimmedFile(path.join(rebaseDirectory, "next")),
      this.readTrimmedFile(path.join(rebaseDirectory, "last"))
    ]);
    const currentStepValue = msgnum ?? next;
    const totalStepsValue = end ?? last;
    const currentStep = currentStepValue ? Number.parseInt(currentStepValue, 10) : undefined;
    const totalSteps = totalStepsValue ? Number.parseInt(totalStepsValue, 10) : undefined;

    return {
      type: "rebase",
      target,
      ...(Number.isFinite(currentStep) ? { currentStep } : {}),
      ...(Number.isFinite(totalSteps) ? { totalSteps } : {})
    };
  }
}
