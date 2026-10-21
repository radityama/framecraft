# ADR 0001 addendum: cold-start shot authoring test

Date: 2026-10-21
Scope: can an agent author a valid Framecraft shot from `AGENTS.md` alone?

## Verdict

**PASS**, narrowly. The `commit` shot was authored, registered in `scene.json`, and rendered deterministically without reading `runtime.js`, any existing shot, `src/`, `tests/`, or `docs/adr/`. The first snap of frame 0 succeeded, and the shot was frame-accurate across stills and video. The one correction needed was a self-inflicted CSS layout bug (`white-space: pre` on the container made inter-element whitespace render, pushing the underline below the 1080 px viewport), not an API misunderstanding. The pass is narrow because several contract details — where `timelines` goes, that shots are plain DOM sized by the viewport, and that `renderFrame` may return nothing — had to be inferred; they happened to be correct, but `AGENTS.md` does not state them explicitly.

## Iterations

2 iterations.

1. Initial authoring: shot registered and frame 0 snapped successfully on the first run.
2. CSS fix: removed `white-space: pre` from the container (kept it on the command line), after frame 119 showed the underline bar missing. First fully correct render was the frame-119 snap after this fix.

No runtime/API registration error occurred. No fallback to reading forbidden files was needed.

## Errors hit

### 1. Underline bar invisible at frame 119 (layout bug)

- Cause: `white-space: pre` was set on `.terminal`. The newlines and indentation between the child `<div>`s became rendered text, adding line boxes and pushing `.rule` past the 1080 px viewport. The DOM and CSS were valid, so the runtime reported no error; the still was simply wrong at the end of the shot.
- Prevention: this was my CSS mistake, not an API gap. `AGENTS.md` could still save time by telling authors to snap both the first and last frame while iterating, since out-of-viewport content produces a successful but wrong still.

### 2. `bun test` failed with `EDQUOT` on the second run

- Cause: environment, not the shot. Each snap/render left a ~34 MB `/tmp/remotion-webpack-bundle-*` directory; the 1.9 GB tmpfs filled up, and test fixture writes failed with `EDQUOT: unknown error, write`.
- Prevention: not an `AGENTS.md` issue. Removing `/tmp/remotion-webpack-bundle-*` restored the run (`8 pass, 0 fail`). Worth noting for long authoring sessions, since the failure looks like a test failure.

### 3. Negative check (intentional)

- Added `throw new Error('negative check: intentional failure')` at the top of `renderFrame`, then ran `bun run snap --frame 0 --shot commit`. It failed with exit code 1 and a useful message including shot, frame, source line, and stack:

```text
error: commit frame 0: Error: negative check: intentional failure
    at Object.renderFrame (http://localhost:3000/public/scenes/intro/shots/04-commit/index.html:89:15)
    at http://localhost:3000/public/runtime.js:35:20
...
error: script "snap" exited with code 1
```

- The throw was reverted; a follow-up frame-0 snap reproduced the original SHA-256.

## Constraint 2 breaks

**None.** I did not open, read, or grep `projects/demo/runtime.js`, any existing shot under `projects/demo/scenes/intro/shots/`, anything in `src/`, `tests/`, or `docs/adr/`.

Disclosure for constraint 1: besides `AGENTS.md` and `docs/rendering.md`, I read `projects/demo/scenes/intro/scene.json` (the file I was allowed to edit), `projects/demo/project.json` (dimensions/background context), and `package.json` (script names), and listed the `projects/demo` and `projects/demo/assets/vendor` directories (asset path). None contain shot or runtime implementation. If "only" was meant literally, those reads are the deviation.

## Suggested `AGENTS.md` changes (not applied)

