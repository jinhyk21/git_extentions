export const ErrorCodes = {
  GitNotFound: "GIT_001",
  RepositoryNotFound: "GIT_002",
  DirtyWorkingTree: "GIT_003",
  MergeConflict: "GIT_004",
  RebaseConflict: "GIT_005",
  DetachedHead: "GIT_006",
  AuthFailed: "GIT_007",
  RemoteRejected: "GIT_008",
  Timeout: "GIT_009",
  UnknownGitError: "GIT_010"
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
