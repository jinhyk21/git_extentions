import { existsSync, statSync } from "node:fs";
import path from "node:path";

export const MAX_COMMAND_LENGTH = 100_000;

/**
 * Resolves a user-typed working directory relative to the repository root.
 * An empty value means the repository root. The result must stay inside the
 * repository and be an existing directory.
 */
export function resolveWorkingDirectory(
  repositoryRoot: string,
  relativeDirectory: string
): { readonly directory: string } | { readonly error: "outside" | "missing" } {
  const trimmed = relativeDirectory.trim();
  if (trimmed.length === 0) {
    return { directory: repositoryRoot };
  }

  const root = path.resolve(repositoryRoot);
  const target = path.resolve(root, trimmed);
  const relation = path.relative(root, target);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    return { error: "outside" };
  }

  try {
    if (!existsSync(target) || !statSync(target).isDirectory()) {
      return { error: "missing" };
    }
  } catch {
    return { error: "missing" };
  }

  return { directory: target };
}

/** Newest first, de-duplicated, blank entries dropped, capped at `maxItems`. */
export function addToHistory(history: readonly string[], script: string, maxItems: number): string[] {
  const entry = script.trim();
  if (entry.length === 0) {
    return history.slice(0, Math.max(0, maxItems));
  }

  return [entry, ...history.filter((item) => item !== entry)].slice(0, Math.max(0, maxItems));
}

/** Builds the temp script file content for the current platform. */
export function buildScriptFile(
  script: string,
  platform: NodeJS.Platform
): { readonly extension: string; readonly content: string } {
  const normalized = script.replace(/\r\n?/g, "\n");
  if (platform === "win32") {
    return { extension: ".cmd", content: `@echo off\r\n${normalized.split("\n").join("\r\n")}\r\n` };
  }

  return { extension: ".sh", content: `${normalized}\n` };
}

export function isRunCommandMessage(value: unknown): value is {
  readonly type: "run";
  readonly script: string;
  readonly cwd: string;
  readonly autoRefresh: boolean;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "run" &&
    "script" in value &&
    typeof value.script === "string" &&
    "cwd" in value &&
    typeof value.cwd === "string" &&
    "autoRefresh" in value &&
    typeof value.autoRefresh === "boolean"
  );
}
