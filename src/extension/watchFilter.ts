/** Directories whose churn (installs, builds, caches) never changes what Git reports. */
const NOISY_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".gradle",
  ".idea",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
  "dist",
  "out",
  "build",
  "target"
]);

/**
 * True when a file-system event is not worth a `git status`: it is inside .git,
 * a dependency/build/cache directory, or a directory the user excluded from scanning.
 * Build output is usually gitignored, and a build can emit tens of thousands of events.
 */
export function isNoisyPath(fsPath: string, extraDirectories: ReadonlySet<string> = new Set()): boolean {
  for (const segment of fsPath.split(/[/\\]/)) {
    if (NOISY_DIRECTORIES.has(segment) || extraDirectories.has(segment)) {
      return true;
    }
  }

  return false;
}
