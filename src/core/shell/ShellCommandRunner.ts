import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { buildScriptFile } from "./customCommandHelpers";

export type ShellOutputStream = "stdout" | "stderr";

export type ShellRunResult = {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly stopped: boolean;
  readonly timedOut: boolean;
};

export type ShellRunOptions = {
  readonly shell?: string;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
};

export type ShellRunHandle = {
  readonly result: Promise<ShellRunResult>;
  stop(): void;
};

const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;
const KILL_ESCALATION_MS = 3_000;

/**
 * Runs a (possibly multi-line) script from a temp file inside `cwd`. This is
 * deliberately separate from GitProcessRunner: user scripts are long-running,
 * stream their output and are never parsed.
 */
export class ShellCommandRunner {
  public start(
    script: string,
    cwd: string,
    onOutput: (stream: ShellOutputStream, text: string) => void,
    options: ShellRunOptions = {}
  ): ShellRunHandle {
    let child: ChildProcess | undefined;
    let stopRequested = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;

    const kill = (signal: NodeJS.Signals) => {
      if (!child?.pid) {
        return;
      }
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        return;
      }
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // already gone
        }
      }
    };

    const stop = () => {
      stopRequested = true;
      kill("SIGTERM");
      killTimer ??= setTimeout(() => kill("SIGKILL"), KILL_ESCALATION_MS);
    };

    const result = (async (): Promise<ShellRunResult> => {
      const startedAt = Date.now();
      const directory = await mkdtemp(path.join(tmpdir(), "gwp-cmd-"));
      let timeoutTimer: NodeJS.Timeout | undefined;

      try {
        const { extension, content } = buildScriptFile(script, process.platform);
        const scriptPath = path.join(directory, `script${extension}`);
        await writeFile(scriptPath, content, { mode: 0o700 });

        if (stopRequested) {
          return { exitCode: null, signal: "SIGTERM", durationMs: Date.now() - startedAt, stopped: true, timedOut: false };
        }

        const [command, args] = this.resolveInvocation(scriptPath, options.shell);
        const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
        let emittedBytes = 0;
        let truncated = false;

        const spawned = spawn(command, args, {
          cwd,
          shell: false,
          windowsHide: true,
          detached: process.platform !== "win32",
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
        });
        child = spawned;

        const emit = (stream: ShellOutputStream, text: string) => {
          if (truncated || text.length === 0) {
            return;
          }
          const bytes = Buffer.byteLength(text);
          if (emittedBytes + bytes > maxBytes) {
            truncated = true;
            onOutput("stderr", "\n[output truncated]\n");
            return;
          }
          emittedBytes += bytes;
          onOutput(stream, text);
        };

        const attach = (stream: ShellOutputStream, source: NodeJS.ReadableStream | null) => {
          const decoder = new StringDecoder("utf8");
          source?.on("data", (chunk: Buffer) => emit(stream, decoder.write(chunk)));
          source?.on("end", () => emit(stream, decoder.end()));
        };
        attach("stdout", spawned.stdout);
        attach("stderr", spawned.stderr);

        if (options.timeoutMs && options.timeoutMs > 0) {
          timeoutTimer = setTimeout(() => {
            timedOut = true;
            stop();
          }, options.timeoutMs);
        }

        return await new Promise<ShellRunResult>((resolve) => {
          spawned.on("error", (error) => {
            emit("stderr", `${error.message}\n`);
            resolve({ exitCode: null, signal: null, durationMs: Date.now() - startedAt, stopped: stopRequested, timedOut });
          });
          spawned.on("close", (exitCode, signal) => {
            resolve({ exitCode, signal, durationMs: Date.now() - startedAt, stopped: stopRequested, timedOut });
          });
        });
      } finally {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        if (killTimer) {
          clearTimeout(killTimer);
        }
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      }
    })();

    return { result, stop };
  }

  private resolveInvocation(scriptPath: string, customShell?: string): [string, string[]] {
    const shell = customShell?.trim();
    if (process.platform === "win32") {
      // The temp file is a .cmd batch script, so a custom shell is ignored here.
      return [process.env.ComSpec ?? "cmd.exe", ["/d", "/c", scriptPath]];
    }

    return [shell || process.env.SHELL || "/bin/sh", [scriptPath]];
  }
}
