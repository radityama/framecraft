# Production infrastructure and acceptance report

## Outcome

Implemented an additive production workflow without replacing the HTML/CSS/JS/SVG runtime, Remotion renderer, scene audio engine or Studio. Legacy commands still accept existing projects without production contracts. Pre-existing dirty work was preserved. No commit, push, reset, clean, remote operation, dependency addition or automatic agent launch was performed.

**Final export:** `/home/radityra/projects/framecraft/output/production-desktop/final/desk-cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7.mp4`

- Exactly **1,230,072 bytes**.
- SHA-256: `985829bf6f16ffafc6467a856209753facc61c4891f33294399864e8c9867058`.
- H.264, YUV420P, **1920×1080, 30fps, 450 frames, 15 seconds**. Renderer completed; full video/audio decode and exact published-file revalidation passed.
- AAC, stereo, 48,000Hz. Ten original, locally reproducible tactile/contact cues; no narration or music.
- Delivery label: **technically-verified**. Gate A passed; Gate B **partial-listening-pending**; Gate C **not-required**, not approved.

[Permanent run report](production-runs/production-desktop/cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7/report.md), [verification](production-runs/production-desktop/cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7/verification.json), [named review](production-runs/production-desktop/cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7/creative-review.json), [visual delivery gate](production-runs/production-desktop/cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7/design-delivery-gate.md), [cue sheet](production-runs/production-desktop/cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7/cue-sheet.md), and [post-cleanup audit](production-runs/production-desktop/cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7/post-cleanup-audit.json) retain the evidence outside disposable media.

## Permanent implementation

- `AGENTS.md` points project work to [production-standard.md](production-standard.md). The handbook covers brief, narrative, visual hierarchy, typography, motion purpose/timing/easing/staging/continuity, desktop causality, sound design, iteration, anti-pattern corrections, independent gates and cleanup. [Six optional templates](production-templates.md) provide different composition/motion/sound starting points without prescribing one aesthetic.
- `schemas/production-brief.schema.json` and `src/production/contracts.ts` define strict version-one intent and beat/event/asset contracts. Existing manifests alone own video dimensions, FPS, shot durations and executable audio. Validation rejects stale identities, gaps/overlaps, out-of-bounds events, missing/muted/misaligned/unplanned cues, unavailable or hash-mismatched assets, unauthorized voice/music, unsafe paths, non-file recipes, occupied quiet intervals and insufficient worst-case gain headroom.
- `src/production/review.ts` binds named observations to source, candidate and every capture hash. Structured findings retain severity, scene/shot/frame, correction, status and limits. Serious unresolved defects block publication. Measurements do not become listening, and agents cannot supply human approval.
- `src/production/media.ts` uses the existing bundled FFmpeg/FFprobe for stream metadata, counted frames, duration, full decode, per-channel peak, stereo-energy quiet and whole-cue correlation/alignment. Deliberately silent projects require no audio stream; required SFX cannot pass as a missing or silent track. There is no second mixer.
- `src/production/capture.ts` adapts the existing shot composition and Remotion still renderer. `scripts/production.ts` exposes `check`, `prepare`, `publish`, `cleanup`; `package.json` adds `bun run production`. No old CLI acquires a mandatory production contract.
- `src/production/lifecycle.ts` owns unique run media with a permanent ledger, canonical path guards, explicit registration/sealing, no-overwrite atomic publication, exact final revalidation and idempotent per-file cleanup. Neither extensions nor age imply ownership.
- `projects/production-desktop/` is an isolated acceptance project: brief, six beats, 15 semantic events, ten actual scene cues, provenance/recipe, local runtime/fonts and one deterministic HTML shot. Rendering/workflow documentation was extended, not replaced.

## Real review and correction

The film establishes a file window in front of a reference window, creates and names a folder, then grabs, moves and releases the window before a restrained camera reframe and reading hold. UI chrome, focus, selection, stacking and cursor approach have explicit causal states.

Visual inspection caught a real blocker in earlier candidates: the cursor's numeric coordinates were correct but its implicit CSS static origin placed the visible cursor **56px too low**. It missed the button and title bar. A rendered-bounds regression assertion failed at actual y319 versus expected y263. Explicit `left:0; top:0` corrected the root cause; the stronger test passed. The film was rerendered before acceptance.

For the corrected source, the named agent opened **all 40 retained PNGs**, including first/middle/last, contact boundaries, typing, grip, drag, release, camera and final hold. The test also measures every frame **18–370**, checks fixed local grip `(550,30)`, trajectory continuity and pauses, loaded Plex fonts, computed text contrast, z-order and reverse-seek PNG identity. Ordered image sequences support the motion judgment; real-time playback was **not** claimed. All capture hashes, observations and final-video frame times were archived before PNG deletion.

## Audio evidence and outstanding listening

The retained synthesis script uses seeded broadband contacts, damped material modes and filtered friction, not repeated notification beeps. Press/release variants, grab, variable key cadence, drag friction, drop/secondary contact and a paper-brush transition have distinct original assets. Generated PCM is dedicated under CC0-1.0; local Plex fonts retain SIL OFL texts. Reproducibility and contact variation are tested.

- Final per-channel peak: **0.0784912109375** full scale; stereo RMS: **0.0034335117042996093**.
- All ten full-cue correlations: **0.953033–0.985930**; measured encoded alignment offsets no greater than **0.01 frame**.
- Four planned quiet intervals: **RMS 0**. Unplanned out-of-cue energy, signal presence and over-level checks passed.
- **No subjective listening occurred.** Realism, pleasantness, harshness, repetition and balance by ear remain unapproved. A listener should review the full film at normal speed and isolated interaction moments. This open informational finding keeps Gate B partial and prevents a fully agent-reviewed label. No human approval is inferred.

