import * as assert from "node:assert";
import { parseCommitMeta, parseNumstat } from "../../src/core/git/parseCommitDetails";

describe("parseCommitDetails", () => {
  it("parses commit metadata including a multi-line body", () => {
    const output = ["abc123", "p1 p2", "Ann", "ann@x.io", "2026-01-01T00:00:00+00:00", "Bob", "2026-01-02T00:00:00+00:00", "Subject", "Line one\n\nLine two\n"].join("\x1f");

    const meta = parseCommitMeta(output);

    assert.strictEqual(meta.hash, "abc123");
    assert.deepStrictEqual(meta.parentHashes, ["p1", "p2"]);
    assert.strictEqual(meta.authorName, "Ann");
    assert.strictEqual(meta.committerName, "Bob");
    assert.strictEqual(meta.subject, "Subject");
    assert.strictEqual(meta.body, "Line one\n\nLine two");
  });

  it("keeps a body that happens to contain the field separator", () => {
    const output = ["h", "", "a", "e", "d", "c", "d", "s", "x\x1fy"].join("\x1f");

    assert.strictEqual(parseCommitMeta(output).body, "x\x1fy");
  });

  it("parses numstat lines including binary files and tabs-free paths with spaces", () => {
    const files = parseNumstat("3\t1\tsrc/a.ts\n-\t-\timg/logo.png\n0\t5\tdir/with space.txt\n");

    assert.deepStrictEqual(files, [
      { path: "src/a.ts", additions: 3, deletions: 1 },
      { path: "img/logo.png", additions: null, deletions: null },
      { path: "dir/with space.txt", additions: 0, deletions: 5 }
    ]);
  });

  it("returns no files for empty numstat output", () => {
    assert.deepStrictEqual(parseNumstat(""), []);
  });
});
