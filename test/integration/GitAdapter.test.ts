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

  it("unstages a file in a repository with no commits", async () => {
    const emptyRepoDir = mkdtempSync(path.join(tmpdir(), "gwp-unborn-"));
    git(emptyRepoDir, ["init", "--quiet", "--initial-branch=main"]);
    writeFile(emptyRepoDir, "first.txt", "content\n");
    git(emptyRepoDir, ["add", "first.txt"]);

    try {
      await adapter.unstageFile(emptyRepoDir, "first.txt");
      const status = await adapter.getStatus(emptyRepoDir);
      assert.strictEqual(status.counts.staged, 0);
      assert.strictEqual(status.counts.untracked, 1);
    } finally {
      rmSync(emptyRepoDir, { recursive: true, force: true });
    }
  });

  it("detects, continues, and completes a merge conflict", async () => {
    git(repoDir, ["checkout", "-q", "-b", "feature"]);
    writeFile(repoDir, "README.md", "feature\n");
    git(repoDir, ["commit", "-qam", "feature"]);
    git(repoDir, ["checkout", "-q", "main"]);
    writeFile(repoDir, "README.md", "main\n");
    git(repoDir, ["commit", "-qam", "main"]);

    await assert.rejects(() => adapter.mergeBranch(repoDir, "feature"));
    let status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.operation?.type, "merge");
    assert.strictEqual(status.counts.conflicted, 1);

    writeFile(repoDir, "README.md", "resolved\n");
    await adapter.markResolved(repoDir, "README.md");
    await adapter.continueOperation(repoDir, "merge");

    status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.operation, undefined);
    assert.strictEqual(status.counts.conflicted, 0);
  });

  it("detects and aborts a merge conflict", async () => {
    git(repoDir, ["checkout", "-q", "-b", "feature"]);
    writeFile(repoDir, "README.md", "feature\n");
    git(repoDir, ["commit", "-qam", "feature"]);
    git(repoDir, ["checkout", "-q", "main"]);
    writeFile(repoDir, "README.md", "main\n");
    git(repoDir, ["commit", "-qam", "main"]);

    await assert.rejects(() => adapter.mergeBranch(repoDir, "feature"));
    await adapter.abortOperation(repoDir, "merge");

    const status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.operation, undefined);
    assert.strictEqual(status.counts.conflicted, 0);
    assert.strictEqual(execFileSync("git", ["show", "HEAD:README.md"], { cwd: repoDir }).toString(), "main\n");
  });

  it("detects, continues, and completes a rebase conflict", async () => {
    git(repoDir, ["checkout", "-q", "-b", "feature"]);
    writeFile(repoDir, "README.md", "feature\n");
    git(repoDir, ["commit", "-qam", "feature"]);
    git(repoDir, ["checkout", "-q", "main"]);
    writeFile(repoDir, "README.md", "main\n");
    git(repoDir, ["commit", "-qam", "main"]);
    git(repoDir, ["checkout", "-q", "feature"]);

    await assert.rejects(() => adapter.rebaseBranch(repoDir, "main"));
    let status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.operation?.type, "rebase");
    assert.strictEqual(status.counts.conflicted, 1);

    writeFile(repoDir, "README.md", "resolved\n");
    await adapter.markResolved(repoDir, "README.md");
    await adapter.continueOperation(repoDir, "rebase");

    status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.operation, undefined);
    assert.strictEqual(status.counts.conflicted, 0);
  });

  it("detects and aborts a rebase conflict", async () => {
    git(repoDir, ["checkout", "-q", "-b", "feature"]);
    writeFile(repoDir, "README.md", "feature\n");
    git(repoDir, ["commit", "-qam", "feature"]);
    git(repoDir, ["checkout", "-q", "main"]);
    writeFile(repoDir, "README.md", "main\n");
    git(repoDir, ["commit", "-qam", "main"]);
    git(repoDir, ["checkout", "-q", "feature"]);

    await assert.rejects(() => adapter.rebaseBranch(repoDir, "main"));
    await adapter.abortOperation(repoDir, "rebase");

    const status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.operation, undefined);
    assert.strictEqual(status.branch, "feature");
    assert.strictEqual(execFileSync("git", ["show", "HEAD:README.md"], { cwd: repoDir }).toString(), "feature\n");
  });

  it("reports missing/current/incoming stages for a modify-delete conflict", async () => {
    git(repoDir, ["checkout", "-q", "-b", "feature"]);
    writeFile(repoDir, "README.md", "feature changed\n");
    git(repoDir, ["commit", "-qam", "modify readme"]);
    git(repoDir, ["checkout", "-q", "main"]);
    git(repoDir, ["rm", "-q", "README.md"]);
    git(repoDir, ["commit", "-qm", "delete readme"]);

    await assert.rejects(() => adapter.mergeBranch(repoDir, "feature"));

    assert.strictEqual(await adapter.hasConflictStage(repoDir, "README.md", 1), true);
    assert.strictEqual(await adapter.hasConflictStage(repoDir, "README.md", 2), false);
    assert.strictEqual(await adapter.hasConflictStage(repoDir, "README.md", 3), true);

    await adapter.resolveConflictWithSide(repoDir, "README.md", "current");
    await adapter.continueOperation(repoDir, "merge");

    assert.throws(() => {
      execFileSync("git", ["cat-file", "-e", "HEAD:README.md"], { cwd: repoDir, stdio: "ignore" });
    });
  });

  it("skips the conflicting commit in an in-progress rebase", async () => {
    git(repoDir, ["checkout", "-q", "-b", "feature"]);
    writeFile(repoDir, "README.md", "feature\n");
    git(repoDir, ["commit", "-qam", "feature conflict"]);
    git(repoDir, ["checkout", "-q", "main"]);
    writeFile(repoDir, "README.md", "main\n");
    git(repoDir, ["commit", "-qam", "main conflict"]);
    git(repoDir, ["checkout", "-q", "feature"]);

    await assert.rejects(() => adapter.rebaseBranch(repoDir, "main"));
    await adapter.skipOperation(repoDir, "rebase");

    const status = await adapter.getStatus(repoDir);
    assert.strictEqual(status.operation, undefined);
    assert.strictEqual(execFileSync("git", ["show", "HEAD:README.md"], { cwd: repoDir }).toString(), "main\n");
    assert.doesNotMatch(execFileSync("git", ["log", "--format=%s"], { cwd: repoDir }).toString(), /feature conflict/);
  });

  it("resolves a binary merge conflict by keeping the incoming side", async () => {
    const binaryPath = path.join(repoDir, "asset.bin");
    writeFileSync(binaryPath, Buffer.from([0, 1, 2, 3]));
    git(repoDir, ["add", "asset.bin"]);
    git(repoDir, ["commit", "-qm", "add binary"]);
    git(repoDir, ["checkout", "-q", "-b", "feature"]);
    writeFileSync(binaryPath, Buffer.from([0, 9, 9, 9]));
    git(repoDir, ["commit", "-qam", "feature binary"]);
    git(repoDir, ["checkout", "-q", "main"]);
    writeFileSync(binaryPath, Buffer.from([0, 8, 8, 8]));
    git(repoDir, ["commit", "-qam", "main binary"]);

    await assert.rejects(() => adapter.mergeBranch(repoDir, "feature"));
    assert.match(await adapter.readConflictStage(repoDir, "asset.bin", 3), /\0/);
    await adapter.resolveConflictWithSide(repoDir, "asset.bin", "incoming");
    await adapter.continueOperation(repoDir, "merge");

    assert.deepStrictEqual(
      execFileSync("git", ["show", "HEAD:asset.bin"], { cwd: repoDir }),
      Buffer.from([0, 9, 9, 9])
    );
  });
});
