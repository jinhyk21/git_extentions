import { existsSync } from "node:fs";
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { RepositoryNode } from "../../shared/types/repository";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "out", ".next", ".turbo"]);

export class RepositoryScanner {
  public async scan(workspaceFolders: readonly string[]): Promise<readonly RepositoryNode[]> {
    const normalizedRoots = [...new Set(workspaceFolders.map((folder) => path.resolve(folder)))];
    const repositories: RepositoryDraft[] = [];

    for (const root of normalizedRoots) {
      await this.scanDirectory(root, repositories);
    }

    return this.buildTree(repositories);
  }

  private async scanDirectory(directory: string, repositories: RepositoryDraft[]): Promise<void> {
    if (this.hasGitMetadata(directory)) {
      repositories.push({
        id: directory,
        name: path.basename(directory),
        rootPath: directory,
        isSubmodule: existsSync(path.join(directory, ".git")) && !this.isGitDirectory(directory)
      });
    }

    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      await this.scanDirectory(path.join(directory, entry.name), repositories);
    }
  }

  private hasGitMetadata(directory: string): boolean {
    return existsSync(path.join(directory, ".git"));
  }

  private isGitDirectory(directory: string): boolean {
    try {
      return existsSync(path.join(directory, ".git", "HEAD"));
    } catch {
      return false;
    }
  }

  private buildTree(repositories: readonly RepositoryDraft[]): readonly RepositoryNode[] {
    const sorted = [...repositories].sort((left, right) => left.rootPath.length - right.rootPath.length);
    const nodes = new Map<string, MutableRepositoryNode>();

    for (const repo of sorted) {
      nodes.set(repo.id, {
        ...repo,
        children: [],
        isNested: false
      });
    }

    for (const repo of sorted) {
      const node = nodes.get(repo.id);
      if (!node) {
        continue;
      }

      const parent = sorted
        .filter((candidate) => candidate.id !== repo.id && repo.rootPath.startsWith(candidate.rootPath + path.sep))
        .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];

      if (!parent) {
        continue;
      }

      const parentNode = nodes.get(parent.id);
      if (!parentNode) {
        continue;
      }

      node.parentId = parent.id;
      node.isNested = true;
      parentNode.children.push(node);
    }

    return [...nodes.values()].filter((node) => !node.parentId);
  }
}

type RepositoryDraft = {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly isSubmodule: boolean;
};

type MutableRepositoryNode = RepositoryDraft & {
  parentId?: string;
  children: MutableRepositoryNode[];
  isNested: boolean;
};
