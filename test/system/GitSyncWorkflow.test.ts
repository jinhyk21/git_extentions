import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GitAdapter } from "../../src/core/git/GitAdapter";

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd }).toString("utf8").trim();
}

function configureIdentity(repositoryPath: string): void {
  git(repositoryPath, ["config", "user.email", "qa@example.com"]);
  git(repositoryPath, ["config", "user.name", "QA"]);
}

describe("Git sync workflow (system)", () => {
  let workDirectory: string;
  let remoteDirectory: string;
  let localDirectory: string;
  let workerDirectory: string;
  let adapter: GitAdapter;

  beforeEach(() => {
    workDirectory = mkdtempSync(path.join(tmpdir(), "gwp-system-sync-"));
    remoteDirectory = path.join(workDirectory, "remote.git");
    const seedDirectory = path.join(workDirectory, "seed");
    localDirectory = path.join(workDirectory, "local");
    workerDirectory = path.join(workDirectory, "worker");

    mkdirSync(seedDirectory);
    git(workDirectory, ["init", "--bare", "--quiet", remoteDirectory]);
    git(seedDirectory, ["init", "--quiet", "--initial-branch=main"]);
    configureIdentity(seedDirectory);
    writeFileSync(path.join(seedDirectory, "README.md"), "initial\n");
    git(seedDirectory, ["add", "."]);
    git(seedDirectory, ["commit", "--quiet", "-m", "initial"]);
    git(seedDirectory, ["remote", "add", "origin", remoteDirectory]);
    git(seedDirectory, ["push", "--quiet", "-u", "origin", "main"]);
    git(remoteDirectory, ["symbolic-ref", "HEAD", "refs/heads/main"]);

    git(workDirectory, ["clone", "--quiet", remoteDirectory, localDirectory]);
    git(workDirectory, ["clone", "--quiet", remoteDirectory, workerDirectory]);
    configureIdentity(localDirectory);
    configureIdentity(workerDirectory);
    adapter = new GitAdapter();
  });

  afterEach(() => {
    rmSync(workDirectory, { recursive: true, force: true });
  });

  it("supports fast-forward, rejects divergent ff-only, rebases, and merges explicitly", async () => {
    writeFileSync(path.join(workerDirectory, "remote-1.txt"), "remote 1\n");
    git(workerDirectory, ["add", "."]);
    git(workerDirectory, ["commit", "--quiet", "-m", "remote 1"]);
    git(workerDirectory, ["push", "--quiet"]);

    await adapter.pull(localDirectory, "ff-only");
    assert.strictEqual(git(localDirectory, ["show", "HEAD:remote-1.txt"]), "remote 1");

    writeFileSync(path.join(localDirectory, "local-1.txt"), "local 1\n");
    git(localDirectory, ["add", "."]);
    git(localDirectory, ["commit", "--quiet", "-m", "local 1"]);
    writeFileSync(path.join(workerDirectory, "remote-2.txt"), "remote 2\n");
    git(workerDirectory, ["add", "."]);
    git(workerDirectory, ["commit", "--quiet", "-m", "remote 2"]);
    git(workerDirectory, ["push", "--quiet"]);

    await assert.rejects(() => adapter.pull(localDirectory, "ff-only"));
    await adapter.pull(localDirectory, "rebase");
    assert.strictEqual(git(localDirectory, ["show", "HEAD:local-1.txt"]), "local 1");
    assert.strictEqual(git(localDirectory, ["show", "HEAD:remote-2.txt"]), "remote 2");
    assert.strictEqual(git(localDirectory, ["show", "-s", "--format=%P", "HEAD"]).split(" ").length, 1);

    git(workerDirectory, ["pull", "--quiet", "--ff-only"]);
    writeFileSync(path.join(workerDirectory, "remote-3.txt"), "remote 3\n");
    git(workerDirectory, ["add", "."]);
    git(workerDirectory, ["commit", "--quiet", "-m", "remote 3"]);
    git(workerDirectory, ["push", "--quiet"]);
    writeFileSync(path.join(localDirectory, "local-2.txt"), "local 2\n");
    git(localDirectory, ["add", "."]);
    git(localDirectory, ["commit", "--quiet", "-m", "local 2"]);

    await adapter.pull(localDirectory, "merge");
    assert.strictEqual(git(localDirectory, ["show", "-s", "--format=%P", "HEAD"]).split(" ").length, 2);
    assert.strictEqual(git(localDirectory, ["show", "HEAD:remote-3.txt"]), "remote 3");
    assert.strictEqual(git(localDirectory, ["show", "HEAD:local-2.txt"]), "local 2");
  });
});
