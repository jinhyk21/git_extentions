# Security

## Rules

- Do not execute arbitrary shell strings.
- Do not expose credentials in logs or telemetry.
- Do not allow webview messages to call arbitrary commands.
- Validate all IPC payloads.
- Respect VS Code workspace trust.
- Confirm destructive operations.

## Destructive Operations

The following operations require explicit user confirmation:

- Discard changes
- Hard reset
- Force push
- Delete branch
- Delete tag
- Drop stash
- Abort merge
- Abort rebase
- Clean untracked files
