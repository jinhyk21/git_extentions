# Performance

## Targets

```txt
100 repositories:
  Cached startup < 3s
  Full scan without cache < 15s
  Single repository refresh < 500ms
  Status command < 300ms/repo
  History first page < 500ms
  Memory < 300MB
  Concurrent Git processes <= 10
  Tree expand latency < 100ms
```

## Strategy

- Cache repository tree.
- Lazy-load history.
- Debounce filesystem events.
- Limit concurrent Git processes.
- Refresh visible or changed repositories first.
- Avoid full rescans after every file change.
