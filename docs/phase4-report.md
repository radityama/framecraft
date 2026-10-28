# Phase 4 engineering report

## A. Executive summary

Phase 4 adds a manifest-driven timeline, persistent source-bound visual feedback, immutable revision comparison and an optional vanilla-JavaScript motion library. It extends the existing Studio and production pipeline; it does not replace the rendering engine or introduce an agent dependency.

**Phase 4 is complete in the verified Linux/Chromium environment.** The final suite passed 108 tests and 873 assertions. Real browser annotation, persistence, comparison, keyboard, responsive and stress checks passed; existing frame hashes and audio regressions remain intact. Actual MP4s and retained review frames were inspected. Evidence is retained under `output/phase4-QHmkdV/` (ignored by Git). Cross-platform pixel identity and human editorial approval are not claimed.

The initial checkout was `main` at `e5437ae` with only the pre-existing, untracked `.taste-skill/` directory. The fresh baseline was **95 passing tests, 692 assertions, 19 files**, in 311.19 seconds, with a passing typecheck. Those numbers were measured for this task, not copied from the Phase 3.5 report.

## B. Architecture

### Canonical timeline and playback

- `src/timeline.ts` validates integer frames and the existing integer FPS contract. Shots occupy `[startFrame, startFrame + durationFrames)`. Conversion, clamping, shot navigation and scene/shot mapping are shared with review selection.
- Studio retains one selected scene frame. The playhead, inspector, frame counter, timecode and annotations derive from it. Paused seeks become ready only after the existing mounted-iframe acknowledgement for the requested frame; superseded acknowledgements cannot complete a newer seek.
- The pinned Remotion Player owns the only playback clock. Inspection of its installed `use-playback` and `calculate-next-frame` implementation confirmed a `performance.now()` origin and elapsed-time frame calculation, rather than one increment per callback. Existing playback rates change presentation only. No second RAF scheduler was added.
- Explicit scene changes pause and reset to zero. A shot URL selects that shot's beginning. Stop pauses and seeks zero. Frame stepping clamps at scene limits and crosses shot boundaries exactly.
- Fit and 1–16× zoom change the scrollable timeline width only. The ruler, segments and playhead use the same `frame / durationFrames` coordinate. Labels expose shot ranges and duration; a native integer range and numeric frame field provide pointer and keyboard seeking.
- Ruler density follows the actual panel width through `ResizeObserver`, including enlarged UI text. The iframe adapter supplies internal shot-ID metadata: URL matching was ambiguous when multiple shots reused one HTML entry. A 1,000-shot stress fixture exposed that existing bug; the new browser regression reproduces it before the identity-based fix.

### Feedback and persistence

- Feedback schema version 1 is distinct from immutable review manifests. Each issue has a UUID, project/scene/shot, scene and shot-local frame, source SHA-256, severity, category, status, description and optional normalized point/rectangle or portable capture reference.
- Runtime parsing rejects unknown fields, duplicate IDs, invalid identities, unsupported enums, invalid numbers/geometry and machine-specific artifact paths. A document contains at most 1,000 issues; HTTP bodies are bounded to 1 MiB.
- The launch-authorized workspace defaults to `output/studio-workspace`. Files are named `project__scene.feedback.json`. Browser inputs are IDs, never filesystem paths. Startup rejects workspace placement inside any authorized project or revision.
- Saves require same-origin JSON and an expected content digest. Exclusive per-document locks, regular-file/symlink checks, a synchronized temporary file and atomic rename prevent blind overwrite. A stale editor receives HTTP 409 and retains its form. Historical manifests and PNGs are not written.
- Source identity is checked on load, explicit reload and return to window focus. Older checks are aborted. A changed digest pauses and reloads only the preview at the selected frame, preserving the draft and stale issues. Revalidation is explicit, checks frame mapping and removes the obsolete capture link; it does not resolve the issue automatically.
- Saved feedback exports as JSON and actionable Markdown. `bun run review:feedback` validates, imports or exports the same schema without an agent plugin, provider API or Studio session. See [feedback.md](feedback.md).

### Immutable comparison

