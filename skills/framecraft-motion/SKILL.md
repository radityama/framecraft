# Framecraft motion

Repository Markdown guide, not a provider-installed dependency. Drive motion from the requested shot-local frame, not elapsed wall time or previous seeks. The runtime seeks finite CSS/WAAPI animations to `ctx.seconds`; give delayed reveals a defined early state. Register paused GSAP timelines at absolute shot seconds as described in `AGENTS.md`. Test before, at and after each reveal milestone plus the first and last frame; inspect backward seeks in Studio. Do not treat a passing static scan as proof of visual timing.

For optional numeric easing, keyframes, cursor paths, camera transforms and DOM/SVG reveals, copy `authoring/motion.js` into the selected project's assets. See `docs/motion.md` and the four standalone `projects/motion` shots. Helpers never own a clock; raw HTML/CSS/JavaScript/SVG remains valid without them.
