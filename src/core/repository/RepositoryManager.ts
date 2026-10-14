import path from "node:path";
import type {
  GitOperationState,
  GitOperationType,
  PullStrategy,
  RepositoryNode
} from "../../shared/types/repository";
import type { CommitDetails, CommitLogEntry } from "../../shared/types/history";
import { GitAdapter } from "../git/GitAdapter";
import { createLimiter } from "../util/createLimiter";
import { RepositoryScanner, type ScanOptions } from "./RepositoryScanner";

export class RepositoryManager {
  private repositories: readonly RepositoryNode[] = [];
  private scanOptions: ScanOptions = {};
  private readonly limitStatusLoad = createLimiter(4);
  private flatCache: RepositoryNode[] | undefined;

  public constructor(
    private readonly scanner = new RepositoryScanner(),
    private readonly gitAdapter = new GitAdapter()
  ) {}

  public async refresh(workspaceFolders: readonly string[]): Promise<readonly RepositoryNode[]> {
    const repositories = await this.scanner.scan(workspaceFolders, this.scanOptions);
    this.setRepositories(await Promise.all(repositories.map((repository) => this.loadStatusRecursive(repository))));
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

    this.setRepositories(
      this.repositories.map((repository) => this.applyStatus(repository, repositoryPath, status, statusError))
    );
  }

  /**
   * Refreshes one repository plus every repository that contains it (a nested
   * repository shows up as a change in its parent), without rescanning the
   * filesystem or touching unrelated repositories.
   */
  public async refreshRepositoryAndAncestors(repositoryPath: string): Promise<void> {
    const targets = this.flatRepositories()
      .map((repository) => repository.rootPath)
      .filter((root) => repositoryPath === root || repositoryPath.startsWith(`${root}${path.sep}`));
    await Promise.all((targets.length > 0 ? targets : [repositoryPath]).map((root) => this.refreshRepositoryStatus(root)));
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
    // The flattened list is cached and sorted deepest-first: file watcher events call this
    // thousands of times during a build, so it must not rebuild the list every time.
    return this.flatRepositories().find(
      (repository) => filePath === repository.rootPath || filePath.startsWith(`${repository.rootPath}${path.sep}`)
    );
  }

  private setRepositories(repositories: readonly RepositoryNode[]): void {
    this.repositories = repositories;
    this.flatCache = undefined;
  }

  private flatRepositories(): RepositoryNode[] {
    this.flatCache ??= this.flatten(this.repositories).sort((left, right) => right.rootPath.length - left.rootPath.length);
    return this.flatCache;
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

  public async pull(repositoryPath: string, strategy?: PullStrategy): Promise<void> {
    await this.gitAdapter.pull(repositoryPath, strategy);
  }

  public async pullBranch(
    repositoryPath: string,
    branch: string,
    strategy?: PullStrategy,
    remote?: string
  ): Promise<void> {
    await this.gitAdapter.pullBranch(repositoryPath, branch, strategy, remote);
  }

  public async push(repositoryPath: string, remote?: string): Promise<string> {
    return this.gitAdapter.push(repositoryPath, remote);
  }

  public async getRemoteUrl(repositoryPath: string, remote?: string): Promise<string | undefined> {
    return this.gitAdapter.getRemoteUrl(repositoryPath, remote);
  }

  public async listRemotes(repositoryPath: string): Promise<readonly string[]> {
    return this.gitAdapter.listRemotes(repositoryPath);
  }

  public async getUpstreamRemote(repositoryPath: string): Promise<string | undefined> {
    return this.gitAdapter.getUpstreamRemote(repositoryPath);
  }

  public setScanOptions(options: ScanOptions): void {
    this.scanOptions = options;
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

  public async continueOperation(repositoryPath: string, operation: GitOperationType): Promise<void> {
    await this.gitAdapter.continueOperation(repositoryPath, operation);
  }

  public async abortOperation(repositoryPath: string, operation: GitOperationType): Promise<void> {
    await this.gitAdapter.abortOperation(repositoryPath, operation);
  }

  public async skipOperation(repositoryPath: string, operation: GitOperationType): Promise<void> {
    await this.gitAdapter.skipOperation(repositoryPath, operation);
  }

  public async getOperationState(repositoryPath: string): Promise<GitOperationState | undefined> {
    return this.gitAdapter.getOperationState(repositoryPath);
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

  public async deleteBranch(repositoryPath: string, branch: string, force = true): Promise<void> {
    await this.gitAdapter.deleteBranch(repositoryPath, branch, force);
  }

  public async isBranchMergedIntoHead(repositoryPath: string, branch: string): Promise<boolean> {
    return this.gitAdapter.isBranchMergedIntoHead(repositoryPath, branch);
  }

  public async readConflictStage(repositoryPath: string, filePath: string, stage: 1 | 2 | 3): Promise<string> {
    return this.gitAdapter.readConflictStage(repositoryPath, filePath, stage);
  }

  public async hasConflictStage(repositoryPath: string, filePath: string, stage: 1 | 2 | 3): Promise<boolean> {
    return this.gitAdapter.hasConflictStage(repositoryPath, filePath, stage);
  }

  public async markResolved(repositoryPath: string, filePath: string): Promise<void> {
    await this.gitAdapter.markResolved(repositoryPath, filePath);
  }

  public async resolveConflictWithSide(
    repositoryPath: string,
    filePath: string,
    side: "current" | "incoming"
  ): Promise<void> {
    await this.gitAdapter.resolveConflictWithSide(repositoryPath, filePath, side);
  }

  public async getLog(repositoryPath: string, maxCount?: number): Promise<readonly CommitLogEntry[]> {
    return this.gitAdapter.getLog(repositoryPath, maxCount);
  }

  public async getCommitDetails(repositoryPath: string, commitHash: string): Promise<CommitDetails> {
    return this.gitAdapter.getCommitDetails(repositoryPath, commitHash);
  }

  public async listRemoteBranches(repositoryPath: string): Promise<readonly string[]> {
    return this.gitAdapter.listRemoteBranches(repositoryPath);
  }

  public async checkoutRemoteBranch(repositoryPath: string, remoteBranch: string): Promise<void> {
    await this.gitAdapter.checkoutRemoteBranch(repositoryPath, remoteBranch);
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
        status: await this.limitStatusLoad(() => this.gitAdapter.getStatus(repository.rootPath)),
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
