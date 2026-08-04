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

const MERGE_REQUEST_HINT_PATTERN = /merge[_-]requests|pull\/new|compare|pull-request/i;

export function findMergeRequestUrl(output: string): string | undefined {
  // Only consider URLs on lines that are NOT the plain "To <remote-url>" line
  // git prints on every push — that line is the remote's URL, not a PR/MR
  // link, and would otherwise be picked up by an untargeted fallback.
  const candidateLines = output.split(/\r?\n/).filter((line) => !/^\s*To\s+https?:\/\//i.test(line));
  const urls = candidateLines.join("\n").match(/https?:\/\/[^\s)>\]]+/g) ?? [];

  return urls.find((url) => MERGE_REQUEST_HINT_PATTERN.test(url)) ?? urls.find((url) => !isBareRepositoryUrl(url));
}

function isBareRepositoryUrl(url: string): boolean {
  // A URL with no path segments beyond the org/repo (e.g.
  // https://github.com/org/repo) is just the remote's own address, not a
  // link to a specific PR/MR creation page.
  const pathSegments = new URL(url).pathname.split("/").filter(Boolean);
  return pathSegments.length <= 2;
}
