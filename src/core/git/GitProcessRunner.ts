import { spawn, type ChildProcess } from "node:child_process";

export type GitProcessResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const KILL_ESCALATION_MS = 2_000;

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) {
    return;
  }
  if (process.platform === "win32") {
    // SIGTERM is a no-op for most Windows processes; taskkill also reaches git's children.
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }, KILL_ESCALATION_MS).unref();
}

export class GitProcessRunner {
  public run(args: readonly string[], cwd: string, timeoutMs = 10_000): Promise<GitProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", [...args], {
        cwd,
        shell: false,
        windowsHide: true,
        env: {
          ...localeNeutralEnv(),
          // Never block on a credential prompt nobody can answer; fail fast instead.
          GIT_TERMINAL_PROMPT: "0",
          GIT_EDITOR: "true",
          GIT_SEQUENCE_EDITOR: "true",
          GIT_MERGE_AUTOEDIT: "no"
        }
      });

      let stdout = "";
      let stderr = "";

      let outputBytes = 0;

      const timer = setTimeout(() => {
        killProcessTree(child);
        reject(new Error(`timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const collect = (chunk: Buffer): string => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_OUTPUT_BYTES) {
          clearTimeout(timer);
          killProcessTree(child);
          reject(new Error(`git output exceeded ${MAX_OUTPUT_BYTES} bytes`));
          return "";
        }
        return chunk.toString("utf8");
      };

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += collect(chunk);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += collect(chunk);
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

/**
 * Git messages are matched by regex in classifyGitError, so force English
 * messages. LC_ALL would override LC_MESSAGES, so drop it rather than set it;
 * that keeps the user's encoding/collation settings untouched.
 */
function localeNeutralEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, LC_MESSAGES: "C", LANGUAGE: "C" };
  delete env.LC_ALL;
  return env;
}
