import { ErrorCodes, type ErrorCode } from "../../shared/constants/errorCodes";

const PATTERNS: readonly (readonly [RegExp, ErrorCode])[] = [
  [/not a git repository/i, ErrorCodes.RepositoryNotFound],
  [/(fatal: could not read (username|password)|authentication failed|permission denied \(publickey\)|invalid username or password)/i, ErrorCodes.AuthFailed],
  [/(could not resolve host|network is unreachable|connection timed out|unable to access.*could not resolve)/i, ErrorCodes.RemoteRejected],
  [/(\[rejected\]|failed to push some refs|non-fast-forward)/i, ErrorCodes.RemoteRejected],
  [/rebase in progress|could not apply|conflict.*rebase/i, ErrorCodes.RebaseConflict],
  [/you have not concluded your merge|merge conflict|conflict \(content\)|automatic merge failed/i, ErrorCodes.MergeConflict],
  [/you are not currently on a branch|detached head/i, ErrorCodes.DetachedHead],
  [/(changes .* would be overwritten|please commit your changes or stash them|working tree has|cannot pull with rebase: you have unstaged changes)/i, ErrorCodes.DirtyWorkingTree],
  [/timed out/i, ErrorCodes.Timeout],
  [/git: command not found|'git' is not recognized|spawn git enoent/i, ErrorCodes.GitNotFound]
];

export function classifyGitError(message: string): ErrorCode {
  for (const [pattern, code] of PATTERNS) {
    if (pattern.test(message)) {
      return code;
    }
  }

  return ErrorCodes.UnknownGitError;
}
