# Repository Manager

## Responsibility

Repository Manager discovers repositories, builds the parent-child tree, loads repository state, and refreshes repositories after operations.

## Startup Flow

```txt
Extension Activate
↓
Read workspace folders
↓
Normalize paths
↓
Remove duplicate paths
↓
Scan recursively
↓
Detect .git metadata
↓
Build parent-child tree
↓
Load repository status
↓
Render tree
```

## Scanner Rules

- Detect `.git` directories.
- Detect `.git` files for submodules and worktrees.
- Ignore heavy directories such as `node_modules`, `dist`, and `.git`.
- Continue scanning after permission errors.
- Preserve nested repositories instead of flattening them.

## Repository Node

```ts
type RepositoryNode = {
  id: string;
  name: string;
  rootPath: string;
  parentId?: string;
  children: RepositoryNode[];
  isNested: boolean;
  isSubmodule: boolean;
  status?: RepositoryStatusSummary;
};
```
