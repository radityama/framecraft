# Framecraft motion

Repository Markdown guide, not a provider-installed dependency. Drive motion from the requested shot-local frame, not elapsed wall time or previous seeks. The runtime seeks finite CSS/WAAPI animations to `ctx.seconds`; give delayed reveals a defined early state. Register paused GSAP timelines at absolute shot seconds as described in `AGENTS.md`. Test before, at and after each reveal milestone plus the first and last frame; inspect backward seeks in Studio. Do not treat a passing static scan as proof of visual timing.
