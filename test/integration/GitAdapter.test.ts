import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GitAdapter } from "../../src/core/git/GitAdapter";
import { GitWorkspaceError } from "../../src/core/errors/GitWorkspaceError";
import { ErrorCodes } from "../../src/shared/constants/errorCodes";

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd });
}

function writeFile(repoDir: string, relPath: string, content: string): void {
  writeFileSync(path.join(repoDir, relPath), content);
}

describe("GitAdapter (integration)", () => {
  let repoDir: string;
  let adapter: GitAdapter;

  beforeEach(() => {
    repoDir = mkdtempSync(path.join(tmpdir(), "gwp-adapter-"));
    git(repoDir, ["init", "--quiet", "--initial-branch=main"]);
    git(repoDir, ["config", "user.email", "test@example.com"]);
    git(repoDir, ["config", "user.name", "Test"]);
    writeFile(repoDir, "README.md", "hello\n");
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "--quiet", "-m", "initial commit"]);
    adapter = new GitAdapter();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("reports a clean status on a fresh commit", async () => {
    const status = await adapter.getStatus(repoDir);

    assert.strictEqual(status.branch, "main");
    assert.strictEqual(status.files.length, 0);
  });

  it("detects an untracked file", async () => {
    writeFile(repoDir, "new.txt", "content\n");

    const status = await adapter.getStatus(repoDir);

    assert.strictEqual(status.counts.untracked, 1);
  });

  it("stages a file and reflects it in status", async () => {
    writeFile(repoDir, "new.txt", "content\n");
    await adapter.stageFile(repoDir, "new.txt");

    const status = await adapter.getStatus(repoDir);

    assert.strictEqual(status.counts.staged, 1);
    assert.strictEqual(status.counts.untracked, 0);
  });

  it("unstages a previously staged file", async () => {
    writeFile(repoDir, "new.txt", "content\n");
    await adapter.stageFile(repoDir, "new.txt");
    await adapter.unstageFile(repoDir, "new.txt");

    const status = await adapter.getStatus(repoDir);

    assert.strictEqual(status.counts.staged, 0);
    assert.strictEqual(status.counts.untracked, 1);
  });

  it("commits staged changes", async () => {
    writeFile(repoDir, "new.txt", "content\n");
    await adapter.stageFile(repoDir, "new.txt");
    await adapter.commit(repoDir, "add new.txt");

    const status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.files.length, 0);

    const log = execFileSync("git", ["log", "--oneline", "-1"], { cwd: repoDir }).toString();
    assert.match(log, /add new\.txt/);
  });

  it("creates and checks out a branch", async () => {
    await adapter.createBranch(repoDir, "feature/x");

    const status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.branch, "feature/x");
  });

  it("lists branches including the current one", async () => {
    await adapter.createBranch(repoDir, "feature/y");

    const branches = await adapter.listBranches(repoDir);

    assert.ok(branches.includes("main"));
    assert.ok(branches.includes("feature/y"));
  });

  it("discards a working tree change", async () => {
    writeFile(repoDir, "README.md", "changed\n");
    await adapter.discardFile(repoDir, "README.md");

    const status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.files.length, 0);
  });

  it("stashes and pops changes", async () => {
    writeFile(repoDir, "README.md", "changed\n");
    await adapter.stashPush(repoDir, "wip");

    let status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.files.length, 0);

    await adapter.stashPop(repoDir);
    status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.counts.unstaged, 1);
  });

  it("throws a GitWorkspaceError classified as RepositoryNotFound for a non-repo path", async () => {
    const plainDir = mkdtempSync(path.join(tmpdir(), "gwp-not-a-repo-"));
    try {
      await assert.rejects(
        () => adapter.getStatus(plainDir),
        (error: unknown) => {
          assert.ok(error instanceof GitWorkspaceError);
          assert.strictEqual(error.code, ErrorCodes.RepositoryNotFound);
          return true;
        }
      );
    } finally {
      rmSync(plainDir, { recursive: true, force: true });
    }
  });

  it("throws a classified error when merging a non-existent branch", async () => {
    await assert.rejects(
      () => adapter.mergeBranch(repoDir, "does-not-exist"),
      (error: unknown) => {
        assert.ok(error instanceof GitWorkspaceError);
        return true;
      }
    );
  });

  it("getLog returns commits newest-first with parent hashes and HEAD ref", async () => {
    writeFile(repoDir, "second.txt", "content\n");
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-q", "-m", "second commit"]);

    const log = await adapter.getLog(repoDir);

    assert.strictEqual(log.length, 2);
    assert.strictEqual(log[0]?.subject, "second commit");
    assert.strictEqual(log[1]?.subject, "initial commit");
    assert.deepStrictEqual(log[0]?.parentHashes, [log[1]?.hash]);
    assert.ok(log[0]?.refs.some((ref) => ref.isHead));
  });

  it("getLog reports two parent hashes for a merge commit", async () => {
    git(repoDir, ["checkout", "-q", "-b", "feature"]);
    writeFile(repoDir, "feature.txt", "content\n");
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-q", "-m", "feature commit"]);

    git(repoDir, ["checkout", "-q", "main"]);
    writeFile(repoDir, "main.txt", "content\n");
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-q", "-m", "main commit"]);

    git(repoDir, ["merge", "--no-ff", "-q", "-m", "merge feature", "feature"]);

    const log = await adapter.getLog(repoDir);
    const mergeCommit = log.find((entry) => entry.subject === "merge feature");

    assert.strictEqual(mergeCommit?.parentHashes.length, 2);
  });

  it("getLog returns an empty array for a repository with no commits", async () => {
    const emptyRepoDir = mkdtempSync(path.join(tmpdir(), "gwp-empty-"));
    git(emptyRepoDir, ["init", "--quiet", "--initial-branch=main"]);

    try {
      const log = await adapter.getLog(emptyRepoDir);
      assert.deepStrictEqual(log, []);
    } finally {
      rmSync(emptyRepoDir, { recursive: true, force: true });
    }
  });

  it("getCommitDiffFiles lists the files changed by a commit", async () => {
    writeFile(repoDir, "changed.txt", "content\n");
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-q", "-m", "add changed.txt"]);

    const log = await adapter.getLog(repoDir);
    const latestHash = log[0]?.hash ?? "";
    const files = await adapter.getCommitDiffFiles(repoDir, latestHash);

    assert.deepStrictEqual(files, ["changed.txt"]);
  });
});