```diff
 - A shot includes `projects/demo/runtime.js` before its own script and calls
   `window.framecraft.shot({prepare?, renderFrame(ctx), dispose?})` once. `renderFrame` is required.
+- Minimal shape, with paths relative to the shot HTML:
+  <script src="../../../../runtime.js"></script>
+  <script src="../../../../assets/vendor/gsap.min.js"></script>
+  <script>
+    const tl = gsap.timeline({paused: true});
+    window.framecraft.shot({
+      timelines: [tl],
+      prepare() {},
+      renderFrame(ctx) {},
+      dispose() { tl.kill(); }
+    });
+  </script>
+- `timelines` is a top-level property of the shot definition, not a return value of `prepare`.
+  The runtime seeks each paused timeline to `ctx.seconds`; place tweens at absolute shot time.
+- A shot is plain DOM. Size `html, body` to `ctx.width` x `ctx.height` (or the project size);
+  the browser viewport is the frame. No canvas and no React are required.
+- `renderFrame`'s return value is ignored; the runtime acknowledges the frame after it returns.
+  Throw from `renderFrame` to fail that frame.
+- CSS animations are discovered and seeked to `ctx.seconds`. Use `animation-fill-mode: both`
+  and a positive delay for staged reveals; do not start animations from JS.
+- Snap the first and last frame while authoring, not only a middle frame: content laid out
+  outside the viewport still renders a valid, misleadingly empty still.
+- After adding a shot, update the totals and shot list in `docs/rendering.md`
+  (it still says 210 frames and lists only `title`, `diagram`, `close`).
```

## Verify results

### 1. Tests

First run (before the shot was fully polished):

```text
bun test v1.4.3 (c6da4a4d6)
 8 pass
 0 fail
 17 expect() calls
Ran 8 tests across 3 files. [42.11s]
```

Second run hit the environmental `EDQUOT` failure described above (`3 pass, 5 fail`). After clearing `/tmp/remotion-webpack-bundle-*`:

```text
bun test v1.4.3 (c6da4a4d6)
 8 pass
 0 fail
 17 expect() calls
Ran 8 tests across 3 files. [22.13s]
```

### 2. Four stills

```text
bun run snap --frame 0 --shot commit
bun run snap --frame 30 --shot commit
bun run snap --frame 75 --shot commit
bun run snap --frame 119 --shot commit
```

SHA-256 (all four distinct):

```text
4eb6362fecf88893571363a3f6c567f862412dbd22a873165d1a324e5d9709d8  output/snaps/commit-0.png
fb58c30dfbde9a7e899aac5217b70d911107e058bda910677f214ca43f44d29f  output/snaps/commit-30.png
3e13f68b31f20c9d5f1f84bab8302d1bd4dedf194f16b0e5aa6b7ee865693a52  output/snaps/commit-75.png
a1c0582b61a3d060d055844b1190c16240aeb1e3650252b0289b54a90a4a1481  output/snaps/commit-119.png
```

Viewed all four. Frame 0 shows `$` plus a visible block cursor; frame 30 shows the partial command with the cursor; frame 75 shows the fully typed command with the output line partially faded/slid and the cursor in its off phase; frame 119 shows the output line settled and the accent underline at full width. The cursor's visible/off states at these frames confirm the CSS blink is seeked, not wall-clock driven.

### 3. Reverse seek

Captured `--frame 75`, then `--frame 119`, then `--frame 75` again:

```text
3e13f68b31f20c9d5f1f84bab8302d1bd4dedf194f16b0e5aa6b7ee865693a52  output/snaps/commit-75.png
```

Identical to the first frame-75 hash.

### 4. Shot MP4

```text
$ bun run render --shot commit
commit render: 120 frames at 1920x1080/30fps, 51932 bytes, 24.98s
/home/radityra/projects/framecraft/output/commit.mp4
```

```json
{
  "streams": [
    {
      "width": 1920,
      "height": 1080,
      "r_frame_rate": "30/1",
      "nb_read_frames": "120"
    }
  ]
}
```

### 5. Scene MP4

Previous total was 210 frames (60 + 90 + 60). Adding 120 gives 330.

```text
$ bun run render
intro render: 330 frames at 1920x1080/30fps, 165450 bytes, 36.62s
/home/radityra/projects/framecraft/output/intro.mp4
```

```json
{
  "streams": [
    {
      "width": 1920,
      "height": 1080,
      "r_frame_rate": "30/1",
      "nb_read_frames": "330"
    }
  ]
}
```

### 6. Negative check

See error 3 above: `snap` failed with `error: commit frame 0: Error: negative check: intentional failure` and exit code 1, then the throw was reverted and frame 0 re-snapped to the original hash.
