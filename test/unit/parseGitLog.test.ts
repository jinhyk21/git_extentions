import * as assert from "node:assert";
import { parseGitLog } from "../../src/core/git/parseGitLog";

const RS = "\x1e";
const FS = "\x1f";

function record(fields: readonly string[]): string {
  return RS + fields.join(FS);
}

describe("parseGitLog", () => {
  it("parses a single commit with no parents and a HEAD branch ref", () => {
    const output = record(["abc123", "abc123a", "", "Alice", "alice@example.com", "2024-01-01T00:00:00+00:00", "first commit", "HEAD -> main"]);

    const commits = parseGitLog(output);

    assert.strictEqual(commits.length, 1);
    const commit = commits[0];
    assert.strictEqual(commit?.hash, "abc123");
    assert.strictEqual(commit?.abbreviatedHash, "abc123a");
    assert.deepStrictEqual(commit?.parentHashes, []);
    assert.strictEqual(commit?.authorName, "Alice");
    assert.strictEqual(commit?.subject, "first commit");
    assert.strictEqual(commit?.refs.length, 1);
    assert.strictEqual(commit?.refs[0]?.name, "main");
    assert.strictEqual(commit?.refs[0]?.isHead, true);
  });

  it("parses multiple parent hashes for a merge commit", () => {
    const output = record(["m1", "m1a", "p1 p2", "Bob", "bob@example.com", "2024-01-02T00:00:00+00:00", "merge", ""]);

    const commits = parseGitLog(output);

    assert.deepStrictEqual(commits[0]?.parentHashes, ["p1", "p2"]);
  });

  it("parses multiple commits in sequence", () => {
    const output =
      record(["c2", "c2a", "c1", "Bob", "bob@example.com", "2024-01-02T00:00:00+00:00", "second", ""]) +
      record(["c1", "c1a", "", "Alice", "alice@example.com", "2024-01-01T00:00:00+00:00", "first", ""]);

    const commits = parseGitLog(output);

    assert.strictEqual(commits.length, 2);
    assert.strictEqual(commits[0]?.hash, "c2");
    assert.strictEqual(commits[1]?.hash, "c1");
  });

  it("returns an empty array for empty output", () => {
    assert.deepStrictEqual(parseGitLog(""), []);
  });

  it("marks a tag ref as isTag and strips the 'tag: ' prefix", () => {
    const output = record(["c1", "c1a", "", "A", "a@example.com", "2024-01-01T00:00:00+00:00", "msg", "tag: v1.0.0"]);

    const commits = parseGitLog(output);
    const ref = commits[0]?.refs[0];

    assert.strictEqual(ref?.name, "v1.0.0");
    assert.strictEqual(ref?.isTag, true);
    assert.strictEqual(ref?.isHead, false);
  });

  it("marks a remote branch ref as isRemote", () => {
    const output = record(["c1", "c1a", "", "A", "a@example.com", "2024-01-01T00:00:00+00:00", "msg", "origin/main"]);

    const commits = parseGitLog(output);
    const ref = commits[0]?.refs[0];

    assert.strictEqual(ref?.name, "origin/main");
    assert.strictEqual(ref?.isRemote, true);
    assert.strictEqual(ref?.isTag, false);
  });

  it("parses multiple comma-separated refs on one commit", () => {
    const output = record(["c1", "c1a", "", "A", "a@example.com", "2024-01-01T00:00:00+00:00", "msg", "HEAD -> main, origin/main, tag: v1"]);

    const commits = parseGitLog(output);

    assert.strictEqual(commits[0]?.refs.length, 3);
    assert.deepStrictEqual(
      commits[0]?.refs.map((ref) => ref.name),
      ["main", "origin/main", "v1"]
    );
  });

  it("returns no refs when the ref field is blank", () => {
    const output = record(["c1", "c1a", "", "A", "a@example.com", "2024-01-01T00:00:00+00:00", "msg", ""]);

    const commits = parseGitLog(output);
    assert.deepStrictEqual(commits[0]?.refs, []);
  });
});
