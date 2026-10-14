import type { CommitDetails, CommitFileStat } from "../../shared/types/history";

const FIELD_SEPARATOR = "\x1f";

// Field order must match GIT_COMMIT_DETAILS_FORMAT.
export const GIT_COMMIT_DETAILS_FORMAT = `--format=${["%H", "%P", "%an", "%ae", "%aI", "%cn", "%cI", "%s", "%b"].join(FIELD_SEPARATOR)}`;

export function parseCommitMeta(output: string): Omit<CommitDetails, "files"> {
  const [hash, parents, authorName, authorEmail, authorDate, committerName, committerDate, subject, ...bodyParts] =
    output.split(FIELD_SEPARATOR);

  return {
    hash: (hash ?? "").trim(),
    parentHashes: (parents ?? "").split(" ").filter(Boolean),
    authorName: authorName ?? "",
    authorEmail: authorEmail ?? "",
    authorDate: authorDate ?? "",
    committerName: committerName ?? "",
    committerDate: committerDate ?? "",
    subject: subject ?? "",
    body: bodyParts.join(FIELD_SEPARATOR).trim()
  };
}

/** Parses `git diff --numstat --no-renames` output ("added<TAB>deleted<TAB>path" per line). */
export function parseNumstat(output: string): readonly CommitFileStat[] {
  const files: CommitFileStat[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!match) {
      continue;
    }

    files.push({
      path: match[3] ?? "",
      additions: match[1] === "-" ? null : Number(match[1]),
      deletions: match[2] === "-" ? null : Number(match[2])
    });
  }

  return files;
}
