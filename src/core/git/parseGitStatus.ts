import type { GitChangedFile, GitFileStatusKind, RepositoryStatusSummary } from "../../shared/types/repository";

export function parseGitStatus(branch: string, output: string): RepositoryStatusSummary & { hasUpstream: boolean } {
  const records = output.includes("\0")
    ? output.split("\0").filter((record) => record.length > 0)
    : output.split(/\r?\n/).filter(Boolean);
  const files: GitChangedFile[] = [];
  let ahead = 0;
  let behind = 0;
  let hasUpstream = false;

  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const line = records[recordIndex] ?? "";
    if (line.startsWith("## ")) {
      hasUpstream = line.includes("...");
      const aheadMatch = /ahead (\d+)/.exec(line);
      const behindMatch = /behind (\d+)/.exec(line);
      ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
      behind = behindMatch ? Number(behindMatch[1]) : 0;
      continue;
    }

    const indexStatus = line[0] ?? " ";
    const workTreeStatus = line[1] ?? " ";
    const filePath = line.slice(3);

    if (line.startsWith("??")) {
      files.push(createChangedFile(filePath, "untracked", indexStatus, workTreeStatus));
      continue;
    }

    if (["U", "A", "D"].includes(indexStatus) && ["U", "A", "D"].includes(workTreeStatus)) {
      files.push(createChangedFile(filePath, "conflicted", indexStatus, workTreeStatus));
      continue;
    }

    const isRenameOrCopy = ["R", "C"].includes(indexStatus) || ["R", "C"].includes(workTreeStatus);
    const originalPath = output.includes("\0") && isRenameOrCopy
      ? records[recordIndex + 1]
      : undefined;
    if (originalPath !== undefined) {
      recordIndex += 1;
    }

    if (indexStatus !== " ") {
      files.push(createChangedFile(filePath, "staged", indexStatus, workTreeStatus, originalPath));
    }

    if (workTreeStatus !== " ") {
      files.push(createChangedFile(filePath, "unstaged", indexStatus, workTreeStatus, originalPath));
    }
  }

  return {
    branch,
    files,
    ahead,
    behind,
    hasUpstream,
    counts: {
      staged: files.filter((file) => file.kind === "staged").length,
      unstaged: files.filter((file) => file.kind === "unstaged").length,
      untracked: files.filter((file) => file.kind === "untracked").length,
      conflicted: files.filter((file) => file.kind === "conflicted").length
    }
  };
}

function createChangedFile(
  rawPath: string,
  kind: GitFileStatusKind,
  indexStatus: string,
  workTreeStatus: string,
  nulOriginalPath?: string
): GitChangedFile {
  if (nulOriginalPath !== undefined) {
    return {
      originalPath: nulOriginalPath,
      path: rawPath,
      kind,
      indexStatus,
      workTreeStatus
    };
  }

  const isRenameOrCopy = ["R", "C"].includes(indexStatus) || ["R", "C"].includes(workTreeStatus);
  if (!isRenameOrCopy) {
    return {
      path: rawPath,
      kind,
      indexStatus,
      workTreeStatus
    };
  }

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
