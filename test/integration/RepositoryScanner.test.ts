import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RepositoryScanner } from "../../src/core/repository/RepositoryScanner";

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

describe("RepositoryScanner", () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), "gwp-scanner-"));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("finds a single repository at the workspace root", async () => {
    initRepo(workDir);

    const scanner = new RepositoryScanner();
    const result = await scanner.scan([workDir]);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.rootPath, workDir);
    assert.strictEqual(result[0]?.isNested, false);
  });

  it("finds a nested repository and marks it as nested with a parent", async () => {
    initRepo(workDir);
    const nestedDir = path.join(workDir, "packages", "child");
    initRepo(nestedDir);

    const scanner = new RepositoryScanner();
    const result = await scanner.scan([workDir]);

    assert.strictEqual(result.length, 1);
    const root = result[0];
    assert.strictEqual(root?.children.length, 1);
    assert.strictEqual(root?.children[0]?.rootPath, nestedDir);
    assert.strictEqual(root?.children[0]?.isNested, true);
    assert.strictEqual(root?.children[0]?.parentId, root.id);
  });

  it("returns no repositories for a plain directory with no .git", async () => {
    mkdirSync(workDir, { recursive: true });

    const scanner = new RepositoryScanner();
    const result = await scanner.scan([workDir]);

    assert.strictEqual(result.length, 0);
  });

  it("skips ignored directories like node_modules", async () => {
    initRepo(workDir);
    const ignoredNested = path.join(workDir, "node_modules", "some-pkg");
    initRepo(ignoredNested);

    const scanner = new RepositoryScanner();
    const result = await scanner.scan([workDir]);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.children.length, 0);
  });

  it("deduplicates identical workspace roots", async () => {
    initRepo(workDir);

    const scanner = new RepositoryScanner();
    const result = await scanner.scan([workDir, workDir]);

    assert.strictEqual(result.length, 1);
  });
});
