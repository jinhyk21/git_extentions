import type { GitFileStatusKind, GitOperationType } from "./repository";

export type SidebarFile = {
  readonly path: string;
  readonly originalPath?: string;
  readonly kind: GitFileStatusKind;
  /** Two-letter porcelain code, e.g. "M ", " M", "??", "UU". */
  readonly code: string;
};

export type SidebarOperation = {
  readonly type: GitOperationType;
  readonly currentStep?: number;
  readonly totalSteps?: number;
};

export type SidebarRepository = {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly isSubmodule: boolean;
  readonly loading: boolean;
  readonly error?: string;
  readonly branch?: string;
  readonly ahead: number;
  readonly behind: number;
  readonly counts: {
    readonly staged: number;
    readonly unstaged: number;
    readonly untracked: number;
    readonly conflicted: number;
  };
  readonly operation?: SidebarOperation;
  readonly files: readonly SidebarFile[];
  readonly children: readonly SidebarRepository[];
  /** False for clean, in-sync repositories (only listed when "show clean" is on). */
  readonly needsAttention: boolean;
};

export type SidebarSummary = {
  readonly repositories: number;
  readonly changedFiles: number;
  readonly conflicts: number;
  readonly ahead: number;
  readonly behind: number;
};

export type SidebarState = {
  readonly repositories: readonly SidebarRepository[];
  readonly summary: SidebarSummary;
  readonly showClean: boolean;
};
