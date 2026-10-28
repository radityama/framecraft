# HTML shot authoring

## Public authoring API

Each `projects/<project-id>/project.json` defines the video and references one or more scene manifests. Each shot is an independently loaded HTML file; scene entries specify an ID, an entry relative to the scene, a positive `durationFrames`, and `overlapFrames: 0`. From `projects/demo/scenes/intro/shots/<name>/index.html`, this is a complete minimal shot:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="../../../../assets/fonts/fonts.css">
  <style>
    html, body { margin: 0; width: 100%; height: 100%; font-family: "IBM Plex Sans", sans-serif; }
  </style>
</head>
<body>
  <main id="label"></main>
  <script src="../../../../runtime.js"></script>
  <script>
    window.framecraft.shot({
      renderFrame(ctx) {
        document.querySelector('#label').textContent = String(ctx.frame);
      }
    });
  </script>
</body>
</html>
```

The viewport is the video frame (`ctx.width` × `ctx.height`); plain DOM is enough. Load `runtime.js` before your script and call `window.framecraft.shot(...)` **exactly once**. `renderFrame(ctx)` is required; it may return nothing or a promise. Optional `prepare()` runs once before the shot is ready (and may be async); optional `dispose()` runs when the page unloads. Throw or reject in `prepare` or `renderFrame` to fail instead of producing a silent bad frame. Image decode failures also fail the frame. Do not depend on `dispose` to save data after a process crash.

`ctx.frame` is a zero-based, shot-local integer. `ctx` also has `fps`, `durationFrames`, `width`, `height`, `seconds` (`frame / fps`), `progress` (0 at the first frame, 1 at the last; 1 for a single-frame shot), and seeded `random()`. Render the **complete state of the requested frame** on every call, including backward seeks, without replaying preceding frames or relying on previous DOM state. `Math.random()` and `ctx.random()` share a frame-seeded sequence; use a consistent call order. `Date.now()` is frozen at `1700000000000 + ctx.seconds * 1000`; `performance.now()` and `requestAnimationFrame` callback timestamps reflect `ctx.seconds * 1000`. `setTimeout`, `setInterval`, live video, network responses, and wall-clock-driven state are not synchronized: do not use them to determine pixels. Native animation frames are used for settling, not for advancing your shot state.

For CSS animations and Web Animations API animations, define animations without starting playback from a seek; the runtime pauses and seeks document animations to shot-local `ctx.seconds`. For a delayed CSS reveal use a positive delay and `animation-fill-mode: both` so early frames have a defined state. Prefer finite, seekable animations and test boundary frames. CSS transitions triggered by earlier seeks are not a substitute for an absolute frame state.

For GSAP, include `../../../../assets/vendor/gsap.min.js` **after** `runtime.js`, create `const timeline = gsap.timeline({paused: true})`, add tweens at **absolute shot times in seconds** (for example, `timeline.to(node, {opacity: 1, duration: 1}, 2)` starts at second 2), and call `window.framecraft.timeline(timeline)` once. The runtime seeks registered timelines to `ctx.seconds` after `renderFrame`; keep them paused. The legacy `window.framecraft.shot({timelines: [timeline], renderFrame(ctx) { ... }})` form also works: `timelines` is a top-level shot property, **not** a value returned by `prepare`. Use one registration form per timeline, not both.

Keep scripts, images, styles and fonts inside the selected project root; never fetch remote assets. Each project needs its own `runtime.js` and local fonts or other assets referenced by its shots. The demo bundles IBM Plex Serif, IBM Plex Sans and JetBrains Mono from `../../../../assets/fonts/fonts.css`; other projects may bundle their own fonts. Put the intended family first in `font-family`, check glyph coverage for non-Latin text, and verify the actual font loaded in the rendered still. The runtime waits for fonts and document images before acknowledging a frame.

Audio is declared in `scene.audio` or each shot's `audio` list, not in shot HTML; see `docs/audio.md`.

## Authoring checks and boundary

Run `bun run validate --project projects/<project-id> --scene <scene-id>` (a conservative static warning scan, **not** a determinism proof). Omit selectors for the demo. Inspect the first, a middle, and the last frame; for the 120-frame demo commit shot, run `bun run snap --shot commit --frame 0`, `bun run snap --shot commit --frame 60`, and `bun run snap --shot commit --frame 119`. For another project, add `--project` and `--scene` to each command. Off-viewport content can produce a valid but wrong still. Seek middle → first → middle to catch stateful rendering. Register the shot in its scene manifest, update the relevant shot list and total in `docs/rendering.md`, and render its scene with `bun run render --project projects/<project-id> --scene <scene-id>`. See `docs/rendering.md` for setup and export commands.

Shot authors depend on `window.framecraft.shot`, optional `window.framecraft.timeline`, and the context above. The iframe message bridge, Remotion composition, browser readiness handshake, and temporary bundle management are internal implementation details; do not call them from shot HTML. Frame acknowledgement follows rendering, animation seeking, font/image readiness and settling, but is not a timer-driven playback API.

## Agent visual review

Follow the ten steps in [docs/agent-workflow.md](docs/agent-workflow.md). These are repository Markdown guides usable by any coding agent without provider-specific installation or MCP: [storyboard](skills/framecraft-storyboard/SKILL.md), [HTML shot](skills/framecraft-html-shot/SKILL.md), [motion](skills/framecraft-motion/SKILL.md), [visual review](skills/framecraft-visual-review/SKILL.md), [sound](skills/framecraft-sound/SKILL.md), [export](skills/framecraft-export/SKILL.md). Review requires opening retained PNGs and a named decision; a capture never automatically accepts a shot. Export targets one selected scene at a time.

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
