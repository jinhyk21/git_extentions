import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runTests } from "@vscode/test-electron";

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

/**
 * When this runs from a terminal inside VS Code (or another Electron app) the
 * parent leaks ELECTRON_RUN_AS_NODE / VSCODE_* variables, which make the test
 * host start as plain Node and reject its own CLI flags.
 */
function scrubInheritedElectronEnvironment(): void {
  delete process.env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("VSCODE_")) {
      delete process.env[key];
    }
  }
}

async function main(): Promise<void> {
  scrubInheritedElectronEnvironment();
  // out-test/test/vscode/runTest.js -> repository root
  const extensionDevelopmentPath = path.resolve(__dirname, "../../..");
  const extensionTestsPath = path.resolve(__dirname, "suite/index");

  // Fixture workspace: one repository with an unstaged change.
  const workspace = mkdtempSync(path.join(tmpdir(), "gwp-vscode-ws-"));
  git(workspace, ["init", "--quiet", "--initial-branch=main"]);
  git(workspace, ["config", "user.email", "test@example.com"]);
  git(workspace, ["config", "user.name", "Test"]);
  writeFileSync(path.join(workspace, "README.md"), "hello\n");
  git(workspace, ["add", "."]);
  git(workspace, ["commit", "--quiet", "-m", "initial"]);
  writeFileSync(path.join(workspace, "README.md"), "hello world\n");

  const userDataDir = mkdtempSync(path.join(tmpdir(), "gwp-vscode-user-"));
  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspace, "--disable-extensions", "--user-data-dir", userDataDir],
      extensionTestsEnv: { GWP_TEST_WORKSPACE: workspace }
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error("VS Code smoke tests failed:", error);
  process.exit(1);
});
