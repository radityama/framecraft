# HTML shot authoring

- Project metadata lives in `projects/demo/project.json`; its scene lists independently loaded shot HTML entries. `overlapFrames` is 0.
- A shot includes `projects/demo/runtime.js` before its own script and calls `window.framecraft.shot({prepare?, renderFrame(ctx), dispose?})` once. `renderFrame` is required.
- From `projects/demo/scenes/intro/shots/<name>/index.html`, a minimal plain-DOM shot is:

  ```html
  <!doctype html>
  <html lang="en"><meta charset="utf-8">
  <link rel="stylesheet" href="../../../../assets/fonts/fonts.css">
  <style>html,body{margin:0;width:100%;height:100%;font-family:"IBM Plex Sans",sans-serif}</style>
  <main id="label"></main>
  <script src="../../../../runtime.js"></script>
  <script>
    framecraft.shot({
      renderFrame(ctx) { document.querySelector('#label').textContent = String(ctx.frame); }
    });
  </script></html>
  ```

  The browser viewport is the video frame (`ctx.width` × `ctx.height`); no canvas or React is needed. `renderFrame` may return nothing; throw to fail a frame.
- `ctx.frame` is a zero-based shot-local integer; `ctx` also includes `fps`, `durationFrames`, `width`, `height`, `seconds`, `progress` (0 on the first frame, 1 on the last; 1 for a single-frame shot) and seeded `random()`.
- Each seek freezes `Date.now()` at 1700000000000 + `ctx.seconds * 1000`, `performance.now()` and `requestAnimationFrame` timestamps at `ctx.seconds * 1000`, and seeds `Math.random()` for the shot ID and frame. `Math.random()` and `ctx.random()` share one sequence.
- Render directly to the requested frame without replaying earlier frames. Use `prepare` for one-time setup and `dispose` for teardown. The runtime seeks CSS/WAAPI animations and paused GSAP timelines registered with `window.framecraft.timeline(timeline)` to `ctx.seconds`. `shot({timelines: [timeline]})` still works but is deprecated. Do not rely on timer-driven state; `setInterval` and `setTimeout` are not frozen.
- For GSAP, include `../../../../assets/vendor/gsap.min.js` after `runtime.js`, create `const timeline = gsap.timeline({paused:true})`, call `framecraft.timeline(timeline)`, and put tweens at absolute shot time. `timelines` is a top-level `shot({...})` property in legacy shots, not a return value of `prepare`. For CSS staged reveals, use `animation-fill-mode: both` and a positive delay; never start animation playback from JS.
- A frame is acknowledged after `renderFrame`, animation seeking, a layout flush, `document.fonts.ready`, decoding document images, two native animation frames and a final font-readiness check. A failed decode fails the seek. Overlapping requests serialize; only the newest seek acknowledges. Live video is not synchronized.
- Keep every asset local to the project, and do not fetch scripts or media remotely.
- Snap the first and last frame while authoring; off-viewport content can otherwise render a valid but wrong still. After adding a shot, update its scene manifest and the shot list and total in `docs/rendering.md`.
- Run `bun run validate` to check the project and see static warnings about potentially nondeterministic shot HTML and undeclared first-choice fonts (including local linked CSS). It does not analyze imported scripts or prove determinism.
