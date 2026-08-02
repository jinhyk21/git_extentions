# Testing Rules

- Every important public method needs a test.
- Git parser tests should not execute Git.
- Integration tests may create temporary repositories.
- Conflict, merge, and rebase flows require state-machine tests.
- Do not add broad unrelated tests while fixing a narrow behavior.
