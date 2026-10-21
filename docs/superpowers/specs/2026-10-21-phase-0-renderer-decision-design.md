# Phase 0: Renderer decision and proof of concept

**Status:** Approved direction, based on Framecraft specification v0.2 (21 October 2026).

## Goal and boundary

Test whether Remotion can support Framecraft's local-first, agent-authored HTML/CSS/JS shots without giving up arbitrary-frame seeking. Make the four-criterion decision before investing in an in-house capture engine. If Remotion wins at least three criteria, use it under a thin Framecraft project/agent layer. Otherwise build only the Phase 0 in-house proof of concept. The Studio UI, sound, transitions, asset provenance and other later-phase features are outside this pass.

## Common trial

Use one three-shot project at 1920×1080, 30 fps: a title reveal, a diagram using CSS animation and GSAP, and a closing frame. Its source project uses the v0.2 `project.json`/`scene.json` format and independent HTML entries. Every shot registers `window.framecraft.shot({ prepare?, renderFrame, dispose? })`; the context contains shot-local integer frame, fps, duration, dimensions, seconds, progress and seeded random. A shot must render a requested frame without first replaying previous frames. All resources stay local.

Build the smallest Remotion spike that exercises *those same HTML shots*, rather than replacing them with unrelated React compositions. An adapter is allowed if its cost and limitations are counted against Remotion. Evaluate:

| Criterion | Evidence required to pass |
| --- | --- |
| Authoring | An agent can follow `AGENTS.md` to create a valid independent HTML shot, without requiring a React rewrite or Remotion-specific shot source. |
| Determinism | Arbitrary and reverse seeks of the CSS/GSAP shot produce the expected state; a repeated capture of the same frame has identical pixels in a pinned local environment. |
| Weight | Record installed dependency size, setup requirements and actual licensing terms; acceptable only if they are compatible with a locally operated, agent-agnostic project. |
| Control | A frame snapshot with error reporting, a shot-scoped render, and a schema-driven project render are feasible through supported APIs without replacing the renderer's internals. |

Record a pass/fail and supporting commands, outputs and caveats for each criterion in `docs/adr/0001-renderer.md`. Three or four passes chooses Remotion; zero to two chooses the in-house engine. A blocked test is *not* a pass. Remotion's documentation explicitly warns that CSS animation in an iframe does not track its frame clock; GSAP has a frame-aware adapter for React compositions, which is not by itself proof that independent HTML shots work.

## In-house branch, if selected

Use Bun for scripts and a loopback-only static server, Playwright Chromium for screenshots and FFmpeg for H.264/yuv420p export. Share one frame scheduler and one injected shot runtime between preview and capture. The runtime seeks CSS/WAAPI animation, registered paused GSAP timelines and video explicitly; it freezes clocks and seeds randomness. A same-origin iframe exchanges versioned `init`, `seek`, `ready`, `rendered` and `error` messages with the host. Capture waits for the acknowledgement, times out on failure and surfaces console/runtime errors. Validate IDs, schedule and project-confined paths before opening files; non-zero overlaps are rejected in Phase 0.

Implement only the Phase 0-facing scripts: `validate`, `snap`, `render` (including `--shot`), and a minimal `?scene=<id>&frame=<n>` preview with `?clip=` as a deprecated alias. Frame snapshots include a manifest of requested frames and errors. Stream captures with backpressure to FFmpeg, ensure cancellation tears down processes and removes partial output, and verify exact frame count, order and dimensions with ffprobe. The common three-shot project and tests cover validation/scheduling, forward and reverse seek, same-frame pixel identity, failure propagation and scoped export.

Measure Playwright PNG and JPEG-q95 screenshots against direct CDP `Page.captureScreenshot` on the same frames. Record median milliseconds per frame, peak resident memory and real-time factor; Playwright itself uses CDP screenshot capture, so a separate CDP path should remain only if it measurably improves the complete capture loop. Do not add `beginFrame` unless the baseline proves too slow.

## Environment and limits

The repository began empty. Bun 1.4.3 and Node 22.23.1 are available; Chromium and FFmpeg are not currently on `PATH`, and no Playwright browser cache was found. Check usable installations, install or document missing prerequisites, then report any acceptance test that cannot run rather than claiming success. Pin the browser and FFmpeg versions actually used in `docs/rendering.md`. Linux is the first target. Do not add Studio styling or later-phase features to satisfy this decision gate.

## Source references checked

- Remotion renderer API: <https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/ssr-node.mdx>
- Remotion CSS animation limitation: <https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/troubleshooting/css-animations.mdx>
- Remotion iframe behavior: <https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/iframe.mdx>
- Remotion GSAP adapter: <https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/gsap/index.mdx>
- Remotion license: <https://github.com/remotion-dev/remotion/blob/main/LICENSE.md>
