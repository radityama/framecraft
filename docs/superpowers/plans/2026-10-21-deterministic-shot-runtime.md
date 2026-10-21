# Deterministic Shot Runtime Implementation Plan

> **For agentic workers:** Execute this plan inline, one red/green slice and commit at a time. Tests observe the existing iframe `mount`/`seek` contract and CLI commands; do not test runtime internals.

**Goal:** Make the HTML-shot iframe deterministic at each seek, provide source warnings and repeatable per-machine PNG hashes, and verify the current four-shot export.

**Architecture:** Extend only `projects/demo/runtime.js` for per-frame clocks, PRNG, timeline registration and settling. Add independent Bun CLI scripts using `loadProject()` and the existing Remotion still-render APIs. Do not change `src/spike/shot.tsx` or the Remotion composition except if an integration test proves it necessary.

**Tech Stack:** Bun scripts/tests, Playwright-core with the pinned Remotion Headless Shell, browser HTML fixtures, Remotion bundler and renderer, built-in Node crypto and OS metadata.

## Global Constraints

- No new dependencies; preserve the fourth `commit` shot and expect 330 full-scene frames at 1920×1080, 30 fps (the initial three shots total 210).
- Existing shot-local frame protocol and `timelines: []` continue working; timers, live video, audio and transitions are not newly supported.
- Verify red before each green; commit each coherent green slice; preserve the existing test suite and docs accuracy.

## File ownership

- `projects/demo/runtime.js`: iframe shot registration and seek/render acknowledgement.
- `tests/spike.test.ts`, `tests/fixtures/deterministic.html`, `tests/fixtures/settling.html`: browser contract tests through existing `host.html`.
- `scripts/validate.ts`, `tests/validate.test.ts`: source warnings CLI and fixture command tests.
- `scripts/hash.ts`: six-still render and environment-specific SHA-256 report.
- `package.json`, `AGENTS.md`, `docs/rendering.md`, `docs/adr/0001-renderer.md`: scripts and accurate contract/docs.

### Task 1: Clock, random and progress

**Files:** `tests/fixtures/deterministic.html`, `tests/spike.test.ts`, `projects/demo/runtime.js`.

**Interfaces:** iframe `mount(path,{id,fps,durationFrames,width,height})` and `seek(frame)` from `tests/fixtures/host.html`. `renderFrame(ctx)` may update visible text for assertions. Runtime must preserve existing `ready`, `rendered`, and `error` messages.

- [ ] Add a fixture HTML page that includes `../../projects/demo/runtime.js`, registers one shot, and prints `Date.now()`, `performance.now()`, an rAF timestamp, `Math.random()`, `ctx.random()` and `ctx.progress` as text in `renderFrame`. The rAF timestamp should be captured via a promise before the renderFrame promise returns.
- [ ] Add browser assertions for 70→10→70 exact equality of both clocks, rAF timestamp and random output; different random output at frame 10; frame 0 progress `0`, frame 89 progress `1`, midpoint frame 1/3 progress `0.5`, and single-frame progress `1`.
- [ ] Run `bun test tests/spike.test.ts`; expect the new tests to fail on clocks/random/progress.
- [ ] In runtime, capture native rAF before overriding it, keep a per-seek `milliseconds` number, set `Date.now = () => 1700000000000 + milliseconds`, set `performance.now = () => milliseconds`, wrap rAF callbacks with the same `milliseconds`, set `Math.random` and `ctx.random` to the same `randomFor(id,frame)` closure, and compute `progress: durationFrames === 1 ? 1 : frame / (durationFrames - 1)`.
- [ ] Run `bun test tests/spike.test.ts`; expect pass. Commit runtime and tests as one slice.

### Task 2: Registration and settled acknowledgement

**Files:** `tests/fixtures/settling.html`, `tests/spike.test.ts`, `projects/demo/runtime.js`.

**Interfaces:** `window.framecraft.timeline(tl)` and `window.framecraft.shot({timelines?:[],renderFrame})`. Both timeline arrays are sought to shot-local seconds before the iframe sends `rendered`; all work runs through the existing seek command.

