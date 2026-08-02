import type { RepositoryNode } from "../../shared/types/repository";
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

  public getRepositories(): readonly RepositoryNode[] {
    return this.repositories;
  }

  public async stageFile(repositoryPath: string, filePath: string): Promise<void> {
    await this.gitAdapter.stageFile(repositoryPath, filePath);
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

  public async push(repositoryPath: string): Promise<string> {
    return this.gitAdapter.push(repositoryPath);
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

  private async loadStatusRecursive(repository: RepositoryNode): Promise<RepositoryNode> {
    const children = await Promise.all(repository.children.map((child) => this.loadStatusRecursive(child)));

    try {
      return {
        ...repository,
        children,
        status: await this.gitAdapter.getStatus(repository.rootPath)
      };
    } catch {
      return {
        ...repository,
        children
      };
    }
  }
}
