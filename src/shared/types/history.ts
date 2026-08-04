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
