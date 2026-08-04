import type { GitChangedFile, RepositoryNode } from "../../shared/types/repository";

export type RepositoryCommandNode = RepositoryNode;

export type ActionMenuCommandNode = {
  readonly type: "actionMenu";
  readonly repository: RepositoryNode;
};

export type ChangedFileCommandNode = {
  readonly type: "changedFile";
  readonly repository: RepositoryNode;
  readonly file: GitChangedFile;
};

export function isChangedFileCommandNode(node: unknown): node is ChangedFileCommandNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    node.type === "changedFile" &&
    "repository" in node &&
    "file" in node
  );
}

export function isActionMenuCommandNode(node: unknown): node is ActionMenuCommandNode {
  return (
    typeof node === "object" && node !== null && "type" in node && node.type === "actionMenu" && "repository" in node
  );
}

export function isRepositoryCommandNode(node: unknown): node is RepositoryCommandNode {
  return typeof node === "object" && node !== null && "rootPath" in node && "name" in node && "children" in node;
}

export function getRepositoryFromActionTarget(node: unknown): RepositoryCommandNode | undefined {
  if (isRepositoryCommandNode(node)) {
    return node;
  }

  if (isActionMenuCommandNode(node)) {
    return node.repository;
  }

  return undefined;
}

export function findMergeRequestUrl(output: string): string | undefined {
  const urls = output.match(/https?:\/\/[^\s)>\]]+/g) ?? [];
  return urls.find((url) => /merge[_-]requests|pull\/new|compare|pull-request/i.test(url)) ?? urls[0];
}
