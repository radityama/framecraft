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

<!-- antislop:start -->
## antislop
For UI, people, or mobile layout work, read `antislop.md` (core) and then the skill for the task:
- UI / visual: `skills/antislop-ui/SKILL.md`
- People: `skills/antislop-human/SKILL.md`
- Mobile / responsive: `skills/antislop-layoutmobile/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: download `antislop.md` again, or run `npx antislop-ai --update` if it was installed as skill folders.
<!-- antislop:end -->