- Repeated launch-time `--review <directory>` arguments explicitly authorize captured revisions. Manifest bytes define the revision ID. Loading verifies the existing strict manifest, capture policy, summary, PNG hashes and decoding without requiring historical source to equal today's source.
- The normal `review --check` retains its stricter current-source verification. Exporting `parseManifest` did not relax that verifier.
- Comparison requires matching project, scene, video dimensions/FPS, complete shot layout, and exact shot/local/global frame identity. Changed layouts or absent shared captures are explicitly unavailable, not approximated.
- Side-by-side and adjustable split views load only the selected pair of PNGs. Image requests use a verified revision ID and capture index; no browser-supplied path is read. Hashes are rechecked when images are served.

### Motion primitives and Studio integration

- `authoring/motion.js` is an optional dependency-free browser script, copied into a project's local assets. Explicit-input easing, interpolation, timing, keyframes, cursor and 2D camera mathematics have no clock or hidden animation state. DOM/SVG helpers assign the complete requested state. Raw HTML/CSS/JS/SVG authoring remains supported.
- Numeric keyframes clamp outside their endpoints and reject empty, duplicate, nonmonotonic or nonnumeric entries. Cubic Bézier X controls are constrained to `[0,1]`. Optional cursor variation requires an explicit seed and changes control points, not per-frame jitter.
- Four independent HTML shots in `projects/motion` demonstrate cursor/click, window translation/scale, word/character/line reveal and camera focus. They use local fonts/assets and the existing shot protocol; the scene is 360 frames, 640×360, 30 FPS, silent.
- `Timeline`, `ReviewPanel`/overlay and `Comparison` separate functional surfaces without rebuilding Studio. The shot inspector exposes actual manifest metadata and declared audio assets, not controls that imply source editing. Existing routes, transport acknowledgements, retry states, fonts and quiet dark visual language remain.

## C. Implementation inventory

| Area | Files |
| --- | --- |
| Shared frame mapping | `src/timeline.ts`, compatibility exports in `src/studio/frame.ts`, `src/review/frames.ts` |
| Unambiguous iframe acknowledgement | Internal `data-framecraft-shot-id` metadata in `src/spike/shot.tsx`, consumed by Studio |
| Studio integration | `src/studio/Studio.tsx`, `Timeline.tsx`, `ReviewPanel.tsx`, `Comparison.tsx`, `studio.css` |
| Feedback contract/persistence | `src/review/feedback.ts`, `feedback-store.ts`, `src/studio/review-api.ts` |
| Historical integrity/comparison | `src/review/revisions.ts`, `comparison.ts`, exported parser in `artifacts.ts` |
| CLI/server | `scripts/feedback.ts`, `scripts/studio.ts`, `package.json` |
| Optional authoring library | `authoring/motion.js`, identical project-local `projects/motion/assets/motion.js` |
| Real authoring examples | `projects/motion/project.json`, scene/shot manifests and briefs, four shot HTML files, local runtime/fonts/licenses/styles |
| Tests | `tests/timeline.test.ts`, `feedback.test.ts`, `feedback-cli.test.ts`, `review-workflow.test.ts`, `motion.test.ts`, `phase4-browser.test.ts`; narrowly adapted existing Studio tests |
| Documentation | `docs/phase4-architecture.md`, `feedback.md`, `motion.md`, `studio.md`, `rendering.md`, `agent-workflow.md`; motion and visual-review skill guides |

No dependency versions, Demo/Showcase sources, production rendering compositions or HTML runtime protocol were changed.

## D. Verification matrix

### Completed checks

