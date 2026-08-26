import * as assert from "node:assert";
import { parseGitStatus } from "../../src/core/git/parseGitStatus";

describe("parseGitStatus", () => {
  it("parses a clean repository with upstream and no changes", () => {
    const result = parseGitStatus("main", "## main...origin/main");

    assert.strictEqual(result.branch, "main");
    assert.strictEqual(result.hasUpstream, true);
    assert.strictEqual(result.ahead, 0);
    assert.strictEqual(result.behind, 0);
    assert.deepStrictEqual(result.files, []);
  });

  it("parses ahead/behind counts from the branch header", () => {
    const result = parseGitStatus("main", "## main...origin/main [ahead 2, behind 3]");

    assert.strictEqual(result.ahead, 2);
    assert.strictEqual(result.behind, 3);
  });

  it("has no upstream when branch header lacks '...'", () => {
    const result = parseGitStatus("main", "## main");

    assert.strictEqual(result.hasUpstream, false);
  });

  it("classifies an untracked file", () => {
    const result = parseGitStatus("main", "## main\n?? new-file.txt");

    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0]?.kind, "untracked");
    assert.strictEqual(result.files[0]?.path, "new-file.txt");
    assert.strictEqual(result.counts.untracked, 1);
  });

  it("classifies a staged file", () => {
    const result = parseGitStatus("main", "## main\nA  staged.txt");

    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0]?.kind, "staged");
    assert.strictEqual(result.counts.staged, 1);
  });

  it("classifies an unstaged (worktree-modified) file", () => {
    const result = parseGitStatus("main", "## main\n M unstaged.txt");

    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0]?.kind, "unstaged");
    assert.strictEqual(result.counts.unstaged, 1);
  });

  it("emits both staged and unstaged entries for a partially staged file", () => {
    const result = parseGitStatus("main", "## main\nMM both.txt");

    assert.strictEqual(result.files.length, 2);
    assert.deepStrictEqual(
      result.files.map((f) => f.kind).sort(),
      ["staged", "unstaged"]
    );
  });

  it("classifies a conflicted file (both modified, UU)", () => {
    const result = parseGitStatus("main", "## main\nUU conflict.txt");

    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0]?.kind, "conflicted");
    assert.strictEqual(result.counts.conflicted, 1);
  });

  it("parses a renamed file into originalPath/path", () => {
    const result = parseGitStatus("main", "## main\nR  old-name.txt -> new-name.txt");

    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0]?.originalPath, "old-name.txt");
    assert.strictEqual(result.files[0]?.path, "new-name.txt");
  });

  it("falls back to DETACHED-friendly branch name when passed through unchanged", () => {
    const result = parseGitStatus("DETACHED", "## HEAD (no branch)");

    assert.strictEqual(result.branch, "DETACHED");
  });

  it("ignores blank lines in the porcelain output", () => {
    const result = parseGitStatus("main", "## main\n\n?? a.txt\n\n");

    assert.strictEqual(result.files.length, 1);
  });

  it("parses NUL-delimited paths without Git quoting", () => {
    const result = parseGitStatus("main", "## main\0?? a b.txt\0?? arrow -> name.txt\0");

    assert.deepStrictEqual(
      result.files.map((file) => file.path),
      ["a b.txt", "arrow -> name.txt"]
    );
    assert.ok(result.files.every((file) => file.originalPath === undefined));
  });

  it("parses a NUL-delimited rename where Git emits destination before source", () => {
    const result = parseGitStatus("main", "## main\0R  new name.txt\0old name.txt\0");

    assert.strictEqual(result.files[0]?.path, "new name.txt");
    assert.strictEqual(result.files[0]?.originalPath, "old name.txt");
  });

  it("does not mistake an untracked filename containing an arrow for a rename", () => {
    const result = parseGitStatus("main", "## main\n?? arrow -> name.txt");

    assert.strictEqual(result.files[0]?.path, "arrow -> name.txt");
    assert.strictEqual(result.files[0]?.originalPath, undefined);
  });
});
