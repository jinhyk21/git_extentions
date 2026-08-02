# Git Rules

- Do not call Git CLI outside `GitAdapter` and `GitProcessRunner`.
- Do not build shell command strings.
- Pass Git arguments as arrays.
- Add timeouts for Git operations.
- Do not retry destructive Git operations automatically.
- Every Git failure exposed to users must have a structured error code.
