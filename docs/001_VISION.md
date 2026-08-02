# Vision

Git Workspace Pro turns VS Code into a serious multi-repository Git client with interaction quality close to JetBrains IDEs.

## Goals

- Manage many repositories in one workspace.
- Show nested repositories as a parent-child tree.
- Let each repository be operated independently.
- Support click-first workflows for daily Git operations.
- Provide guided merge, rebase, and conflict-resolution flows.
- Stay reliable enough for company usage.

## Non Goals For MVP

- Fully custom JetBrains-like 3-way merge editor.
- Cloud synchronization.
- Git hosting provider management.
- Replacing VS Code's native source control API globally.

The MVP should use VS Code's merge editor while Git Workspace Pro owns repository state, operation flow, and conflict dashboards.
