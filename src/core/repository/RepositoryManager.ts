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
