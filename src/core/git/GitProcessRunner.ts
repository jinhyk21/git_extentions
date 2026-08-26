import { spawn } from "node:child_process";

export type GitProcessResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export class GitProcessRunner {
  public run(args: readonly string[], cwd: string, timeoutMs = 10_000): Promise<GitProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", [...args], {
        cwd,
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_EDITOR: "true",
          GIT_SEQUENCE_EDITOR: "true",
          GIT_MERGE_AUTOEDIT: "no"
        }
      });

      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr
        });
      });
    });
  }
}
