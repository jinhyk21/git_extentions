All notable changes to Git Workspace Pro are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Sidebar: tighter spacing, larger icons and buttons, and hover actions that overlay the row instead of squeezing the repository name.
- Sidebar ordering: repositories with conflicts or an operation first, then changes, then ahead/behind, clean last. Clean repositories are compact, dimmed rows under a "Clean repositories" label, and only show their branch when it differs from the most common one.
- The "show clean repositories" control is now a labelled chip with the number of clean repositories.

## [0.5.0] - 2026-10-14

### Added
- Redesigned sidebar (WebviewView): one card per repository with branch and sync badges, change counts, one-click Resolve / Pull / Push, hover quick actions (Fetch, History, Run Command, more), operation banner with Continue / Skip / Abort, inline commit box, collapsible file groups, multi-select stage/unstage, search, right-click menu, keyboard navigation, and animations that respect reduced-motion. The native tree is still available with `gitWorkspacePro.sidebar.mode = "classic"`.
- Status bar entry for the active file's repository (branch, sync, warning on conflicts/operations); click for quick actions.
- Commands and keybindings: Fetch All (`Ctrl+Alt+G F`), Quick Actions (`Ctrl+Alt+G`), Search Repositories (`Ctrl+Alt+Shift+G`); setting `sidebar.showCleanRepositories`.
- History: search (message, author, hash, branch) with highlighting, author avatars, relative dates, copy hash, Load more, keyboard navigation.
- Run Command: ANSI colors, live timer, status pill, follow-output toggle, copy output, recent-command chips.
- Commit details: author header, change bars per file, file filter.

### Changed
- After file actions and Git operations only the affected repository (and its parents) is refreshed instead of rescanning the workspace; git status loads run at most 4 at a time.
- Conflict editor: motion, focus rings and depth polish (layout and behavior unchanged).

## [0.4.0] - 2026-10-14

### Added
- "Run Command" panel: type a multi-line command (Ctrl+Enter to run), run it in the selected repository (optional sub-directory), see streamed stdout/stderr, stop it, and reuse recent commands. Available from the repository `...` menu, the repository context menu, and the Command Palette.
- Settings `gitWorkspacePro.customCommand.historySize`, `.shell`, `.autoRefresh`, `.timeoutSeconds`.
- Push and "Pull From Branch" use the branch's upstream remote, the only remote, or ask when several exist (previously always `origin`).
- Settings `gitWorkspacePro.pullStrategy` (default `ask`), `history.maxCount` (default 300), `scan.excludeDirectories`, `scan.maxDepth`.
- Commit details panel (ⓘ button in History): full message, author/committer, parents, per-file +/- stats, click a file to open its diff, copy hash.
- Branch pickers for Checkout, Merge, and Rebase group local and remote branches; checking out a remote branch creates a tracking branch.
- Commit asks to stage everything when nothing is staged, and says so when there is nothing to commit.
- Hook rejections (pre-commit, commit-msg, husky, pre-push…) get a dedicated message.
- Checkout, Merge, and Rebase warn about uncommitted changes and offer "Stash & Continue".

### Changed
- `@types/vscode` pinned to `1.90.0` so `vsce package` accepts the manifest; the untrusted-workspace capability no longer carries an unused description.
- CI runs VS Code host smoke tests and builds a VSIX artifact.
- Repository scanning no longer blocks the extension host on synchronous filesystem calls.

### Fixed
- Git commands no longer hang on credential prompts (`GIT_TERMINAL_PROMPT=0`) and always emit English messages so error classification works under any locale.
- Timed-out Git processes are killed reliably (process tree on Windows, SIGKILL escalation elsewhere); runaway output is capped.
- Ahead count for branches without an upstream only counts commits missing from every remote.
- Commit diffs now work for merge commits (first-parent diff) and root commits.
- Network failures have their own error code instead of being reported as a rejected push.
- Invalid branch names are rejected up front; deleting a branch that is not merged now asks for an explicit "Force Delete".

## [0.3.0] - 2026-08-26

### Added
- Runtime language selector with Automatic, Vietnamese, English, and Simplified Chinese options.
- Vietnamese and Simplified Chinese translations for the repository tree, Git action menus, notifications, prompts, History panel, and Conflict Resolver.
- VS Code manifest localization for views, commands, descriptions, and language settings.

### Changed
- Conflict Resolver labels, status messages, tooltips, and dynamic controls now follow the selected extension language.

## [0.2.2] - 2026-08-26

### Fixed
- Hide clean repositories from the repository tree.
- Keep repositories visible when they have changed files, ahead/behind commits, an in-progress Git operation, a status error, or a changed nested repository.
- Apply the same visibility rule to root and nested repositories.

## [0.2.1] - 2026-08-26

### Changed
- Rebuilt the conflict resolver around an IntelliJ-style synchronized merge grid.
- Added line numbers, inline colored conflict blocks, word-level highlighting, source-to-result arrow gutters, reject actions, conflict navigation, Base details, whitespace/highlight modes, and an editable inline Result.
- Removed the separate conflict-card list so changes are resolved directly in their code positions.
- Added automated Left/Right/Both interaction tests for a five-conflict file.

## [0.2.0] - 2026-08-26

### Added
- Git operation-state detection for merge, rebase, cherry-pick, and revert.
- Continue, abort, and skip operation commands.
- Pull strategy selection: fast-forward only, rebase, or merge.
- JetBrains-style 3-pane conflict editor with Current, editable Result, Incoming, Base preview, per-hunk actions, and native VS Code Merge Editor fallback.
- Support for text conflicts without markers, diff3 markers, modify/delete conflicts, deleted-side resolution, and binary conflict side selection.
- Automatic next-conflict navigation and Continue prompt after the final conflict is resolved.

### Fixed
- NUL-safe Git status parsing for spaces, Unicode, quotes, rename paths, and filenames containing ` -> `.
- Unstage on repositories with no commits.
- Discarding untracked files now uses the operating system trash.
- Conflicted files can no longer be staged directly from the tree.
- All contributed commands now have registered handlers.
- Clean repositories remain visible and actionable.
- Git diff URIs now use VS Code's structured Git URI format.

### Changed
- Pull defaults to the safe fast-forward-only strategy.
- Git commands that may open an editor run non-interactively.
- Repository rows display in-progress Git operations.
- Untrusted workspaces are disabled because the extension executes repository-changing commands.

## [0.1.3] - 2026-08-04

### Added
- Unit and integration test suite (Mocha) covering the Git status parser, error classification, repository scanning, and core `GitAdapter` operations.
- GitHub Actions CI workflow running lint, compile, and tests on every push/PR.
- Git error classification: adapter errors are now tagged with a specific `ErrorCode` (auth failure, merge conflict, dirty working tree, remote rejected, timeout, etc.) instead of a single generic error.
- `LICENSE` (MIT) and this changelog.

### Changed
- Extracted Git status parsing into a standalone, independently testable module (`parseGitStatus`).

## [0.0.1] - Initial version

### Added
- Multi-repository workspace tree view (repositories, changed files, branches).
- Stage/unstage/discard file and stage/unstage/restore-all repository actions.
- Commit, fetch, pull, pull-from-branch, push.
- Branch checkout, create, delete, merge, rebase.
- Stash push/pop.
- Basic HEAD diff view.
