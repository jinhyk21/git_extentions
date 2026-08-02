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
}