| Check | Executed command / method | Observed result |
| --- | --- | --- |
| Fresh baseline | `bun run typecheck`; `bun test` | Typecheck passed; 95 tests passed, 0 failed, 692 assertions, 19 files, 311.19 s |
| Complete integration checkpoint | `FRAMECRAFT_EVIDENCE=output/phase4-QHmkdV/browser-final-pass bun test` | **107 passed, 0 failed, 868 assertions, 25 files, 264.94 s**; retained `logs/tests-verified.log`; followed by the shared-entry stress regression/fix |
| Final complete suite | `FRAMECRAFT_EVIDENCE=output/phase4-QHmkdV/browser-complete bun test` | **108 passed, 0 failed, 873 assertions, 25 files, 272.35 s**, including the shared-entry regression; `logs/tests-complete.log` |
| Final typecheck / whitespace | `bun run typecheck`; `git diff --check` | Both passed after the final production changes |
| Focused contracts | `bun test tests/feedback-cli.test.ts tests/feedback.test.ts tests/timeline.test.ts tests/motion.test.ts tests/review-workflow.test.ts` | 7 passed, 0 failed, 147 assertions, 5 files, 6.05 s |
| Existing browser regressions | `bun test tests/studio-browser.test.ts` | 13 passed, 0 failed, 71 assertions, 36.16 s at the integration checkpoint |
| Installed playback calculation | `bun /tmp/opencode/framecraft-phase4/player-clock.ts` | 29 assertions passed across all four rates, delayed callbacks and end behavior; `player-clock.json` |
| Strict native-size parity | `FRAMECRAFT_EVIDENCE=output/phase4-QHmkdV/browser-parity bun test tests/phase4-browser.test.ts --test-name-pattern 'native-size'` | Both 640×360 decoded RGBA hashes matched; 1 passed, 4 filtered, 3 assertions, 19.40 s |
| Motion static validation | `bun run validate --project projects/motion --scene examples` | Four 90-frame shots, no warnings after direct font links were added |
| UI detector | `node /home/radityra/.agents/skills/impeccable/scripts/detect.mjs src/studio/Studio.tsx src/studio/Timeline.tsx src/studio/ReviewPanel.tsx src/studio/Comparison.tsx src/studio/studio.css` | Exit 0, no findings |
| Fresh production verification | `bun /tmp/opencode/framecraft-phase4/verify.ts` | All **22 commands** exited 0; full arguments/output/timing in `media/commands.json` |
| Frame determinism / old baselines | Eight `bun run hash` invocations, two each for Demo/intro, Showcase/pulse, Showcase/signal and Motion/examples | 72 PNG hashes across 36 selected identities; repeated maps matched. All 24 Demo/Showcase identities also matched retained Phase 3.5 maps exactly; no golden files were changed |
| Current review verification | `bun run review --project projects/motion --scene examples --output ... --milestone cursor:55 --milestone cursor:60 --milestone type:35 --milestone camera:70`, followed by `--check` | 24 captures, validation exit 0 with no warnings/errors; all capture hashes and current-source checks passed |
| Audio regression | Existing `audio-export`, audio asset/cue and Studio tests within the full suite; four fresh exports | Existing spectral/trim/loop/fade/isolation checks passed; Demo and both Showcase scenes retain AAC, the new Motion fixture has no audio stream |
| Feedback / comparison | Real CLI/server browser tests plus `bun run review:feedback --check output/phase4-QHmkdV/browser-complete/feedback.json` | Persistence, edit/resolve/delete, source staleness, explicit revalidation, two-window conflict retention, JSON/Markdown export and exact two-image matched comparison passed |
| Keyboard / responsive / stability | `bun /tmp/opencode/framecraft-phase4/accessibility.ts` | Passed: keyboard-only point annotation, 1440/768/390 layouts, 200% CSS zoom, loaded fonts, reduced-motion preference, 44 px phone controls, visible focus, 1,200 acknowledged seeks and a 1,000-shot exact seek; `accessibility-verified/checks.json` |
| Post-hardening production proof | `bun /tmp/opencode/framecraft-phase4/final-proof.ts`, resumed with `RESUME_PROOF=1` after a verification-helper fix | 13 successful commands recorded in `final-proof/commands.json`: typecheck, diff check, four fresh hash maps, fresh Motion MP4/probe, decoded video samples, feedback validation, named review summary/check and UI detector |
| Encoded media inspection | `bun /tmp/opencode/framecraft-phase4/inspect-mp4.ts` using bundled FFmpeg `trim=start_frame=...:end_frame=...` | Seven PNGs decoded from four actual exports and opened individually; `media/decoded-mp4/commands.json` records all seven successful extractions |
| Final evidence audit | `bun /tmp/opencode/framecraft-phase4/audit.ts` | Passed: actual suite/command counts, current source digests, accepted named review integrity, empty unexpected browser errors, exact Git report blocks and all 38 visual-gate rule records; `final-audit.json` |

