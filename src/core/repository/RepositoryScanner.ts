import type { Dirent } from "node:fs";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import type { RepositoryNode } from "../../shared/types/repository";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "out", ".next", ".turbo"]);

export type ScanOptions = {
  /** Extra directory names to skip, in addition to the built-in list. */
  readonly excludeDirectories?: readonly string[];
  /** Maximum directory depth below a workspace folder to scan; 0 or unset = unlimited. */
  readonly maxDepth?: number;
};

export class RepositoryScanner {
  public async scan(
    workspaceFolders: readonly string[],
    options: ScanOptions = {}
  ): Promise<readonly RepositoryNode[]> {
    const ignored = new Set([...IGNORED_DIRECTORIES, ...(options.excludeDirectories ?? [])]);
    const maxDepth = options.maxDepth && options.maxDepth > 0 ? options.maxDepth : Number.POSITIVE_INFINITY;
    const normalizedRoots = [...new Set(workspaceFolders.map((folder) => path.resolve(folder)))];
    const repositories: RepositoryDraft[] = [];

    for (const root of normalizedRoots) {
      await this.scanDirectory(root, repositories, ignored, maxDepth, 0);
    }

    return this.buildTree(repositories);
  }

  private async scanDirectory(
    directory: string,
    repositories: RepositoryDraft[],
    ignored: ReadonlySet<string>,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    if (await this.pathExists(path.join(directory, ".git"))) {
      repositories.push({
        id: directory,
        name: path.basename(directory),
        rootPath: directory,
        isSubmodule: !(await this.pathExists(path.join(directory, ".git", "HEAD")))
      });
    }

    if (depth >= maxDepth) {
      return;
    }

    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || ignored.has(entry.name)) {
        continue;
      }

      await this.scanDirectory(path.join(directory, entry.name), repositories, ignored, maxDepth, depth + 1);
    }
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await access(target);
      return true;
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
