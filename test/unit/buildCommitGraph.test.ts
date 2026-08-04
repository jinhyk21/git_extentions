import * as assert from "node:assert";
import { buildCommitGraph } from "../../src/core/git/buildCommitGraph";
import type { CommitLogEntry } from "../../src/shared/types/history";

function commit(hash: string, parentHashes: readonly string[]): CommitLogEntry {
  return {
    hash,
    abbreviatedHash: hash.slice(0, 7),
    parentHashes,
    authorName: "Test",
    authorEmail: "test@example.com",
    authorDate: "2024-01-01T00:00:00+00:00",
    subject: hash,
    refs: []
  };
}

describe("buildCommitGraph", () => {
  it("puts every commit on column 0 for a linear history", () => {
    // Newest first, as git log produces it.
    const commits = [commit("c3", ["c2"]), commit("c2", ["c1"]), commit("c1", [])];

    const graph = buildCommitGraph(commits);

    assert.strictEqual(graph.columnCount, 1);
    assert.ok(graph.nodes.every((node) => node.column === 0));
    assert.strictEqual(graph.edges.length, 2);
  });

  it("opens a second column for a merge commit's second parent", () => {
    // main:    c4 (merge of c3 and b2)
    // branch:  b2 -> b1 -> c1
    // main:    c3 -> c1
    const commits = [
      commit("c4", ["c3", "b2"]),
      commit("b2", ["b1"]),
      commit("c3", ["c1"]),
      commit("b1", ["c1"]),
      commit("c1", [])
    ];

    const graph = buildCommitGraph(commits);

    assert.strictEqual(graph.columnCount, 2);

    const nodeByHash = new Map(graph.nodes.map((node) => [node.commit.hash, node]));
    // c4 stays on column 0 (first parent lane); b2 gets pushed to column 1.
    assert.strictEqual(nodeByHash.get("c4")?.column, 0);
    assert.strictEqual(nodeByHash.get("b2")?.column, 1);
    assert.strictEqual(nodeByHash.get("c3")?.column, 0);
    assert.strictEqual(nodeByHash.get("b1")?.column, 1);
    // Both branches converge back onto c1's row; c1 takes whichever lane reaches it first.
    assert.ok(nodeByHash.has("c1"));
  });

  it("creates one edge per parent link that exists in the given commit set", () => {
    const commits = [commit("c2", ["c1"]), commit("c1", [])];

    const graph = buildCommitGraph(commits);

    assert.strictEqual(graph.edges.length, 1);
    assert.strictEqual(graph.edges[0]?.fromRow, 0);
    assert.strictEqual(graph.edges[0]?.toRow, 1);
  });

  it("does not create an edge to a parent outside the fetched window", () => {
    // c1's parent "missing" was not included (e.g. log was truncated).
    const commits = [commit("c1", ["missing"])];

    const graph = buildCommitGraph(commits);

    assert.strictEqual(graph.edges.length, 0);
    assert.strictEqual(graph.nodes.length, 1);
  });

  it("returns an empty graph for no commits", () => {
    const graph = buildCommitGraph([]);

    assert.deepStrictEqual(graph.nodes, []);
    assert.deepStrictEqual(graph.edges, []);
    assert.strictEqual(graph.columnCount, 0);
  });

  it("reuses a freed lane instead of growing columns unnecessarily", () => {
    // Two independent root commits (e.g. two unrelated branches with no merge yet)
    // should not each claim a permanently separate column once one lane ends.
    const commits = [commit("b1", []), commit("a1", [])];

    const graph = buildCommitGraph(commits);

    const nodeByHash = new Map(graph.nodes.map((node) => [node.commit.hash, node]));
    assert.strictEqual(nodeByHash.get("b1")?.column, 0);
    assert.strictEqual(nodeByHash.get("a1")?.column, 0);
    assert.strictEqual(graph.columnCount, 1);
  });
});
