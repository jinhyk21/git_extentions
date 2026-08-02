# Git Engine

## Responsibility

The Git Engine provides a typed, controlled API over Git CLI.

## Components

- `GitAdapter`
- `GitProcessRunner`
- `GitCommandBuilder`
- `GitOutputParser`
- Git operation state machines

## Rules

- Never build shell strings.
- Always pass command arguments as arrays.
- Always set a timeout.
- Never retry destructive operations automatically.
- Parse Git output into typed models before exposing it to UI.

## Initial Commands

- `rev-parse --is-inside-work-tree`
- `branch --show-current`
- `status --porcelain=v1`

## Future Commands

- `add`
- `restore`
- `commit`
- `fetch`
- `pull`
- `push`
- `switch`
- `merge`
- `rebase`
- `stash`
- `log`
- `diff`
- `show`
