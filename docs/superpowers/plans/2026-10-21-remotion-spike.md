# Phase 0 Remotion Spike Implementation Plan

> **For agentic workers:** Follow the tasks in order. Steps use checkbox (`- [ ]`) syntax for tracking. Do not start the in-house engine before the decision in Task 4.

**Goal:** Decide with a runnable three-shot HTML project whether Remotion can serve as Framecraft's frame renderer.

**Architecture:** Keep the demo project in Framecraft's JSON/HTML format. A small Remotion composition hosts one shot iframe at a time and passes frame messages to a shared shot runtime; an acknowledgement blocks screenshot capture until the iframe is ready. One script drives still and scoped/full MP4 renders and writes measurements. The ADR scores four criteria, then selects the next implementation branch.

**Tech Stack:** Bun, TypeScript, Remotion, React, locally vendored GSAP, Chromium. Remotion's renderer supplies FFmpeg internally for this spike; the in-house branch will use system FFmpeg.

## Global Constraints

- Local-only assets; no remote script or media dependencies at render time.
- Linux first. Install a matching Remotion Chromium before evaluating the render; record versions and exact installation commands.
- Demo video: 1920×1080 at 30 fps, three independent HTML shots: title reveal, CSS+GSAP diagram, closing frame.
- Shots use `window.framecraft.shot({prepare?, renderFrame, dispose?})`, with shot-local integer frames; do not quietly replace them with React-written shots.
- `overlapFrames` is zero in Phase 0. Reject duplicate IDs, invalid durations and path escapes before loading a shot.
- A repeat capture must match pixel-for-pixel; a failed test or unavailable dependency counts as blocked, not a pass.
- The decision threshold is at least three passes out of authoring, determinism, weight and control.

## File map

| Path | Responsibility |
| --- | --- |
| `AGENTS.md` | Minimal agent instructions for independent HTML shot authoring; no vendor-specific authoring instructions. |
| `package.json`, `bun.lock` | Pinned spike dependencies and Bun scripts. |
| `projects/demo/project.json`, `projects/demo/scenes/intro/scene.json` | Versioned three-shot project and hard-cut schedule. |
| `projects/demo/scenes/intro/shots/{01-title,02-diagram,03-close}/index.html` | Independently authored HTML shots. |
| `projects/demo/runtime.js`, `projects/demo/assets/vendor/gsap.min.js` | Spike-only iframe bridge and locally copied, pinned GSAP. |
| `src/spike/project.ts` | Strict manifest loading, path confinement, shot offsets. |
| `src/spike/index.tsx`, `src/spike/shot.tsx` | Remotion registration and frame-to-iframe adapter. |
| `scripts/spike.ts` | Bundle, still, scoped and full render; console-error capture. |
| `tests/project.test.ts`, `tests/spike.test.ts`, `tests/fixtures/host.html` | Manifest checks, standalone bridge seek harness and browser-based capture evidence. |
| `docs/adr/0001-renderer.md`, `docs/rendering.md` | Decision evidence and measured environment. |

### Task 1: Project format and fixtures

**Interfaces:** `loadProject(root: string): Promise<{video: {width:number;height:number;fps:number}; shots: Array<{id:string; entry:string; durationFrames:number; startFrame:number}>; durationFrames:number}>`; paths returned are relative to the project root. Reject shot entries outside that root, including realpath-resolved symlinks.

- [ ] **Step 1: Write failing manifest tests.** In `tests/project.test.ts`, use `bun:test` to assert a valid three-shot manifest has offsets `[0,60,150]` and total `210`; duplicate shot IDs, duration zero, `overlapFrames: 1`, missing entries, `../` traversal and a symlink to an outside file each reject. Create temporary fixtures under `/tmp/opencode`, remove only the fixtures the test created.
- [ ] **Step 2: Run `bun test tests/project.test.ts`.** Expected: missing `loadProject` import/module failure.
- [ ] **Step 3: Add dependencies and fixtures.** Run `bun add remotion@4 @remotion/cli@4 @remotion/bundler@4 @remotion/renderer@4 react@19 react-dom@19 gsap@3 playwright-core` and `bun add -d @types/react@19 @types/react-dom@19`. Save the exact installed versions and `bun.lock`. Add the following manifests and three HTML entries; title animates the word Framecraft, diagram moves a labelled node via CSS and a paused GSAP timeline, and close shows a fixed end card. Keep visual content illustrative, not a product claim.

  `projects/demo/project.json`:

  ```json
  {
    "schemaVersion": 1,
    "id": "demo",
    "title": "Renderer trial",
    "video": {"width": 1920, "height": 1080, "fps": 30, "background": "#101820"},
    "scenes": [{"id": "intro", "path": "scenes/intro/scene.json"}],
    "audio": []
  }
  ```

  `projects/demo/scenes/intro/scene.json`:

  ```json
  {
    "id": "intro",
    "title": "Renderer trial",
    "shots": [
      {"id": "title", "entry": "shots/01-title/index.html", "durationFrames": 60, "overlapFrames": 0},
      {"id": "diagram", "entry": "shots/02-diagram/index.html", "durationFrames": 90, "overlapFrames": 0},
      {"id": "close", "entry": "shots/03-close/index.html", "durationFrames": 60, "overlapFrames": 0}
    ],
    "audio": []
  }
  ```
