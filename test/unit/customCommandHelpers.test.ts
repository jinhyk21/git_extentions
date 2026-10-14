import * as assert from "node:assert";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  addToHistory,
  buildScriptFile,
  isRunCommandMessage,
  resolveWorkingDirectory
} from "../../src/core/shell/customCommandHelpers";

describe("customCommandHelpers", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gwp-helpers-"));
  mkdirSync(path.join(root, "packages", "api"), { recursive: true });

  it("resolves an empty working directory to the repository root", () => {
    assert.deepStrictEqual(resolveWorkingDirectory(root, "  "), { directory: root });
  });

  it("resolves an existing nested directory", () => {
    assert.deepStrictEqual(resolveWorkingDirectory(root, "packages/api"), {
      directory: path.join(root, "packages", "api")
    });
  });

  it("rejects directories outside the repository", () => {
    assert.deepStrictEqual(resolveWorkingDirectory(root, ".."), { error: "outside" });
    assert.deepStrictEqual(resolveWorkingDirectory(root, "../other"), { error: "outside" });
    assert.deepStrictEqual(resolveWorkingDirectory(root, path.resolve(root, "..")), { error: "outside" });
  });

  it("rejects missing directories", () => {
    assert.deepStrictEqual(resolveWorkingDirectory(root, "nope"), { error: "missing" });
  });

  it("keeps history newest-first, de-duplicated and capped", () => {
    assert.deepStrictEqual(addToHistory(["b", "a"], "a", 5), ["a", "b"]);
    assert.deepStrictEqual(addToHistory(["c", "b", "a"], "d", 3), ["d", "c", "b"]);
    assert.deepStrictEqual(addToHistory(["a"], "   ", 5), ["a"]);
    assert.deepStrictEqual(addToHistory(["a"], "x", 0), []);
  });

  it("builds platform specific script files", () => {
    assert.deepStrictEqual(buildScriptFile("a\r\nb", "linux"), { extension: ".sh", content: "a\nb\n" });
    assert.deepStrictEqual(buildScriptFile("a\nb", "win32"), { extension: ".cmd", content: "@echo off\r\na\r\nb\r\n" });
  });

  it("validates run messages from the webview", () => {
    assert.strictEqual(isRunCommandMessage({ type: "run", script: "ls", cwd: "", autoRefresh: true }), true);
    assert.strictEqual(isRunCommandMessage({ type: "run", script: 1, cwd: "", autoRefresh: true }), false);
    assert.strictEqual(isRunCommandMessage({ type: "stop" }), false);
    assert.strictEqual(isRunCommandMessage(null), false);
  });
});
