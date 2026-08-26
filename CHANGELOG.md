All notable changes to Git Workspace Pro are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