The parity test uses the same installed Chromium and `--font-render-hinting=none` as Remotion, native frame dimensions and an integer-aligned capture. It hashes decoded RGBA, not PNG encoder metadata. A fractional screenshot crop initially added one row; default Playwright font hinting initially changed typography pixels. Both environment differences were corrected in the test harness. No tolerance or golden-hash update was used to hide a rendering difference.

Coverage includes exact boundaries/rates/zoom/keyboard, cross-shot inspector synchronization, stale asynchronous seeks, two-window feedback conflicts with retained drafts, reload persistence, normalized geometry, source changes and explicit revalidation, resolve/delete confirmations, portable exports, two-image matched comparison, historical immutability and authorization/write-boundary failures. Negative tests exercise malformed schema, symlinks, traversal, unsupported mapping, corrupt PNGs, same-origin/content-type requirements, the body limit and stale update rejection.

The final proof initially stopped in an external inspection helper because the bundled FFmpeg excludes the `select` filter. Replacing that helper's filter with supported frame-index `trim` completed the remaining checks. The failed attempt is retained in `final-proof/commands-failed-attempt.json`; it was not a production render failure. The four post-hardening hash maps still match all 36 previously selected frame identities, and all three project source digests remain unchanged.

The supplemental large-scene check found a real acknowledgement bug: shots sharing one HTML URL were identified as the first matching URL. The regression failed at the second shot before the fix. Internal iframe shot-ID metadata now disambiguates these acknowledgements without changing the public HTML protocol or rendered pixels. The narrow fix is in `src/spike/shot.tsx` and Studio's existing message gate, not a new bridge or renderer.

Fresh FFprobe results (`media/ffprobe.json`), with H.264/yuv420p at 30/1 FPS:

| Export | Dimensions | Decoded video frames | Video duration | Audio / container duration |
| --- | --- | ---: | ---: | --- |
| Demo/intro | 1920×1080 | 330 | 11.000 s | AAC, 11.008 s container (encoder padding) |
| Showcase/pulse | 960×540 | 96 | 3.200 s | AAC, 3.200 s |
| Showcase/signal | 960×540 | 96 | 3.200 s | AAC, 3.200 s |
| Motion/examples | 640×360 | 360 | 12.000 s | No audio, 12.000 s |

All 882 video frames were counted by FFprobe. Project digests before/after the media run were identical (`media/source-before.json`, `source-after.json`):

```text
demo      c14ff630deebdaa2bdcbc8b085283953ce3b2a35a547aefb0b17e05e57db9e78
showcase  670d3b8ff2ec795632bca6eedde02597aee0c5b8df4ce15f91207217015bd167
motion    e0765df2c2ee0bb9fc08112d76f1ad053815590bc97cdda898ae920bf02fbb85
```

The final browser performance sample (`browser-complete/performance.json`) measured CLI startup at 2,865.66 ms, 180 acknowledged seeks in 15,434.85 ms, median seek 83.38 ms, maximum 236.88 ms, and one frame step at 133.57 ms. CDP used JS heap after forced GC changed from 6,439,752 to 7,255,068 bytes. This includes test-driver overhead and is not a whole-process RSS or leak guarantee. Environment: Linux x64, Bun 1.4.4, Chromium 157.0.8080.0, Remotion 4.0.537, React 19.3.1.

Supplemental checks used one browser instance and the real CLI server. Tab navigation, native range keys and Enter created and selected a point issue at scene frame 1, coordinates `(0.25, 0.4)`, without pointer input. At 1440, 768 and 390 px, document scroll width equaled viewport width; fonts actually loaded and reduced-motion preference was enabled. All 41 measured phone controls were at least 44 px high. Focus was a visible 2 px solid outline. At 200% **CSS body zoom** the page had no horizontal overflow and ruler labels did not overlap; this is not a claim about every browser's native zoom implementation. All four resulting screenshots were opened.

The longer check completed **1,200 acknowledged seeks in 96,053.10 ms**. Each 300-seek batch had median latency between 83.21 and 83.34 ms; the maximum observed seek was 245.39 ms. Post-GC used JS heap samples were 7,294,636 / 7,529,560 / 7,566,312 / 7,563,872 bytes. Embedder heap still grew from 2,507,400 to 3,945,336 bytes, so this bounded run is not evidence of zero native-memory growth. No page or console errors were observed. A separate 1,000-shot / 30,000-frame scene became ready in 857.03 ms and acknowledged frame 12,345 in 419.63 ms with inspector shot `shot-411`; its ruler used eight labels. Raw measurements and per-control geometry are in `accessibility-verified/checks.json`.

