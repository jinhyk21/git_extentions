# Task Breakdown

## Milestone 1: Project Skeleton

- Done: Create VS Code extension manifest.
- Done: Add TypeScript config.
- Done: Add lint config.
- Done: Add extension activation entry.
- Done: Add repository tree view contribution.
- Done: Add refresh repositories command.
- Done: Create Git process runner.
- Done: Create Git adapter.
- Done: Create repository scanner.
- Done: Create repository manager.
- Done: Create shared repository types.
- Done: Create initial documentation.
- Done: Create AI coding rules.
- Done: Compile project.

## Milestone 2: Repository Status

- Done: Parse porcelain status into file-level models.
- Done: Display staged, unstaged, untracked, and conflicted file groups.
- Done: Add file tree nodes below each repository.
- Done: Add open diff action.
- Done: Add stage and unstage actions.
- Done: Add repository refresh after file actions.
- Done: Auto-refresh repository status on file system changes (debounced file watcher).
- Done: Show ahead/behind counts, including repositories with no upstream branch.
- Done: Surface status-read failures on the repository node instead of silently hiding them.

## Milestone 3: Commit

- Done: Create commit command.
- Done: Add commit message input.
- Done: Support stage all then commit.
- Done: Refresh repository status after commit.
- Pending: Validate staged files before allowing commit.
- Pending: Handle hook failures with a dedicated message (currently surfaced as a generic Git error).

## Milestone 4: Branch Manager

- Done: Checkout branch.
- Done: Create branch.
- Done: Delete branch with confirmation.
- Done: Merge branch (with destructive-action confirmation).
- Done: Rebase onto branch (with destructive-action confirmation).
- Pending: List local vs. remote branches separately (current picker lists local branches only).
- Pending: Detect and warn on dirty working tree before checkout/merge/rebase.

## Milestone 5: Sync

- Done: Fetch repository.
- Done: Pull repository.
- Done: Pull from a selected branch.
- Done: Push repository (with upstream tracking via `-u`).
- Done: Detect and surface a merge/pull request URL from push output.
- Done: Classify Git errors (auth, network, rejected push, etc.) via `classifyGitError`.
- Pending: Dedicated retry/guidance UX per error category (currently a single error message).

## Milestone 6: History

- Done: Add history webview.
- Done: Parse `git log` (machine-readable format, including parent hashes and ref names).
- Done: Show commit list with author, date, subject, and branch/tag/remote ref badges.
- Done: Render a commit graph (lane/column assignment and merge edges) alongside the list.
- Done: Open commit diff (per-file two-way diff via the `git:` content provider; falls back to opening the file directly for root commits with no parent).
- Pending: Show full commit details (body, stats) in a dedicated panel.

## Milestone 7: Merge/Rebase/Conflict

- Done: Add merge command with confirmation.
- Done: Add rebase command with confirmation.
- Done: Detect conflict state (conflicted file group in the tree, repository-level conflict indicator).
- Done: Add stash push/pop (stash pop requires confirmation).
- Done: Custom conflict resolution webview (3-way view: current / incoming / editable result).
- Done: Mark conflict resolved (writes resolved content, then stages the file).
- Done: Continue or abort an in-progress merge/rebase/cherry-pick/revert operation.
- Done: Skip the current rebase/cherry-pick/revert step.
- Done: Repository operation row with conflict count and operation actions.
- Done: Navigate automatically to the next conflicted file.
- Done: Resolve modify/delete and binary conflicts by choosing a complete side.

## Cross-cutting: Quality & CI

- Done: CI runs the full test suite on `ubuntu-latest`, `windows-latest`, and `macos-latest`.
- Done: `RepositoryManager.findRepositoryForPath` uses `path.sep` instead of a hardcoded `/`, so path matching works on Windows.
- Done: Unit tests for pure command-guard logic (`commandGuards.ts`) that do not require mocking the `vscode` module.
