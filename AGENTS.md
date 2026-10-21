# HTML shot authoring

- Project metadata lives in `projects/demo/project.json`; its scene lists independently loaded shot HTML entries. `overlapFrames` is 0.
- A shot includes `projects/demo/runtime.js` before its own script and calls `window.framecraft.shot({prepare?, renderFrame(ctx), dispose?})` once. `renderFrame` is required.
- `ctx.frame` is a zero-based shot-local integer; `ctx` also includes `fps`, `durationFrames`, `width`, `height`, `seconds`, `progress` and seeded `random()`.
- Render directly to the requested frame without replaying earlier frames. Use `prepare` for one-time setup and `dispose` for teardown. The runtime seeks CSS/WAAPI animations and any paused GSAP timelines passed as `timelines: [timeline]` to `ctx.seconds`; do not rely on wall-clock playback.
- Keep every asset local to the project, and do not fetch scripts or media remotely.
