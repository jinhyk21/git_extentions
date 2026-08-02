# Architecture Rules

- Keep core logic independent from VS Code APIs.
- Keep UI independent from Git CLI details.
- Do not import from extension layer into core.
- Do not create circular dependencies.
- Add abstractions only when they protect a real boundary.
