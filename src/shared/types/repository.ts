export type GitFileStatusKind = "staged" | "unstaged" | "untracked" | "conflicted";

export type GitChangedFile = {
  readonly path: string;
  readonly originalPath?: string;
  readonly kind: GitFileStatusKind;
  readonly indexStatus: string;
  readonly workTreeStatus: string;
};

export type RepositoryStatusSummary = {
  readonly branch: string;
  readonly files: readonly GitChangedFile[];
  readonly ahead: number;
  readonly behind: number;
  readonly counts: {
    readonly staged: number;
    readonly unstaged: number;
    readonly untracked: number;
    readonly conflicted: number;
  };
};

export type RepositoryNode = {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly parentId?: string;
  readonly children: readonly RepositoryNode[];
  readonly isNested: boolean;
  readonly isSubmodule: boolean;
  readonly status?: RepositoryStatusSummary;
};