- [ ] Add a fixture with two paused minimal timeline spies (`time(seconds,false)` changes visible attributes), register one with `framecraft.timeline`, the other in `shot({timelines: [...]})`; assert both read `70/30`, then `10/30`, then `70/30` through iframe seeks.
- [ ] Run `bun test tests/spike.test.ts`; expect registration test to fail.
- [ ] Register timelines on the iframe runtime and seek both registration forms after `renderFrame` and CSS/WAAPI animations. Re-run browser test and commit the green slice.
- [ ] Add a fixture where `renderFrame` appends an image and schedules visible updates from `document.fonts.ready`, `img.decode()`, and two native rAF ticks; after `await seek(frame)`, assert all are reflected. Add a broken image variant and assert `seek()` rejects through `error`.
- [ ] Run browser test red. Await `document.fonts.ready`, `Promise.all(Array.from(document.images, image => image.decode()))`, then two promises scheduled with the originally captured native rAF before emitting `rendered`. Re-run browser tests green; commit.

### Task 3: Validation CLI

**Files:** `scripts/validate.ts`, `tests/validate.test.ts`, `package.json`.

**Interfaces:** `bun run validate` checks `projects/demo`; `bun scripts/validate.ts <fixture-project-root>` checks a test fixture. `loadProject(root)` is the authoritative structural validator; source warnings never set a failure status.

- [ ] Write a command test that creates a temporary valid `project.json`, `scene.json`, and HTML file containing `setInterval(`, `requestAnimationFrame(`, `fetch(`, `https://` and `Math.random(`. Assert output includes five labeled warnings and shot `durationFrames/fps` (seconds), exit status 0. Assert `bun run validate` prints the current four shots and no warnings.
- [ ] Run `bun test tests/validate.test.ts`; expect failure because the CLI does not exist.
- [ ] Implement `scripts/validate.ts` using `loadProject(root)` and `readFile(join(root,shot.entry))`, printing each `id`, frame count and seconds. Test regexes against only the shot HTML for each named warning, and leave warnings nonfatal; print errors and set `process.exitCode=1` only for project or read failures. Add `"validate": "bun scripts/validate.ts"` to package scripts.
- [ ] Re-run CLI tests green, then all tests; commit.

### Task 4: Machine hash, docs and export

**Files:** `scripts/hash.ts`, `package.json`, `AGENTS.md`, `docs/rendering.md`, `docs/adr/0001-renderer.md`.

**Interfaces:** `bun run hash` writes `output/hashes.json` using `title: 0,30`, `diagram: 0,30,70`, `close: 59`. Existing `bundle({entryPoint,publicDir})`, `selectComposition({serveUrl,id})` and `renderStill({serveUrl,composition,frame,output,imageFormat:'png'})` are used without changing the adapter.

- [ ] Run `bun run hash` first to verify the command is missing. Implement one bundle for six stills, hashing actual PNG bytes (`createHash('sha256')`), reporting `Bun.version`, package Remotion version, Chromium's `browser.version()`, `os.platform()/release()/arch()` and SHA-256 per requested frame. Write JSON only on full success using an atomic rename; remove temporary stills in `finally`. Add `"hash": "bun scripts/hash.ts"`.
- [ ] Run `bun run hash`; inspect every requested key, 64-digit SHA-256 and environment versions, and rerun to check on-machine equality. Do not claim cross-machine equality without a second machine. Commit.
- [ ] Document preferred timeline API, deprecated `timelines: []`, frozen clocks and warning limitations in `AGENTS.md` and `docs/rendering.md`. Document second-machine steps: install pinned dependencies/browser, run `bun run hash`, copy/compare both `hashes.json` reports, investigate metadata/version differences on mismatches. Update ADR 0001's Consequences to distinguish observed same-machine determinism from unverified cross-machine identity, timer-driven state, live video, audio and transitions. Commit docs.
- [ ] Run `bun test`, `bun run validate`, `bun run render`, and `node_modules/@remotion/compositor-linux-x64-gnu/ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_read_frames -of json output/intro.mp4`. Expect 330 frames, 1920×1080 and 30/1 fps. Check `git status --short` and report any remaining unverified claims.