## E. Visual evidence

Evidence lives under `output/phase4-QHmkdV/`. The first integrated browser capture set, `browser-pass1/`, was opened individually: desktop timeline, desktop and phone rectangle annotation, side-by-side and split comparison. This inspection found crowded timeline heading/ruler labels; those were corrected without changing the incumbent visual direction.

All nine final browser PNGs in `browser-complete/` were opened: `timeline-desktop.png`, `annotation-desktop.png`, `annotation-phone.png`, `comparison-side.png`, `comparison-split.png`, and both `review-study` and `motion` preview/render pairs. They show the exact inspector/playhead frame, normalized rectangle placement under scaling and correctly matched revision frames. Native-size parity pairs were also compared by decoded pixel hash. `browser-errors.json` is empty.

All **24** Motion review PNGs in `media/motion-review/screenshots/` were opened individually: cursor frames 0/22/44/55/60/66/89; window 0/22/44/66/89; type 0/22/35/44/66/89; camera 0/22/44/66/70/89. Cursor movement/click highlighting, complete window transforms, intentional staged typography reveal and focus framing match their briefs. No missing assets or unintended clipped text were found. Typography is intentionally unrevealed at its opening frame. An explicit **accepted** decision names agent **GPT-6.1 Sol** and records those findings, not human editorial/audio approval. Regenerated summary and current-source verification both passed after that decision.

Seven actual encoded-video samples were also opened: Demo frame 165, Showcase pulse/signal frame 71, and Motion frames 55/134/224/340. They show the expected title, ring/receive states, cursor click, moving window, typography reveal and camera focus, without missing assets or unexpected framing changes. H.264 exports are lossy; exact RGBA parity assertions apply to the PNG preview/render pairs, not these encoded samples.

Primary artifact paths, relative to the evidence root:

- Timeline: `browser-complete/timeline-desktop.png`.
- Annotation and portable handoff: `browser-complete/annotation-desktop.png`, `annotation-phone.png`, `feedback.json`, `feedback.md`.
- Before/after fixtures: `browser-complete/before/`, `after/`, `comparison-side.png`, `comparison-split.png`.
- Motion samples: `media/motion-review/manifest.json`, its screenshots and summary.
- Actual MP4s: `media/demo-intro.mp4`, `showcase-pulse.mp4`, `showcase-signal.mp4`, `motion-examples.mp4`.
- Fresh post-hardening Motion MP4: `final-proof/motion-examples.mp4`, with `ffprobe.json`; decoded media samples: `media/decoded-mp4/*.png`.
- Keyboard point annotation and responsive views: `accessibility-verified/keyboard-feedback.json`, `studio-1440.png`, `studio-768.png`, `studio-390.png`, `studio-css-zoom-200.png`.

## F. Risks and limitations

- Supported verification is the installed Linux/Bun/Chromium environment. Pixel identity across unrelated browsers, operating systems, font rasterizers or machines is not claimed. Match the documented browser flags for strict pixel comparisons.
- Locally authorized HTML is executable user-controlled code. Localhost, origin, ID and filesystem boundaries are not a sandbox for untrusted projects. No remote sharing or arbitrary command endpoint was added.
- Source digests cover the entire project, so an unrelated file change conservatively marks scene feedback stale. Checks happen on load/focus/manual reload, not continuous filesystem watching. Manifest structure changes still require restarting Studio.
- Comparison deliberately rejects changed shot layouts instead of guessing a temporal mapping. It compares retained captured frames, not every frame of two videos.
- Feedback is single-document optimistic concurrency, not multiuser collaboration. A process crash may leave a lock file; the documented recovery requires confirming no writer is active before removing only that lock. Forced termination can also leave render temporary files.
- Atomic replacement prevents partial feedback files; it does not promise recovery from disk failure or every power-loss/filesystem scenario. Back up the auditable workspace files.
- Motion helpers are numeric/2D, not a graph editor, spring simulation or authoring framework. Example audio remains silent; existing project audio is preserved. Narration is strictly opt-in.
- Performance measurements are bounded local samples, not an all-day leak proof or a hardware-independent latency guarantee. Export jobs remain separate from the editor; no speculative frame cache was introduced.
- Agent visual decisions are labeled as such and do not substitute for human editorial or audio approval.

