# Production implementation plan

**Goal:** Make production acceptance and ownership-based cleanup reproducible without breaking legacy authoring.

**Architecture:** Strict project-local contracts feed a separate production CLI using the existing shot composition, still renderer and render command. Permanent reports authorize atomic publication and narrowly scoped cleanup.

**Stack:** Existing Bun/TypeScript, Remotion 4.0.537, bundled FFmpeg/FFprobe, local HTML/CSS/SVG and PCM WAV. No new dependencies or orchestration.

## Constraints

- Preserve pre-existing work and historical evidence. No commit, push, reset or clean.
- Source manifests alone define video size, FPS and shot duration.
- Narration/music require explicit authorization; acceptance uses neither.
- Listening and human approval cannot be fabricated.
- Permanent documentation is never disposable media.

## Execution

- [x] Add handbook, templates, JSON brief schema and runtime contract/cue/review validation. Test malformed versions, identities, frame bounds, missing/extra cues, silence, provenance, gain and review claims.
- [x] Add media verification using full decode, stream/frame metadata, PCM levels, cue correlation and quiet intervals. Test valid audio, silence, absent/shifted/muted/clipped/truncated media.
- [x] Add run ledger, canonical path guards, atomic no-overwrite publication and idempotent per-file cleanup. Test source/docs/user/previous-run preservation, changed media, symlinks, traversal, failures and actual statistics.
- [x] Wire check/prepare/publish/cleanup in `scripts/production.ts`; keep all old CLIs untouched. Test subprocess workflow and failure diagnostics.
- [x] Author the 15-second acceptance source, deterministic sound recipe/provenance and concrete frame plan. Verify interaction geometry and reverse seeks.
- [x] Run focused tests, typecheck and the entire regression suite with timeout headroom. Render, open every retained capture, correct observed defects, measure audio, record an honest creative review, publish and perform real cleanup.
- [x] Save final verification/cleanup report with exact path/size/hash, gate states, measured audio, deletion counts/bytes, preserved files and remaining limitations.

Completed with technically verified publication and real cleanup. Gate B remains partial because subjective listening was unavailable; no listening or human approval is claimed. See [the acceptance report](../../production-report.md).

Implementation is inline. Context7's pinned Remotion renderer and volume documentation was checked during reconnaissance. A baseline run before edits yielded 101 pass / 9 fail: an acknowledgement test lacks timeout headroom and two Studio tests assume a closed project catalog.
