# Architecture

## Layers

```txt
VS Code Extension Host
  Extension
  Core
  Infrastructure
  UI
  Shared
```

## Dependency Direction

```txt
extension -> core -> shared
extension -> infrastructure -> shared
ui -> shared
```

Core must not depend on VS Code APIs, React, webview APIs, or shell-specific behavior.

## Critical Boundaries

- Git CLI is only called through `GitAdapter`.
- VS Code API is only called through extension/adapters and providers.
- Webview messages must use typed IPC contracts.
- Git operations must use state machines once they become multi-step or destructive.
- Dangerous operations must require explicit confirmation.

## First Implementation Shape

The first implementation uses a native VS Code tree view. Webviews are introduced later for commit dialogs, history, and conflict dashboards.