## G. Git state

- Initial branch/HEAD: `main`, `e5437ae` (`feat: complete multi-project scene pipeline`).
- Initial tracked diff: empty; initial untracked content: `.taste-skill/` only.
- The pre-existing `.taste-skill/` content was not edited, staged or removed.
- No commit, push, reset, clean, stash, rebase, merge, new worktree or dependency upgrade was performed for Phase 4.

Final `git status --short` (unchanged by ignored verification outputs):

```text
 M docs/agent-workflow.md
 M docs/rendering.md
 M docs/studio.md
 M package.json
 M scripts/studio.ts
 M skills/framecraft-motion/SKILL.md
 M skills/framecraft-visual-review/SKILL.md
 M src/review/artifacts.ts
 M src/review/frames.ts
 M src/spike/shot.tsx
 M src/studio/Studio.tsx
 M src/studio/frame.ts
 M src/studio/studio.css
 M tests/studio-browser.test.ts
 M tests/studio.test.ts
?? .taste-skill/
?? authoring/
?? docs/feedback.md
?? docs/motion.md
?? docs/phase4-architecture.md
?? docs/phase4-report.md
?? projects/motion/
?? scripts/feedback.ts
?? src/review/comparison.ts
?? src/review/feedback-store.ts
?? src/review/feedback.ts
?? src/review/revisions.ts
?? src/studio/Comparison.tsx
?? src/studio/ReviewPanel.tsx
?? src/studio/Timeline.tsx
?? src/studio/review-api.ts
?? src/timeline.ts
?? tests/feedback-cli.test.ts
?? tests/feedback.test.ts
?? tests/motion.test.ts
?? tests/phase4-browser.test.ts
?? tests/review-workflow.test.ts
?? tests/timeline.test.ts
```

Final tracked `git diff --stat`:

```text
 docs/agent-workflow.md                   |  2 +-
 docs/rendering.md                        |  1 +
 docs/studio.md                           | 19 ++++---
 package.json                             |  1 +
 scripts/studio.ts                        | 18 +++++--
 skills/framecraft-motion/SKILL.md        |  2 +
 skills/framecraft-visual-review/SKILL.md |  2 +
 src/review/artifacts.ts                  |  2 +-
 src/review/frames.ts                     |  3 +-
 src/spike/shot.tsx                       |  2 +-
 src/studio/Studio.tsx                    | 67 ++++++++++++++++++------
 src/studio/frame.ts                      | 13 +----
 src/studio/studio.css                    | 87 +++++++++++++++++++++-----------
 tests/studio-browser.test.ts             |  6 +--
 tests/studio.test.ts                     |  4 +-
 15 files changed, 153 insertions(+), 76 deletions(-)
```

Tracked diffstat excludes all new modules, tests, documentation and the Motion project. The complete expanded untracked file list, including fonts and licenses, is retained in [`git-status-all.txt`](../output/phase4-QHmkdV/git-status-all.txt); exact status, numstat and HEAD records are beside it. All changes except the untouched `.taste-skill/` are Phase 4 work. Render evidence remains ignored under `output/`.

## H. Phase 5 readiness

Phase 4 establishes useful seams for evaluating a future browser-native backend: canonical integer frames, independent feedback, immutable revision identity, exact-frame comparisons and a provider-neutral authoring contract. It does not prove that a new backend can replace Chromium/Remotion export.

Before Phase 5 implementation, run the deterministic corpus on another pinned host and evaluate native font/image/CSS/SVG/GSAP parity, seek cancellation, audio scheduling/muxing, encoder output and memory limits. Keep the existing pipeline as the reference until a separate backend passes that corpus. Browser-native export, WebCodecs, a new compositor and agent orchestration were not implemented.

### Visual direction and decision record

