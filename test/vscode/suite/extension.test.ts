import * as assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as vscode from "vscode";

const EXTENSION_ID = "jinhy.git-workspace-pro";

describe("Git Workspace Pro (VS Code host smoke)", () => {
  const manifest = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../../../package.json"), "utf8")
  ) as { contributes: { commands: { command: string }[] } };

  before(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} must be installed in the test host`);
    await extension.activate();
  });

  it("activates", () => {
    assert.strictEqual(vscode.extensions.getExtension(EXTENSION_ID)?.isActive, true);
  });

  it("registers every command contributed by the manifest", async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    const missing = manifest.contributes.commands.map((entry) => entry.command).filter((id) => !registered.has(id));

    assert.deepStrictEqual(missing, []);
  });

  it("refreshes repositories without throwing", async () => {
    await vscode.commands.executeCommand("gitWorkspacePro.refreshRepositories");
  });

  it("opens the Run Command panel for a repository", async () => {
    const workspace = process.env.GWP_TEST_WORKSPACE;
    assert.ok(workspace);

    await vscode.commands.executeCommand("gitWorkspacePro.runCustomCommand", {
      id: workspace,
      name: "fixture",
      rootPath: workspace,
      children: [],
      isNested: false,
      isSubmodule: false
    });

    const findTab = () =>
      vscode.window.tabGroups.all.flatMap((group) => group.tabs).find((candidate) => /Run Command|Chạy lệnh/.test(candidate.label));
    // Tab groups update asynchronously after the webview panel is created.
    for (let attempt = 0; attempt < 30 && !findTab(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const labels = vscode.window.tabGroups.all.flatMap((group) => group.tabs.map((tab) => tab.label));
    assert.ok(findTab(), `the Run Command webview tab should be open; tabs: ${JSON.stringify(labels)}`);
  });

  it("exposes the new settings with their defaults", () => {
    const config = vscode.workspace.getConfiguration("gitWorkspacePro");
    assert.strictEqual(config.get("pullStrategy"), "ask");
    assert.strictEqual(config.get("history.maxCount"), 300);
    assert.strictEqual(config.get("scan.maxDepth"), 0);
    assert.deepStrictEqual(config.get("scan.excludeDirectories"), []);
    assert.strictEqual(config.get("customCommand.historySize"), 30);
  });
});