- [ ] **Step 4: Implement `loadProject` in `src/spike/project.ts`.** Read JSON as data only; require the exact structural fields the fixtures use, positive integer dimensions/fps/durations, unique IDs, zero overlap and existing HTML entries; resolve each entry through `realpath`, rejecting anything outside `realpath(root) + path.sep`. Produce the offsets and duration above. Return actionable errors naming the failing field or path. Do not add a general schema framework for the spike.
- [ ] **Step 5: Write `AGENTS.md` with only the shot API, project/scene paths, zero-based frame convention, `prepare`/`renderFrame`/`dispose`, and local-asset constraints.** It must not require Remotion or React from shot authors. Run `bun test tests/project.test.ts`; expected: all named cases pass. Commit only this task's files.

### Task 2: Frame bridge and Remotion composition

**Interfaces:** The iframe sends `{v:1,type:'ready'|'rendered'|'error',frame?,message?}` to its same-origin parent. The parent sends `{v:1,type:'init',ctx}` once and `{v:1,type:'seek',frame}` per seek. `ShotContext` is `{frame,fps,durationFrames,width,height,seconds,progress,random}`. The HTML entry includes the runtime before its own registration script. `src/spike/shot.tsx` exports `ShotView({entry,durationFrames,fps,width,height}: Props)`.

- [ ] **Step 1: Add a browser test in `tests/spike.test.ts` and `tests/fixtures/host.html` that loads the diagram iframe under a local `Bun.serve` host, sends `init`, then seeks local frames `70,10,70` in one browser page and compares the two frame-70 PNG buffers byte-for-byte.** Also verify the frame-10 image differs, an injected shot error rejects the seek, and a missing acknowledgement times out. Use `playwright-core` pointed at the same pinned Chromium as Remotion (supply the executable path explicitly when running the test), no personal browser profile. The Remotion render test in Task 3 separately verifies that the adapter respects `rendered` before capture; do not misrepresent this standalone bridge test as an integrated Remotion reverse-seek test.
- [ ] **Step 2: Run `bun test tests/spike.test.ts`.** Expected: missing bridge/composition failure.
- [ ] **Step 3: Implement `projects/demo/runtime.js`.** Accept registration, await `prepare`, emit `ready`; on `init` store dimensions and fps; on `seek`, validate the integer frame range, build shot-local `ctx`, call `renderFrame(ctx)`, pause `document.getAnimations()` and set their `currentTime` to `ctx.seconds * 1000`, seek the registered paused GSAP timeline, then emit `rendered`. On thrown/rejected work emit `error`. Seed the same RNG for each request using the shot ID and frame. Do not claim virtual clocks or video seeking are supported by this spike unless exercised; note uncovered behavior in the ADR.
- [ ] **Step 4: Implement `src/spike/shot.tsx`.** Render Remotion's `<IFrame>` using `staticFile(entry)`. On each `useCurrentFrame()` change, acquire a `delayRender` handle, send `seek` after `ready`, and call `continueRender` only when a same-origin `rendered` message from that iframe has the expected frame. Forward `error` to `cancelRender`; use a finite timeout and clean up listeners/timers/handles on frame change or unmount. Reinitialize on iframe load. Keep frame-local data inside a `<Sequence>` so a scoped shot starts at zero.
- [ ] **Step 5: Register `intro` and individual shot compositions in `src/spike/index.tsx` with `registerRoot`, `<Composition>` and hard-cut `<Sequence>` positions taken from the manifests.** `scripts/spike.ts` must call `loadProject` *before* bundling; the composition uses static JSON imports because Remotion's registration is synchronous. Use `bundle({entryPoint,publicDir: projectRoot})` in the render script so the independent HTML files are served as local assets. Copy one pinned `gsap.min.js` from the installed `gsap` package to `projects/demo/assets/vendor/`; load it only in the diagram shot. Run `bunx remotion browser ensure` for its matching Chromium.
- [ ] **Step 6: Run the seek test and a 1920×1080 still.** If CSS timing or iframe waiting fails, record the failure; fix the adapter only within a short spike, not by rewriting the HTML shots into React. Commit this task's source/tests.

