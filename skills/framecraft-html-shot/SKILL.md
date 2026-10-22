# Framecraft HTML shot

Repository Markdown guide, not a provider-installed dependency. Follow the public HTML shot API in `AGENTS.md`; do not call the internal bridge. Keep assets local to `projects/demo/` and render the complete state for every shot-local frame, including backward seeks. Register shots in the scene manifest. Check early, middle and last frames with `bun run snap --shot <id> --frame <local-frame>`; use `bun run studio` for interactive seeking. See `docs/rendering.md` for export boundaries.
