# HTML shot authoring

- Project metadata lives in `projects/demo/project.json`; its scene lists independently loaded shot HTML entries. `overlapFrames` is 0.
- A shot includes `projects/demo/runtime.js` before its own script and calls `window.framecraft.shot({prepare?, renderFrame(ctx), dispose?})` once. `renderFrame` is required.
- `ctx.frame` is a zero-based shot-local integer; `ctx` also includes `fps`, `durationFrames`, `width`, `height`, `seconds`, `progress` (0 on the first frame, 1 on the last; 1 for a single-frame shot) and seeded `random()`.
- Each seek freezes `Date.now()` at 1700000000000 + `ctx.seconds * 1000`, `performance.now()` and `requestAnimationFrame` timestamps at `ctx.seconds * 1000`, and seeds `Math.random()` for the shot ID and frame. `Math.random()` and `ctx.random()` share one sequence.
- Render directly to the requested frame without replaying earlier frames. Use `prepare` for one-time setup and `dispose` for teardown. The runtime seeks CSS/WAAPI animations and paused GSAP timelines registered with `window.framecraft.timeline(timeline)` to `ctx.seconds`. `shot({timelines: [timeline]})` still works but is deprecated. Do not rely on timer-driven state; `setInterval` and `setTimeout` are not frozen.
- A frame is acknowledged after `renderFrame`, animation seeking, `document.fonts.ready`, decoding document images and two native animation frames. A failed decode fails the seek. Live video is not synchronized.
- Keep every asset local to the project, and do not fetch scripts or media remotely.
- Run `bun run validate` to check the project and see static warnings about potentially nondeterministic shot HTML. It does not analyze imported scripts or prove determinism.
