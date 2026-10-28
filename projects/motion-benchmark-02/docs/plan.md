# Motion Benchmark 02 Implementation Plan

> Executed inline after user approval. No commits or worker agents: the user's isolation and no-commit requirements override workflow defaults.

**Goal:** Produce, render, revise and verify a coherent 55-second Framecraft motion film with retained evidence.

**Architecture:** Four independently loaded HTML entries share one deterministic film script and visual stylesheet. Each registers the existing public shot API exactly once and converts local frames to a continuous editorial frame using its explicit offset. Existing Phase 4 helpers supply easing, keyframes, cursor curves, camera and SVG drawing.

**Tech stack:** Existing Framecraft runtime, plain DOM/SVG, local WOFF2 fonts, Bun, existing Chromium/renderer, existing Studio, bundled FFmpeg/ffprobe. No new dependencies.

## Global constraints

- 1920×1080, 30 fps, 1650 frames, no shot overlaps, silent.
- Source under `projects/motion-benchmark-02/`; outputs under `output/motion-benchmark-02/`.
- Preserve all pre-existing work; only append the required shot inventory to `docs/rendering.md`.
- Public shot API only in film code. Complete state per requested frame, including reverse seeks.
- Palette #101114 / #F2F0E9 / #FF623E / #8D9199. Local licensed fonts.
- Sequential heavy jobs; no quality/resolution reduction to conceal memory failures.

## Tasks

- [x] **1. Blocking.** Created project, captured and opened all 20 blocking frames. Source archive and named needs-revision review retained in `output/motion-benchmark-02/01-blocking`; five findings drive pass 2.
- [ ] **2. Motion refinement.** Refine absolute timing, masks, cursor and window geometry, directional graph path drawing, camera and independent 32-row ledger. Add `checks.test.ts` and a browser evidence driver under project docs. Validate with `bun run validate --project projects/motion-benchmark-02 --scene film`; run `bun test projects/motion-benchmark-02/checks.test.ts`. Capture a fresh review directory, render `02-motion.mp4` with the existing render command and inspect extracted encoded frames. Keep the source snapshot and review tied to this pass.
- [ ] **3. Editorial revision.** Record concrete severity/shot/local/global frame/correction entries. Apply only evidence-based composition, motion or readability fixes. Re-capture matched identities in `03-editorial`, open them and record re-verification. Keep the preceding full MP4 and source snapshot.
- [ ] **4. Final.** Freeze project source before final source-bound captures. Capture final first/middle/last plus cursor/focus/cuts/graph/finale/title milestones. Open every PNG; record an explicit preliminary agent decision. Render `FRAMECRAFT-MOTION-STUDIES-VOL-02.mp4`. Repeat hash captures; random/reverse seek in Studio and capture exact pixels, inspect cursor targets/focus and fonts. Run all existing `bun test` and `bun run typecheck`. Probe actual final file with bundled ffprobe; extract and open encoded frames. Generate a contact sheet, structured defect ledger and A–G production report outside project. Re-run review `--check` against frozen source.

## Checks

Manifest assertions: `sum(durationFrames) === 1650`, offsets `[0,360,810,1260]`, each overlap is zero, runtime/helper byte parity with originals. Browser assertions: frame acknowledgement equals requested frame, cursor hotspot lies in target rectangle on click, focused window is topmost, Source drag/Inspector resize reach intended bounds, every local font has loaded, 32 ledger rows have distinct transforms during choreography, repeated middle→first→middle pixels match. Compare selected hashes by identity, never by capture order. Hashes on this host do not establish cross-machine identity. Final ffprobe must show H.264, 1920×1080, `30/1`, 1650 decoded frames and 55 seconds, no audio stream by design.
