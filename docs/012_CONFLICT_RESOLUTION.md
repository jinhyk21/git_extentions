# Conflict Resolution

## Strategy

Git Workspace Pro provides a JetBrains-style three-pane editor and keeps VS Code's native Merge Editor available as a fallback.

## Conflict Dashboard

The dashboard will show:

- Repository name
- Current branch
- Operation type
- Target branch or commit
- Conflicted files
- Open merge editor action
- Mark resolved action
- Continue operation action
- Abort operation action

## Merge Conflict Flow

```txt
Conflict detected
↓
Load conflicted files
↓
Show conflict dashboard
↓
Open VS Code merge editor
↓
User resolves file
↓
Stage resolved file
↓
All files resolved?
↓
Continue merge/rebase/cherry-pick
↓
Refresh repository
```

## Custom Editor

The editor loads Git index stages directly:

- Stage 1: Base
- Stage 2: Current
- Stage 3: Incoming
- Working tree: editable Result

It supports per-hunk Current, Incoming, Both, and Base choices; manual Result editing; diff3 markers; modify/delete conflicts; missing-marker conflicts; and binary whole-side selection.

When the last conflicted file is resolved, the extension offers to continue the detected merge, rebase, cherry-pick, or revert operation.
