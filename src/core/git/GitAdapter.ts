import type { RepositoryStatusSummary } from "../../shared/types/repository";
import { GitWorkspaceError } from "../errors/GitWorkspaceError";
import { classifyGitError } from "./classifyGitError";
import { GitProcessRunner, type GitProcessResult } from "./GitProcessRunner";
import { parseGitStatus } from "./parseGitStatus";

export class GitAdapter {
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
    const branchResult = await this.exec(["branch", "--show-current"], path, 5_000);
    const statusResult = await this.exec(["status", "--porcelain=v1", "--branch"], path, 10_000);

    if (statusResult.exitCode !== 0) {
      throw this.toGitError(statusResult.stderr, "Repository status failed");
    }

    const { hasUpstream, ...summary } = parseGitStatus(branchResult.stdout.trim() || "DETACHED", statusResult.stdout);
    if (hasUpstream) {
      return summary;
    }

    const unpushedCommits = await this.countUnpushedCommits(path);
    return { ...summary, ahead: unpushedCommits };
  }

  private async countUnpushedCommits(path: string): Promise<number> {
    const result = await this.exec(["rev-list", "--count", "HEAD"], path, 5_000);
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
    const result = await this.exec(["restore", "--staged", "--", filePath], repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      throw this.toGitError(result.stderr, "Unstage file failed");
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

  public async pullBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.runOrThrow(["pull", "origin", branch], repositoryPath, "Pull branch failed", 60_000);
  }

  public async push(repositoryPath: string): Promise<string> {
    return this.runForOutputOrThrow(["push", "-u", "origin", "HEAD"], repositoryPath, "Push failed", 60_000);
  }

  public async listBranches(repositoryPath: string): Promise<readonly string[]> {
    const result = await this.exec(["branch", "--format=%(refname:short)"], repositoryPath, 10_000);
    if (result.exitCode !== 0) {
      throw this.toGitError(result.stderr, "List branches failed");
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

  public async restoreAll(repositoryPath: string): Promise<void> {
    await this.runOrThrow(["restore", "--staged", "--worktree", "."], repositoryPath, "Restore all failed", 30_000);
    await this.runOrThrow(["clean", "-fd"], repositoryPath, "Clean untracked files failed", 30_000);
  }

  public async deleteBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.runOrThrow(["branch", "-D", branch], repositoryPath, "Delete branch failed");
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
}
