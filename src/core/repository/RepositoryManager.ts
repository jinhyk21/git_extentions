import path from "node:path";
import type { RepositoryNode } from "../../shared/types/repository";
import type { CommitLogEntry } from "../../shared/types/history";
import { GitAdapter } from "../git/GitAdapter";
import { RepositoryScanner } from "./RepositoryScanner";

export class RepositoryManager {
  private repositories: readonly RepositoryNode[] = [];

  public constructor(
    private readonly scanner = new RepositoryScanner(),
    private readonly gitAdapter = new GitAdapter()
  ) {}

  public async refresh(workspaceFolders: readonly string[]): Promise<readonly RepositoryNode[]> {
    const repositories = await this.scanner.scan(workspaceFolders);
    this.repositories = await Promise.all(repositories.map((repository) => this.loadStatusRecursive(repository)));
    return this.repositories;
  }

  /**
   * Refreshes the git status of a single repository (by root path) in place,
   * without re-scanning the filesystem for the whole workspace. Use this for
   * frequent, file-change-triggered updates so editing one repo never forces
   * a full multi-repo rescan.
   */
  public async refreshRepositoryStatus(repositoryPath: string): Promise<void> {
    let status: RepositoryNode["status"];
    let statusError: string | undefined;

    try {
      status = await this.gitAdapter.getStatus(repositoryPath);
    } catch (error) {
      statusError = error instanceof Error ? error.message : String(error);
    }

    this.repositories = this.repositories.map((repository) =>
      this.applyStatus(repository, repositoryPath, status, statusError)
    );
  }

  private applyStatus(
    repository: RepositoryNode,
    targetPath: string,
    status: RepositoryNode["status"],
    statusError: string | undefined
  ): RepositoryNode {
    if (repository.rootPath === targetPath) {
      return { ...repository, status, statusError };
    }

    if (repository.children.length === 0) {
      return repository;
    }

    return {
      ...repository,
      children: repository.children.map((child) => this.applyStatus(child, targetPath, status, statusError))
    };
  }

  public findRepositoryForPath(filePath: string): RepositoryNode | undefined {
    const candidates = this.flatten(this.repositories).filter(
      (repository) => filePath === repository.rootPath || filePath.startsWith(`${repository.rootPath}${path.sep}`)
    );

    return candidates.sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
  }

  private flatten(repositories: readonly RepositoryNode[]): RepositoryNode[] {
    return repositories.flatMap((repository) => [repository, ...this.flatten(repository.children)]);
  }

  public getRepositories(): readonly RepositoryNode[] {
    return this.repositories;
  }

  public async stageFile(repositoryPath: string, filePaths: string | readonly string[]): Promise<void> {
    await this.gitAdapter.stageFile(repositoryPath, filePaths);
  }

  public async unstageFile(repositoryPath: string, filePath: string): Promise<void> {
    await this.gitAdapter.unstageFile(repositoryPath, filePath);
  }

  public async stageAll(repositoryPath: string): Promise<void> {
    await this.gitAdapter.stageAll(repositoryPath);
  }

  public async unstageAll(repositoryPath: string): Promise<void> {
    await this.gitAdapter.unstageAll(repositoryPath);
  }

  public async discardFile(repositoryPath: string, filePath: string): Promise<void> {
    await this.gitAdapter.discardFile(repositoryPath, filePath);
  }

  public async commit(repositoryPath: string, message: string): Promise<void> {
    await this.gitAdapter.commit(repositoryPath, message);
  }

  public async fetch(repositoryPath: string): Promise<void> {
    await this.gitAdapter.fetch(repositoryPath);
  }

  public async pull(repositoryPath: string): Promise<void> {
    await this.gitAdapter.pull(repositoryPath);
  }

  public async pullBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.gitAdapter.pullBranch(repositoryPath, branch);
  }

  public async push(repositoryPath: string): Promise<string> {
    return this.gitAdapter.push(repositoryPath);
  }

  public async getRemoteUrl(repositoryPath: string): Promise<string | undefined> {
    return this.gitAdapter.getRemoteUrl(repositoryPath);
  }

  public async getCurrentBranch(repositoryPath: string): Promise<string | undefined> {
    return this.gitAdapter.getCurrentBranch(repositoryPath);
  }

  public async listBranches(repositoryPath: string): Promise<readonly string[]> {
    return this.gitAdapter.listBranches(repositoryPath);
  }

  public async checkoutBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.gitAdapter.checkoutBranch(repositoryPath, branch);
  }

  public async createBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.gitAdapter.createBranch(repositoryPath, branch);
  }

  public async mergeBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.gitAdapter.mergeBranch(repositoryPath, branch);
  }

  public async rebaseBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.gitAdapter.rebaseBranch(repositoryPath, branch);
  }

  public async stashPush(repositoryPath: string, message?: string): Promise<void> {
    await this.gitAdapter.stashPush(repositoryPath, message);
  }

  public async stashPop(repositoryPath: string): Promise<void> {
    await this.gitAdapter.stashPop(repositoryPath);
  }

  public async restoreAll(repositoryPath: string): Promise<void> {
    await this.gitAdapter.restoreAll(repositoryPath);
  }

  public async deleteBranch(repositoryPath: string, branch: string): Promise<void> {
    await this.gitAdapter.deleteBranch(repositoryPath, branch);
  }

  public async readConflictStage(repositoryPath: string, filePath: string, stage: 1 | 2 | 3): Promise<string> {
    return this.gitAdapter.readConflictStage(repositoryPath, filePath, stage);
  }

  public async markResolved(repositoryPath: string, filePath: string): Promise<void> {
    await this.gitAdapter.markResolved(repositoryPath, filePath);
  }

  public async getLog(repositoryPath: string, maxCount?: number): Promise<readonly CommitLogEntry[]> {
    return this.gitAdapter.getLog(repositoryPath, maxCount);
  }

  public async getCommitDiffFiles(repositoryPath: string, commitHash: string): Promise<readonly string[]> {
    return this.gitAdapter.getCommitDiffFiles(repositoryPath, commitHash);
  }

  private async loadStatusRecursive(repository: RepositoryNode): Promise<RepositoryNode> {
    const children = await Promise.all(repository.children.map((child) => this.loadStatusRecursive(child)));

    try {
      return {
        ...repository,
        children,
        status: await this.gitAdapter.getStatus(repository.rootPath),
        statusError: undefined
      };
    } catch (error) {
      return {
        ...repository,
        children,
        status: undefined,
        statusError: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
