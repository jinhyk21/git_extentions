import * as assert from "node:assert";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ShellCommandRunner } from "../../src/core/shell/ShellCommandRunner";

describe("ShellCommandRunner (integration)", () => {
  const runner = new ShellCommandRunner();
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "gwp-shell-")));

  const collect = () => {
    const chunks: { stream: string; text: string }[] = [];
    return {
      onOutput: (stream: string, text: string) => chunks.push({ stream, text }),
      text: (stream: string) => chunks.filter((chunk) => chunk.stream === stream).map((chunk) => chunk.text).join("")
    };
  };

  it("runs a multi-line script and reports exit code 0", async () => {
    const output = collect();
    const handle = runner.start("echo first\necho second", cwd, output.onOutput);
    const result = await handle.result;

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stopped, false);
    assert.match(output.text("stdout"), /first[\s\S]*second/);
  });

  it("reports a non-zero exit code", async () => {
    const output = collect();
    const result = await runner.start("exit 3", cwd, output.onOutput).result;

    assert.strictEqual(result.exitCode, 3);
  });

  it("runs inside the requested working directory", async () => {
    const output = collect();
    await runner.start(process.platform === "win32" ? "cd" : "pwd", cwd, output.onOutput).result;

    assert.strictEqual(path.resolve(output.text("stdout").trim()), cwd);
  });

  it("stops a long-running command", async function () {
    this.timeout(15_000);
    const output = collect();
    const handle = runner.start('node -e "setTimeout(function(){},30000)"', cwd, output.onOutput);
    setTimeout(() => handle.stop(), 500);
    const result = await handle.result;

    assert.strictEqual(result.stopped, true);
    assert.notStrictEqual(result.exitCode, 0);
  });

  it("stops a command that exceeds the timeout", async function () {
    this.timeout(15_000);
    const output = collect();
    const result = await runner.start('node -e "setTimeout(function(){},30000)"', cwd, output.onOutput, {
      timeoutMs: 500
    }).result;

    assert.strictEqual(result.timedOut, true);
  });

  it("truncates output beyond the configured limit", async () => {
    const output = collect();
    await runner.start('node -e "console.log(\'x\'.repeat(5000))"', cwd, output.onOutput, {
      maxOutputBytes: 100
    }).result;

    assert.match(output.text("stderr"), /output truncated/);
    assert.ok(output.text("stdout").length <= 100);
  });
});
