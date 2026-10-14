export type CommitRef = {
  readonly name: string;
  readonly isHead: boolean;
  readonly isTag: boolean;
  readonly isRemote: boolean;
};

export type CommitLogEntry = {
  readonly hash: string;
  readonly abbreviatedHash: string;
  readonly parentHashes: readonly string[];
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorDate: string;
  readonly subject: string;
  readonly refs: readonly CommitRef[];
};

export type GraphNode = {
  readonly commit: CommitLogEntry;
  readonly column: number;
};

export type GraphEdge = {
  readonly fromColumn: number;
  readonly toColumn: number;
  readonly fromRow: number;
  readonly toRow: number;
};

export type CommitGraph = {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly columnCount: number;
};

export type CommitFileStat = {
  readonly path: string;
  /** null for binary files, which git reports as "-". */
  readonly additions: number | null;
  readonly deletions: number | null;
};

export type CommitDetails = {
  readonly hash: string;
  readonly parentHashes: readonly string[];
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorDate: string;
  readonly committerName: string;
  readonly committerDate: string;
  readonly subject: string;
  readonly body: string;
  readonly files: readonly CommitFileStat[];
};