This is an Operate surface for motion authors, extending the incumbent preview-first video workspace. Dials remain **ENERGY 1 / RHYTHM 1 / MOTION 1**. No replacement visual world, generated brand assets or gallery-style decorative motion was introduced.

- Dark neutral surfaces recede behind footage and avoid biasing color judgment.
- The existing Plex Sans UI and Mono frame/time readouts preserve readable editorial hierarchy and aligned timing figures.
- Navigation, preview and inspector occupy separate desktop columns because they answer different authoring questions; narrow screens stack these tasks instead of shrinking the desktop layout.
- White playhead/region outlines, blue focus/selection and explicit status text make frame position and feedback state identifiable without color alone.
- Native controls, numeric frame/geometry fields and a shortcut disclosure provide keyboard equivalents to timeline and spatial pointer operations.
- Only two captured images are mounted for comparison because exact-frame inspection does not require retaining video frame sequences.

## Definition of done

All checks below refer to the measured environment and evidence above, not every browser or machine.

- [x] Phase 3.5 workflows, project selection and external authorization remain functional.
- [x] Canonical integer frames, half-open shot intervals and shared mapping drive the timeline.
- [x] Seeking and paused frame stepping are exact, including boundaries and reused HTML entries.
- [x] Playback uses the existing monotonic elapsed-time scheduler; all four preview speeds work.
- [x] Fit, zoom and horizontal navigation do not change exported timing.
- [x] Preview, playhead, timecode, active shot, inspector and annotations stay synchronized.
- [x] Superseded asynchronous acknowledgements cannot finish a newer seek.
- [x] Shortcuts work without intercepting text/native form input; keyboard-only annotation works.
- [x] UUID annotations persist, edit, resolve and delete with explicit actions and conflict protection.
- [x] Normalized point/rectangle geometry remains aligned as the preview scales.
- [x] Exact source identity, visible staleness and explicit revalidation preserve older feedback.
- [x] Versioned JSON, actionable Markdown and provider-neutral CLI handoff are validated.
- [x] Before/after comparison uses exact matched frame identities and refuses incompatible layouts.
- [x] Optional motion primitives are deterministic and run in ordinary HTML/CSS/JS/SVG shots.
- [x] No mandatory agent/provider dependency, source editor or autonomous dispatch was introduced.
- [x] Historical review artifacts remain separate from writable feedback.
- [x] Existing audio behavior and all 24 sampled Phase 3.5 frame hashes remain unchanged.
- [x] Actual MP4 export, current-source review verification and encoded-media inspection pass.
- [x] Local authorization, origin, schema, body-size, path and atomic-write boundaries are tested.
- [x] Typecheck, 108 tests, real browser checks and bounded performance checks pass.
- [x] Actual screenshots and media were opened; documentation matches implemented behavior.
- [x] No unauthorized Git operations occurred; `.taste-skill/` remains untouched.

## Visual delivery gate

Scope: the incumbent dark Studio and four supplied-purpose motion examples, tested at 1440/768/390 px with reduced-motion preference and 200% CSS zoom. This is an evidence-backed gate, not a claim of complete WCAG certification.

### Hard gate

- R-02 PASS: new UI/report prose uses ordinary punctuation; no em dash was added.
- R-03 PASS: three measured viewport widths have no page overflow; all 41 measured phone controls are at least 44 px.
- R-17 PASS: displayed frame, duration, issue and revision numbers come from manifests or saved feedback; performance numbers link to measured JSON.
- R-18 PASS: no testimonials, invented reviewers or avatar identities were added; the agent review is explicitly labeled.
- R-23 PASS: no unrequested logo or people assets were invented; requested motion examples use local DOM/SVG and licensed existing fonts.
- R-24 PASS: project/scene/shot navigation reaches authorized content; invalid selections show recovery actions in real browser tests.
- R-25 PASS: `contrast.json` records tested text ratios of at least 4.82:1 and focus at 8.21:1; selected timeline metadata uses white text.
- R-26 PASS: transport, rates, navigation, zoom, frame fields, annotation CRUD/revalidation, exports and comparison controls perform their named actions in browser tests.
- R-27 PASS: loading, empty, API/frame errors, retry, stale feedback, conflict and unsupported comparison states have explicit UI and tests.
- R-28 PASS: no template FAQ was added.
- R-32 PASS: Tab/native keys/Enter create feedback without pointer input; focused project control has a measured 2 px solid outline.
- R-33 PASS: UI changes were made directly in source files; no source/CSS-rewriting feature script was introduced.
- R-34 PASS: the existing fixed dark workspace is retained; no nonfunctional alternate theme toggle is shipped.
- R-35 PASS: the real server was run; project/scene/shot selectors, start/end/stop, play/pause, frame/shot steps, all rates, scrubbing, zoom/fit, feedback actions, exports and both comparison modes were exercised with zero unexpected browser errors.
- R-36 PASS: no security certification, hardware-independent performance or cross-machine pixel claim is made.
- R-37 PASS: existing preview-first Studio direction was inspected before implementation and preserved; no redesign was substituted.
- R-38 PASS: interface content comes from real projects, review manifests and saved issues; example shots are explicitly authoring examples.