## Actual publication and cleanup

Run: `cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7`; source SHA-256: `23e90401730bde057f7d1c0dba30cd4b62684fe958625e64e494fc6d73af0046`.

After contract/capture/review/media verification, permanent frame descriptions and hashes replaced disposable PNG links. Atomic same-filesystem hard-link publication refused overwrite, then the exact final was fully reverified before cleanup.

- Removed **41 explicitly owned current-run files**: 40 PNG previews and one draft MP4.
- Reclaimed **6,763,426 logical temporary-file bytes**, calculated from actual successful deletions. This is not a claim of physically freed disk blocks; draft and final initially shared an inode.
- Current-run remaining scratch files: **0**. Unknown/changed files found in this run: **0**. Cleanup failures: **0**.
- Explicit second cleanup: **0 additional files, 0 additional bytes**, no failures. Cumulative ledger remains 41 / 6,763,426.
- Final directory contains **only the requested MP4**. Final has one hard link after draft removal.
- Permanent documentation, contracts, cue sheet, findings, ownership, frame/hash metadata, test/command logs and verification remain in the run's documentation directory. Renderer-managed bundles are excluded from these cleanup counts.

[Publication cleanup result](production-runs/production-desktop/cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7/cleanup-publication.json), [repeat cleanup log](production-runs/production-desktop/cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7/cleanup-repeat.log), and the post-cleanup audit record the actual operation, not mock statistics.

### Preserved diagnostics

Two prior runs remain untouched, with every retained file hash rechecked:

- `bb9317bd-69c7-4dfd-9550-964b54757d9b`: technical failure from a bundled-FFmpeg PCM muxer limitation; **41 files / 6,764,051 bytes** retained with failure diagnostics. The adapter was corrected to use streaming WAV output; the old failed run was not retroactively approved.
- `97dbb7bf-15be-4fed-a013-eb52c6c47b51`: prepared but rejected visually for the cursor defect; **41 files / 6,764,051 bytes** retained with a blocking revision finding. It was not published or cleaned.

No previous/user-owned evidence was swept. Unknown and changed files, symlinks, source/docs, and older runs are also preservation cases in filesystem and real CLI integration tests. Empty private directories may remain intentionally.

## Verification and regression evidence

- Fresh baseline before implementation: **101 pass / 9 fail / 839 assertions**, 110 tests in 26 files. Seven cascaded from an existing test whose default timeout equaled its 5-second acknowledgement failure timeout; two assumed an exact project catalog despite the pre-existing benchmark project.
- Narrow test-harness corrections: explicit 10-second timeout for that one acknowledgement test; two Studio catalog assertions now require the expected legacy projects without rejecting legitimate additional projects. No Studio implementation or renderer behavior was changed for these fixes.
- New tests: `production-contracts`, `production-cleanup`, `production-media`, `production-cli`, `production-desktop`. They cover malformed contracts/review claims, reproducible cues, real FFmpeg media failures, actual prepare/render/publication/cleanup, diagnostics retention, malicious paths/symlinks, run isolation, unknown/user file preservation, exact counts, repeat cleanup and rendered desktop causality.
- Final complete regression run, including the regular-file provenance guard: **125 pass / 0 fail / 1,106 assertions**, 31 files, **352.70 seconds**. [Full-suite log](production-runs/production-desktop/cbf0fd43-ebcc-48dc-a8b7-e1c1d33361c7/regression-file-guard.log). The preceding complete run also passed all 125 tests.
- The final provenance check was tested red before the fix and green afterward: a directory cannot masquerade as an audio asset or reproducible synthesis recipe. Focused result: **7 pass / 0 fail / 66 assertions**. Production contract checking and another full final-media/cleanup recheck passed afterward, with zero further deletions.
- Focused contracts/cleanup/media/desktop run: **14 pass / 0 fail / 181 assertions**. Real CLI workflow coverage is also included in the full suite.
- Typecheck and `git diff --check` passed.
- One earlier full run had an intermittent existing Studio screenshot round-trip mismatch: **124 pass / 1 fail**. The exact failing browser test then passed **five consecutive reruns**; it was not patched or hidden. The later complete regression run passed. Earlier failed logs remain archived, so this is a known intermittent-test risk, not a claimed root-cause fix.
- Current Demo, Showcase and Motion source digests exactly match the pre-existing Phase 4 report. This is comparison against historical evidence, not a newly invented pre-change snapshot. Legacy hash/render/audio/Studio tests are included in the full run.

All baseline, intermediate, final, focused, typecheck and production-operation logs are retained alongside the run. Context7's pinned Remotion 4.0.537 renderer/audio documentation informed the additive integration; no library upgrade was needed.

## Limits and skipped work

Subjective listening and human editorial approval were not performed; human approval is not required by this exercise. Motion was inspected as a sequence, not claimed as real-time playback. No second-machine determinism test or aesthetic guarantee is claimed. Correlation is conservative and may reject strongly masked/anti-phase sources; decoded PCM analysis is in memory rather than a long-form streaming analyzer. HTML remains trusted executable source. Path guards are not a hostile same-privilege concurrent-process sandbox, and crash-left operation locks require inspection rather than automatic unsafe recovery. No renderer replacement, Studio redesign, narration, music, external AI service or orchestration layer was added.
