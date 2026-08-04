import type { CommitGraph, CommitLogEntry, GraphEdge, GraphNode } from "../../shared/types/history";

/**
 * Assigns each commit to a lane (column) and computes the parent/child edges
 * needed to render a simplified commit graph, similar in spirit to
 * `git log --graph` but laid out for an SVG/canvas renderer instead of ASCII.
 *
 * Commits must already be in the order `git log` produces them (newest
 * first, respecting topological order relative to parents).
 */
export function buildCommitGraph(commits: readonly CommitLogEntry[]): CommitGraph {
  // Each lane tracks the hash of the commit it is waiting to connect to next.
  const lanes: Array<string | undefined> = [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const rowByHash = new Map<string, number>();

  commits.forEach((commit, row) => {
    rowByHash.set(commit.hash, row);

    let column = lanes.findIndex((waitingForHash) => waitingForHash === commit.hash);
    if (column === -1) {
      column = lanes.findIndex((waitingForHash) => waitingForHash === undefined);
    }
    if (column === -1) {
      column = lanes.length;
      lanes.push(undefined);
    }

    nodes.push({ commit, column });

    const [firstParent, ...otherParents] = commit.parentHashes;
    lanes[column] = firstParent;

    for (const parentHash of otherParents) {
      const existingLane = lanes.findIndex((waitingForHash) => waitingForHash === parentHash);
      if (existingLane !== -1) {
        continue;
      }

      const freeLane = lanes.findIndex((waitingForHash) => waitingForHash === undefined);
      if (freeLane !== -1) {
        lanes[freeLane] = parentHash;
      } else {
        lanes.push(parentHash);
      }
    }
  });

  for (const node of nodes) {
    const row = rowByHash.get(node.commit.hash);
    if (row === undefined) {
      continue;
    }

    for (const parentHash of node.commit.parentHashes) {
      const parentRow = rowByHash.get(parentHash);
      if (parentRow === undefined) {
        // Parent is outside the fetched log window (e.g. log was limited to N commits).
        continue;
      }

      const parentNode = nodes[parentRow];
      if (!parentNode) {
        continue;
      }

      edges.push({
        fromColumn: node.column,
        toColumn: parentNode.column,
        fromRow: row,
        toRow: parentRow
      });
    }
  }

  const columnCount = nodes.reduce((max, node) => Math.max(max, node.column + 1), 0);

  return { nodes, edges, columnCount };
}
