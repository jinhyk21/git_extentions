const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { GitAdapter } = require("../dist/core/git/GitAdapter");
const { RepositoryScanner } = require("../dist/core/repository/RepositoryScanner");

function git(cwd, args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.max(0, index)];
}

async function measure(action, iterations) {
  const values = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    await action();
    values.push(performance.now() - startedAt);
  }
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: Math.max(...values)
  };
}

async function main() {
  const root = mkdtempSync(path.join(tmpdir(), "gwp-qa-performance-"));
  const primaryRepository = path.join(root, "primary");
  mkdirSync(primaryRepository);
  git(primaryRepository, ["init", "--quiet", "--initial-branch=main"]);
  git(primaryRepository, ["config", "user.email", "qa@example.com"]);
  git(primaryRepository, ["config", "user.name", "QA"]);
  writeFileSync(path.join(primaryRepository, "README.md"), "performance\n");
  git(primaryRepository, ["add", "."]);
  git(primaryRepository, ["commit", "--quiet", "-m", "initial"]);

  try {
    const adapter = new GitAdapter();
    await adapter.getStatus(primaryRepository);
    await adapter.getLog(primaryRepository);

    const status = await measure(() => adapter.getStatus(primaryRepository), 30);
    const history = await measure(() => adapter.getLog(primaryRepository), 15);

    const repositoryFarm = path.join(root, "repositories");
    mkdirSync(repositoryFarm);
    for (let index = 0; index < 100; index += 1) {
      const repositoryPath = path.join(repositoryFarm, `repo-${String(index).padStart(3, "0")}`);
      mkdirSync(repositoryPath);
      git(repositoryPath, ["init", "--quiet"]);
    }
    const scanner = new RepositoryScanner();
    const scanStartedAt = performance.now();
    const repositories = await scanner.scan([repositoryFarm]);
    const scanMs = performance.now() - scanStartedAt;
    const memoryMb = process.memoryUsage().rss / 1024 / 1024;

    const report = {
      status,
      history,
      repositoryScan: {
        repositories: repositories.length,
        durationMs: scanMs
      },
      memoryMb,
      criteria: {
        statusP95Ms: 300,
        historyP95Ms: 500,
        scan100RepositoriesMs: 15000,
        memoryMb: 300
      }
    };
    console.log(JSON.stringify(report, null, 2));

    const failures = [];
    if (status.p95Ms >= 300) failures.push(`status p95 ${status.p95Ms.toFixed(2)}ms >= 300ms`);
    if (history.p95Ms >= 500) failures.push(`history p95 ${history.p95Ms.toFixed(2)}ms >= 500ms`);
    if (repositories.length !== 100) failures.push(`scanner found ${repositories.length}/100 repositories`);
    if (scanMs >= 15000) failures.push(`100-repository scan ${scanMs.toFixed(2)}ms >= 15000ms`);
    if (memoryMb >= 300) failures.push(`memory ${memoryMb.toFixed(2)}MB >= 300MB`);
    if (failures.length > 0) {
      throw new Error(failures.join("; "));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
