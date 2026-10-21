# Deterministic shot runtime, validation, and hash comparison

**Approved scope:** Extend the demo HTML-shot runtime without changing the Remotion adapter or adding dependencies. The current scene includes the independently authored 120-frame `commit` shot: keep all four shots, and verify the full **330-frame** export at 1920×1080, 30 fps. The original first three shots still total 210 frames; do not remove the fourth shot to recreate the old export.

## Runtime contract

The existing same-origin iframe `init`/`ready`/`seek`/`rendered`/`error` protocol remains unchanged. For each valid shot-local seek, seed one PRNG with shot ID and frame and expose it as both `ctx.random` and `Math.random`. Freeze `Date.now` to a fixed epoch plus frame seconds in milliseconds, `performance.now` to frame seconds in milliseconds, and the timestamp delivered to shot `requestAnimationFrame` callbacks to that same frame time. Preserve the native animation-frame function for settling the capture: after rendering and seeking CSS/WAAPI animations and both registered and legacy paused GSAP timelines, wait for fonts, decode document images, then await two native animation frames before sending `rendered`. Fail through the existing `error` message if a resource cannot decode or any step throws. Do not virtualize `setTimeout`/`setInterval` or claim reverse-seek safety for timer-driven state. `ctx.progress` reaches exactly 0 at the first frame and 1 at the last; a one-frame shot reports 1.

`framecraft.timeline(tl)` registers a paused timeline as the preferred authoring API; `shot({timelines: [...]})` remains supported and is documented as deprecated. The runtime seeks both to `ctx.seconds`. Registered timelines are scoped to the shot iframe, not shared with other shots.

## Commands and evidence

`bun run validate` invokes `loadProject()` on the demo, prints every validated shot's frames and seconds, and prints nonfatal warnings for suspect source in shot HTML: `setInterval`, `requestAnimationFrame` use outside the runtime, `fetch(`, external HTTP(S) references, and `Math.random` instead of `ctx.random`. It does not inspect vendored scripts and does not purport to be a JS parser; report that limit in documentation.

`bun run hash` uses the existing Remotion bundler and still renderer to capture title frames 0/30, diagram 0/30/70, and close 59, hashes PNG bytes with SHA-256, and writes `output/hashes.json` with Bun, Remotion, Chromium and OS versions. The report describes the machine; comparison across machines is a manual step, not a claim of proven identity. Rendering errors must not leave a misleading complete report.

## Test boundaries and acceptance

Browser tests use the existing public iframe `mount`/`seek` seam to check 70→10→70 clocks, random values, progress endpoints/midpoint, both GSAP registration forms, and delayed acknowledgement for fonts, images, and two real animation frames. CLI tests run `validate` on fixture HTML and demo sources and verify every warning and no demo warnings. A hash script check verifies frame selection, metadata and file hashes. Run all existing tests, render the four-shot scene and verify **330** frames with ffprobe. Update `AGENTS.md`, `docs/rendering.md`, and ADR 0001's Consequences, keeping live video, audio, transitions, timer-driven state, and cross-machine identity unsupported or unverified as appropriate.
