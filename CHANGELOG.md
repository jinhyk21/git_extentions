All notable changes to Git Workspace Pro are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
