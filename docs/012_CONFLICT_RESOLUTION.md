# Conflict Resolution

## MVP Strategy

Use VS Code's native merge editor for file-level resolution and provide a Git Workspace Pro dashboard for operation control.

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

## Later Custom Editor

A future version can add a custom 3-way editor with current, base, and incoming panes.
