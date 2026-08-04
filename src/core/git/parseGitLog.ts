import type { CommitLogEntry, CommitRef } from "../../shared/types/history";

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\x1f";

// Field order must match the --pretty=format string built by GitAdapter.getLog:
// hash, abbreviated hash, parent hashes, author name, author email, author date, subject, ref names.
export const GIT_LOG_FORMAT = ["%H", "%h", "%P", "%an", "%ae", "%aI", "%s", "%D"].join(FIELD_SEPARATOR);
export const GIT_LOG_PRETTY = `--pretty=format:${RECORD_SEPARATOR}${GIT_LOG_FORMAT}`;

export function parseGitLog(output: string): readonly CommitLogEntry[] {
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean)
    .map(parseRecord);
}

function parseRecord(record: string): CommitLogEntry {
  const fields = record.split(FIELD_SEPARATOR);
  const [hash, abbreviatedHash, parents, authorName, authorEmail, authorDate, subject, refNames] = fields;

  return {
    hash: hash ?? "",
    abbreviatedHash: abbreviatedHash ?? "",
    parentHashes: (parents ?? "").split(" ").filter(Boolean),
    authorName: authorName ?? "",
    authorEmail: authorEmail ?? "",
    authorDate: authorDate ?? "",
    subject: subject ?? "",
    refs: parseRefNames(refNames ?? "")
  };
}

function parseRefNames(refNames: string): readonly CommitRef[] {
  if (refNames.trim().length === 0) {
    return [];
  }

  return refNames
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const headMatch = /^HEAD -> (.+)$/.exec(entry);
      const name = headMatch ? headMatch[1] ?? entry : entry;
      const isTag = entry.startsWith("tag: ");

      return {
        name: isTag ? name.replace(/^tag: /, "") : name,
        isHead: entry === "HEAD" || headMatch !== null,
        isTag,
        isRemote: !isTag && name.includes("/")
      };
    });
}
