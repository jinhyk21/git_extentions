import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RepositoryManager } from "../../src/core/repository/RepositoryManager";

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  writeFileSync(path.join(dir, "README.md"), "hello\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "--quiet", "-m", "initial commit"], { cwd: dir });
}

describe("RepositoryManager (integration)", () => {
  let workDir: string;
  let manager: RepositoryManager;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), "gwp-manager-"));
    manager = new RepositoryManager();
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("loads status for every discovered repository on refresh", async () => {
    initRepo(workDir);

    const repositories = await manager.refresh([workDir]);

    assert.strictEqual(repositories.length, 1);
    assert.strictEqual(repositories[0]?.status?.branch, "main");
    assert.strictEqual(repositories[0]?.statusError, undefined);
  });

  it("finds the owning repository for a nested file path", async () => {
    initRepo(workDir);
    await manager.refresh([workDir]);

    const filePath = path.join(workDir, "src", "index.ts");
    const found = manager.findRepositoryForPath(filePath);

    assert.strictEqual(found?.rootPath, workDir);
  });

  it("returns undefined when no repository owns the given path", async () => {
    initRepo(workDir);
    await manager.refresh([workDir]);

    const outsideDir = mkdtempSync(path.join(tmpdir(), "gwp-outside-"));
    try {
      const found = manager.findRepositoryForPath(path.join(outsideDir, "file.txt"));
      assert.strictEqual(found, undefined);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("selects the deepest matching repository when repositories are nested", async () => {
    initRepo(workDir);
    const nestedDir = path.join(workDir, "packages", "child");
    initRepo(nestedDir);

    await manager.refresh([workDir]);

    const found = manager.findRepositoryForPath(path.join(nestedDir, "src", "file.ts"));
    assert.strictEqual(found?.rootPath, nestedDir);
  });

  it("refreshRepositoryStatus updates only the targeted repository in place", async () => {
    initRepo(workDir);
    const siblingDir = path.join(workDir, "..", path.basename(workDir) + "-sibling");
    initRepo(siblingDir);

    try {
      await manager.refresh([workDir, siblingDir]);
      writeFileSync(path.join(workDir, "new.txt"), "content\n");

      await manager.refreshRepositoryStatus(workDir);

      const repositories = manager.getRepositories();
      const updated = repositories.find((repository) => repository.rootPath === workDir);
      const sibling = repositories.find((repository) => repository.rootPath === siblingDir);

      assert.strictEqual(updated?.status?.counts.untracked, 1);
      assert.strictEqual(sibling?.status?.counts.untracked, 0);
    } finally {
      rmSync(siblingDir, { recursive: true, force: true });
    }
  });

  it("records statusError instead of throwing when a repository becomes unreadable", async () => {
    initRepo(workDir);
    await manager.refresh([workDir]);

    rmSync(path.join(workDir, ".git"), { recursive: true, force: true });
    await manager.refreshRepositoryStatus(workDir);

    const repositories = manager.getRepositories();
    const updated = repositories.find((repository) => repository.rootPath === workDir);

    assert.strictEqual(updated?.status, undefined);
    assert.ok(updated?.statusError && updated.statusError.length > 0);
  });

  it("returns an empty string for a stage that has no entry (clean repository)", async () => {
    initRepo(workDir);
    await manager.refresh([workDir]);

    const content = await manager.readConflictStage(workDir, "README.md", 2);
    assert.strictEqual(content, "");
  });

  it("reads ours/theirs blobs for a file with a real merge conflict", async () => {
    initRepo(workDir);
    execFileSync("git", ["checkout", "-b", "feature"], { cwd: workDir });
    writeFileSync(path.join(workDir, "README.md"), "feature version\n");
    execFileSync("git", ["commit", "-am", "feature change"], { cwd: workDir });

    execFileSync("git", ["checkout", "main"], { cwd: workDir });
    writeFileSync(path.join(workDir, "README.md"), "main version\n");
    execFileSync("git", ["commit", "-am", "main change"], { cwd: workDir });

    try {
      execFileSync("git", ["merge", "feature"], { cwd: workDir });
    } catch {
      // Expected: merge stops with a conflict.
    }

    await manager.refresh([workDir]);

    const ours = await manager.readConflictStage(workDir, "README.md", 2);
    const theirs = await manager.readConflictStage(workDir, "README.md", 3);

    assert.strictEqual(ours, "main version\n");
    assert.strictEqual(theirs, "feature version\n");
  });
});
