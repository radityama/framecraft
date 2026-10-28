# A little room to think

Original desktop simulation, approved as a production acceptance exercise. This is not an OS clone or a functioning desktop app. All apparent UI interaction is deterministic shot-local frame state.

The main file window has a stable title-bar grip at local (550,30); the arrow/hand hotspot is the same scene coordinate. Press at 54, release/create/focus at 57, variable typing at 96–145, confirmation at 159. Press at 212, grip at 214, drag at 220–286, release at 288, drop accent at 290. Window z-order is active throughout. One camera move at 304–348, then a long reading hold. Frame data attributes support geometric assertions; none drives an alternate clock.

Warm paper makes a quiet desk; dark ink maintains text contrast; rust indicates focus only. Plex Sans fits UI labels; Plex Serif makes the editorial caption feel printed rather than promotional. Two persistent windows and a file table establish desktop depth. The active window is the sole focal plane; the caption stays outside the camera crop. ENERGY 1 / RHYTHM 2 / MOTION 2.

## Sound provenance

Run `bun projects/production-desktop/production/synthesize.ts` to reproduce the ten local WAVs and their asset index byte-for-byte in this environment. The recipe is source-controlled, seeded, 48kHz mono PCM16. No downloads or proprietary recordings are involved. The original generated PCM is dedicated under CC0-1.0; no third-party sample license applies. IBM Plex fonts retain their separate SIL OFL license texts in `assets/fonts/`.

Press/release use distinct damped broadband mechanical contacts, not sustained notification tones. The title-bar grip has a lower contact body. Dragging uses low-level filtered friction with a velocity envelope; dropping adds a small secondary contact. Typing has eleven individually seeded, variably timed contacts. The camera accent is a quiet paper brush. Gains are conservative; long initial, between-action and closing intervals are deliberately silent. No narration or music. Machine measurements cannot certify the sounds' subjective realism; listening is pending until actually performed.

See `production/plan.json` and the run's generated cue sheet for exact event-to-manifest mappings. Permanent production reviews belong outside this project so source digests stay stable. Final exports belong only in `output/production-desktop/final/`.
