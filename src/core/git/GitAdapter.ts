import { ErrorCodes } from "../../shared/constants/errorCodes";
import type { GitChangedFile, GitFileStatusKind, RepositoryStatusSummary } from "../../shared/types/repository";
import { GitWorkspaceError } from "../errors/GitWorkspaceError";
import { GitProcessRunner } from "./GitProcessRunner";

export class GitAdapter {
  public constructor(private readonly runner = new GitProcessRunner()) {}

  public async isRepository(path: string): Promise<boolean> {
    const result = await this.runner.run(["rev-parse", "--is-inside-work-tree"], path, 5_000);
    return result.exitCode === 0 && result.stdout.trim() === "true";
  }

  public async getStatus(path: string): Promise<RepositoryStatusSummary> {
    const branchResult = await this.runner.run(["branch", "--show-current"], path, 5_000);
    const statusResult = await this.runner.run(["status", "--porcelain=v1"], path, 10_000);

    if (statusResult.exitCode !== 0) {
      throw new GitWorkspaceError(ErrorCodes.RepositoryNotFound, statusResult.stderr.trim() || "Repository status failed");
    }

    return this.parseStatus(branchResult.stdout.trim() || "DETACHED", statusResult.stdout);
  }

  public async stageFile(repositoryPath: string, filePath: string): Promise<void> {
    const result = await this.runner.run(["add", "--", filePath], repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      throw new GitWorkspaceError(ErrorCodes.UnknownGitError, result.stderr.trim() || "Stage file failed");
    }
  }

  public async unstageFile(repositoryPath: string, filePath: string): Promise<void> {
    const result = await this.runner.run(["restore", "--staged", "--", filePath], repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      throw new GitWorkspaceError(ErrorCodes.UnknownGitError, result.stderr.trim() || "Unstage file failed");
    }
  }

  public async stageAll(repositoryPath: string): Promise<void> {
    await this.runOrThrow(["add", "-A"], repositoryPath, "Stage all failed");
  }

  public async unstageAll(repositoryPath: string): Promise<void> {
    await this.runOrThrow(["restore", "--staged", "."], repositoryPath, "Unstage all failed");
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

  public async pull(repositoryPath: string): Promise<void> {
    await this.runOrThrow(["pull"], repositoryPath, "Pull failed", 60_000);
  }

  public async push(repositoryPath: string): Promise<string> {
    return this.runForOutputOrThrow(["push"], repositoryPath, "Push failed", 60_000);
  }

  public async listBranches(repositoryPath: string): Promise<readonly string[]> {
    const result = await this.runner.run(["branch", "--format=%(refname:short)"], repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      throw new GitWorkspaceError(ErrorCodes.UnknownGitError, result.stderr.trim() || "List branches failed");
    }

    return result.stdout.split(/\r?\n/).map((branch) => branch.trim()).filter(Boolean);
  }

  public async checkoutBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.runOrThrow(["switch", branch], repositoryPath, "Checkout branch failed");
  }

  public async createBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.runOrThrow(["switch", "-c", branch], repositoryPath, "Create branch failed");
  }

  public async mergeBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.runOrThrow(["merge", branch], repositoryPath, "Merge branch failed", 60_000);
  }

  public async rebaseBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.runOrThrow(["rebase", branch], repositoryPath, "Rebase branch failed", 60_000);
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

  private parseStatus(branch: string, output: string): RepositoryStatusSummary {
    const lines = output.split(/\r?\n/).filter(Boolean);
    const files: GitChangedFile[] = [];

    for (const line of lines) {
      const indexStatus = line[0] ?? " ";
      const workTreeStatus = line[1] ?? " ";
      const filePath = line.slice(3);

      if (line.startsWith("??")) {
        files.push(this.createChangedFile(filePath, "untracked", indexStatus, workTreeStatus));
        continue;
      }

      if (["U", "A", "D"].includes(indexStatus) && ["U", "A", "D"].includes(workTreeStatus)) {
        files.push(this.createChangedFile(filePath, "conflicted", indexStatus, workTreeStatus));
        continue;
      }

      if (indexStatus !== " ") {
        files.push(this.createChangedFile(filePath, "staged", indexStatus, workTreeStatus));
      }

      if (workTreeStatus !== " ") {
        files.push(this.createChangedFile(filePath, "unstaged", indexStatus, workTreeStatus));
      }
    }

    return {
      branch,
      files,
      counts: {
        staged: files.filter((file) => file.kind === "staged").length,
        unstaged: files.filter((file) => file.kind === "unstaged").length,
        untracked: files.filter((file) => file.kind === "untracked").length,
        conflicted: files.filter((file) => file.kind === "conflicted").length
      }
    };
  }

  private createChangedFile(
    rawPath: string,
    kind: GitFileStatusKind,
    indexStatus: string,
    workTreeStatus: string
  ): GitChangedFile {
    const renameSeparator = " -> ";
    const renameIndex = rawPath.indexOf(renameSeparator);

    if (renameIndex === -1) {
      return {
        path: rawPath,
        kind,
        indexStatus,
        workTreeStatus
      };
    }

    return {
      originalPath: rawPath.slice(0, renameIndex),
      path: rawPath.slice(renameIndex + renameSeparator.length),
      kind,
      indexStatus,
      workTreeStatus
    };
  }

  private async runOrThrow(
    args: readonly string[],
    repositoryPath: string,
    fallbackMessage: string,
    timeoutMs = 10_000
  ): Promise<void> {
    const result = await this.runner.run(args, repositoryPath, timeoutMs);
    if (result.exitCode !== 0) {
      throw new GitWorkspaceError(ErrorCodes.UnknownGitError, result.stderr.trim() || fallbackMessage);
    }
  }

  private async runForOutputOrThrow(
    args: readonly string[],
    repositoryPath: string,
    fallbackMessage: string,
    timeoutMs = 10_000
  ): Promise<string> {
    const result = await this.runner.run(args, repositoryPath, timeoutMs);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    if (result.exitCode !== 0) {
      throw new GitWorkspaceError(ErrorCodes.UnknownGitError, output.trim() || fallbackMessage);
    }

    return output;
  }
}
