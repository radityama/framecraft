# Phase 4 architecture

## Existing contracts

The manifest remains authoritative: integer FPS, contiguous shots, zero-based scene frames and half-open shot intervals. HTML shots and the iframe render acknowledgement protocol stay unchanged. Studio and export continue using `SceneComposition`.

## Timeline and playback

`src/timeline.ts` owns validated frame/time conversion, bounds, shot mapping and navigation. Review frame selection and Studio use it. Studio keeps one selected integer frame; paused seeks wait for the existing mounted-iframe acknowledgement. The pinned Remotion Player owns the only playback scheduler: its `performance.now()` origin and elapsed-time calculation skip delayed presentations without accumulating callback drift. Its existing playbackRate prop controls preview only. No second animation loop is added. Scene changes pause and reset to frame zero; explicit shot URLs start at that shot. Zoom changes only a scrollable timeline's width.

## Feedback and persistence

Feedback is a separate version-1 JSON document per project/scene, not an edit to capture manifests. Issues have UUIDs, exact scene and shot-local frames, source SHA-256, severity/category/status, description and optional normalized point/rectangle. Revalidation explicitly changes an issue's source identity, never its status automatically. JSON and Markdown are provider-neutral handoffs.

Studio defaults to `output/studio-workspace`, overrideable only at launch with `--workspace <path>`. Writes stay outside all authorized project and revision roots. Browser requests supply validated project/scene IDs, never paths. Atomic replacement uses an expected content digest and an exclusive lock; stale saves return a conflict without losing the draft. Symlink targets are refused. Same-origin JSON writes and bounded bodies prevent cross-origin form writes. Trusted project JavaScript is executable local content, not sandboxed from the operator.

## Captures and comparison

Launch with repeated `--review <capture-directory>` to explicitly authorize immutable revisions. The server verifies their manifest, PNG hashes/decoding and summary independently of today's source. Revision IDs derive from manifest bytes. Images are served only through verified capture IDs; comparison loads at most two images for the chosen frame. A pair must share project/scene, video dimensions/FPS and exact shot/local/global frame identity. Changed offsets or missing captures are explicitly unavailable, never guessed. Current-source review verification retains its stricter behavior.

## Studio boundaries

Studio retains project navigation, Player and acknowledgement gating. `Timeline` owns ruler/zoom visualization; `ReviewPanel` owns persisted drafts, geometry overlay and issue inspector; `Comparison` owns revision selection and bounded image presentation. The read-only shot inspector exposes manifest fields, not pretend editing. Native controls and an explicit numeric frame field provide keyboard alternatives to pointer work. Existing dark Plex Sans/Mono visual language remains, with no decorative animation.

## Optional motion library

`authoring/motion.js` is a dependency-free browser script copied into an example project's local assets. Pure explicit-input easing, timing, keyframes, transform math, cursor and 2D camera functions never own a clock. Optional DOM/SVG/reveal helpers assign complete properties for the requested frame. Four standalone HTML shots demonstrate the existing runtime contract. Demo and Showcase sources remain unchanged.

## Implementation and checks

Order: shared timeline tests/core, Studio timeline, feedback schema/store/CLI and API, annotation UI, immutable comparison, motion library/examples, integration and retained artifact checks. Run existing tests plus real-server browser tests, old hashes/audio/review/export, exact paused preview/export comparisons and measured seek/startup/memory checks. No new provider, rendering engine, agent dispatch or narration.