### Task 3: Export and cost measurements

**Interfaces:** `bun run spike:still --frame 30 --shot diagram` writes `projects/demo/output/snaps/diagram-30.png`; `bun run spike:render` writes a full 210-frame MP4; `bun run spike:render --shot diagram` writes a 90-frame MP4. Every operation exits nonzero on browser/console errors and deletes only its own partial output.

- [ ] **Step 1: Add tests asserting the scoped composition length and full composition length, a successful still at requested frame, and nonzero exit/no output when an HTML shot raises an error.** Use `ffprobe` only if installed; Remotion itself can supply FFmpeg for encoding.
- [ ] **Step 2: Run `bun test`.** Expected: new export assertions fail.
- [ ] **Step 3: Implement `scripts/spike.ts` with `bundle`, `selectComposition`, `renderStill` and `renderMedia`; parse only the two commands and `--frame`/`--shot` flags.** Select the shot composition for scoped operations and `intro` for a full render. Capture browser logs/errors, create the output directory, and remove an incomplete output on failure. Print elapsed time, file size, dependency disk size and browser version. Avoid adding a general-purpose product CLI.
- [ ] **Step 4: Run `bun test` with the pinned Chromium executable path, then repeated Remotion stills at diagram frame 70 and the standalone reverse-seek sequence in the same browser.** Compare SHA-256 hashes and inspect the stills. Render a full and shot-only MP4, then use `ffprobe -count_frames` to verify 210 and 90 video frames, 1920×1080 and 30 fps. If ffprobe is unavailable, record frame-count verification as blocked instead of passing it.
- [ ] **Step 5: Record install time and `du -sh node_modules`, browser download and render timings.** For each of the three shot types, capture at least 20 warmed-up frames and report median capture milliseconds, peak RSS and real-time factor. This Remotion measurement is not the in-house Playwright-vs-CDP comparison; that comparison only occurs if the in-house branch is chosen. Commit source, tests and lockfile; leave generated video, stills and browser binaries untracked.

### Task 4: Score the gate and choose one branch

**Files:** Create `docs/adr/0001-renderer.md`, `docs/rendering.md`; amend `AGENTS.md` only if the authoring test exposes a real omission.

- [ ] **Step 1: Run the authoring test with only the instructions available to a coding agent in `AGENTS.md`; keep the resulting independent HTML shot as evidence or mark the criterion blocked if no agent-authored test is run.** Do not delegate agent work without the user's explicit authorization.
- [ ] **Step 2: Fill in the ADR with a four-row pass/fail/blocked table, observed commands and output, compatibility limits, dependency size and license restrictions.** Remotion's published license is free for individuals and eligible organizations up to three people; larger for-profit teams need a paid license. Record which usage model is being evaluated, not an invented license exemption.
- [ ] **Step 3: Apply the threshold exactly: three or four supported passes chooses the thin Remotion layer; otherwise choose the in-house engine.** Blocked is not pass. `docs/rendering.md` lists Bun, Remotion, Chromium and FFmpeg versions actually used and exact reproduction commands. Commit evidence and decision.
- [ ] **Step 4: Stop at the decision gate.** If Remotion wins, write the follow-on thin-layer plan; otherwise write a separate in-house Phase 0 engine plan covering WAAPI/GSAP/clocks/RNG, bridge, validation, capture and export. Do not implement both branches.

## Self-review checkpoints

- The trial must keep the exact independent HTML entries. If an adapter makes that impractical, that is evidence against Remotion, not permission to change the question.
- The bridge seek test must reuse the same browser/page for `70,10,70`; two fresh `renderStill` calls alone cannot prove reverse seeking. Remotion integration still needs its own frame-change test; if it cannot be demonstrated, score determinism blocked.
- A `ready`/`rendered` acknowledgement is mandatory before screenshot capture. Browser-console failures, missing acknowledgements and missing dependencies are surfaced, never counted as passes.
- No Studio UI, audio, transitions, cloud service or marketing site is in this plan; the `design-taste-frontend` skill becomes relevant when the Studio UI is built in Phase 1.