### Purpose gate

- R-01 PASS: existing blue is a functional selection/focus accent; no decorative gradient treatment was added.
- R-04 PASS: no generic feature-icon set was added; the cursor SVG demonstrates the requested cursor trajectory.
- R-06 PASS: locally loaded Plex Sans supports UI reading; Mono preserves aligned frame/time inspection, verified with loaded-font checks.
- R-07 PASS: ruler ticks represent actual frame positions; no decorative background grid was added.
- R-08 PASS: no decorative CTA arrows were added; timeline controls are named operations.
- R-09 PASS: stale/status labels convey actual feedback state, not promotional badges.
- R-10 PASS: no glass or backdrop-blur panel was introduced.
- R-12 PASS: no resting panel shadows were added; annotation edge contrast marks the actual region over variable footage.
- R-13 PASS: no decorative glow treatment was added.
- R-14 PASS: the interface uses task panels, lists and forms rather than a feature-card grid.
- R-19 PASS: UI decoration does not animate; project motion is explicit frame-driven content with tested seeks.
- R-22 PASS: DOM/SVG examples illustrate requested cursor, window, typography and camera operations, not unrelated decorative illustrations.

### Liveliness and hierarchy

- PASS: ENERGY 1 / RHYTHM 1 / MOTION 1 consistently match a restrained Operate workspace, not a marketing page.
- PASS: the main preview remains the desktop focal point, confirmed in opened timeline/annotation screenshots.
- PASS: timing figures, shot metadata and feedback fields have distinct readable hierarchy in desktop and stacked narrow layouts.
- PASS: spacing separates navigation, preview, inspector and timeline tasks; no filler sections were added.
- PASS: one blue functional accent and white playhead/region markers guide selection without decorative motion.
- PASS: frame/time readouts, shot ranges and source-bound issues are specific to Framecraft's production workflow.
- PASS: the declared design read and one-line major decision reasons are recorded above; no replacement visual world was invented.

### Craftsmanship and quality locks

- C-1 PASS: each major layout, color, type, interaction and resource choice has a purpose in the decision record.
- C-2 PASS: real browser tests exercise the complete named control set and failure/recovery actions.
- C-3 PASS: every new surface serves timeline, inspection, feedback or comparison, not a template section.
- C-4 PASS: empty/loading/error/conflict/stale states, three widths, CSS zoom and keyboard operation were checked.
- C-5 PASS: test logs, command records, hashes, source digests, screenshots and probes back the reported results.
- R-05 PASS: navigation/preview/inspector/transport/timeline follow actual editing tasks; no landing-page formula was introduced.
- R-11 PASS: existing restrained rectangular control/panel geometry is retained in the opened screenshots.
- R-15 PASS: labels name operations such as Stop, Fit scene, Add issue, Revalidate source and Export JSON.
- R-16 PASS: no marketing buzzword copy was added to the workspace.
- R-20 PASS: identity remains the existing Framecraft video workspace, with precise frame, shot and source metadata.
- R-21 PASS: dark neutral chrome supports judging footage; the reason is documented, not an unexplained theme default.
- R-29 PASS: the UI retains neutral surfaces plus one blue functional accent; examples use the same bounded palette.
- R-30 PASS: existing Studio components and styles were extended, not cloned from another product.
- R-31 PASS: the decision record states why color, layout, type, controls, markers and bounded comparison loading exist.
