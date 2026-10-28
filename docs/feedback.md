# Visual feedback and revision comparison

Feedback lives separately from immutable captures. Studio never edits shot source, historical PNGs, manifests or review decisions. Projects remain trusted executable local HTML, not sandboxed content.

```sh
bun run review --project projects/showcase --scene pulse --output output/pulse-before
# Inspect captures, record a named decision, then revise source.
bun run review --project projects/showcase --scene pulse --output output/pulse-after
bun run studio --project projects/showcase --scene pulse --workspace output/studio-workspace \
  --review output/pulse-before --review output/pulse-after
```

Repeated `--review` explicitly authorizes existing capture directories. Their manifest, summary, frame policy, PNG decoding and SHA checks must pass. Historical source need not equal today's source. Browser inputs select manifest SHA IDs and capture indices, never filesystem paths.

## Annotate and persist

Pause at an exact frame, enter a description, severity, category and status, then choose a point/rectangle. Mark the preview or enter coordinates by keyboard. Add issue saves a UUID, project/scene/shot, scene and shot-local frames, source SHA and optional geometry. Select an issue to seek its frame. Save, resolve/wont-fix, revalidate and delete are explicit; revalidation and deletion require confirmation. Clear form removes only the draft.

Coordinates are normalized to the complete video frame: `(0,0)` is top-left and `(1,1)` bottom-right. Positive rectangles must fit inside it. The SVG overlay scales with the preview without changing scene pixels.

Files survive reloads at `<workspace>/<project>__<scene>.feedback.json`; default workspace is `output/studio-workspace`. Back up these files alongside captures. Source is rechecked on load, return to the Studio window, and Check source / reload feedback. A changed digest pauses playback and reloads the selected preview frame before new feedback can be saved. Restart Studio after manifest changes so its canonical scene layout is revalidated. Earlier issues remain **STALE source** until explicit revalidation; status never auto-resolves. Revalidation requires unchanged frame mapping and clears an earlier capture reference rather than claiming that old PNG depicts the new source. Reload confirms discarding a nonempty form.

## Version 1 contract and portable handoff

JSON contains `schemaVersion: 1`, `projectId`, `sceneId`, `issues`. Issues contain UUID `id`, identities, `frame` (scene), `localFrame` (shot), `sourceSha256`, severity (info/minor/major/blocking), category (timing/motion/typography/layout/color/asset/audio/other), description, status (open/resolved/wont-fix), optional geometry and artifact. Unknown fields, duplicate IDs and invalid geometry are rejected. Capture references use `revisions/<manifest-sha>/screenshots/<name>.png`; arrange exported directories under those IDs when moving reviews. Live-preview issues explicitly ask the recipient to capture the exact frame.

Studio downloads saved issues as JSON or Markdown. No plugin, provider or model API is needed:

```sh
bun run review:feedback --check output/feedback.json
bun run review:feedback --project projects/showcase --scene pulse --output output/feedback.json
bun run review:feedback --project projects/showcase --scene pulse --output output/feedback.md
bun run review:feedback --project projects/showcase --scene pulse --import output/feedback.json
```

`--workspace` selects the same workspace. `--check` validates schema, not present-day source correctness. Imports explicitly replace one scene's feedback with conflict detection; old-source issues remain importable. Outputs are atomic and cannot be inside the selected project. Exports contain no absolute artifact paths.

## Compare

Choose Before/After, one matched frame, and Side by side or adjustable Split. Only two requested PNGs load, not full videos or a cached sequence. Manifest and source IDs stay visible. Matching requires identical project, scene, dimensions/FPS and ordered shot IDs/offsets/durations, plus exact captured global/local frame identity. Different milestones expose only their intersection. Changed layout or absent matches displays unavailable, never a nearest-frame guess. Restart Studio to authorize new capture directories.

## Write safety

Studio binds to `127.0.0.1`. Same-origin JSON PUT requires `If-Match`, a bounded 1 MiB body, schema validation and authorized project/scene. Exclusive per-file locks, unique partial files, fsync and atomic rename prevent silent overwrites. A conflicting window receives 409 and retains its unsaved form. Reload deliberately before retrying. Symlink targets and workspaces inside projects/captures are refused. There is no arbitrary file-write/code-execution endpoint. Trusted project scripts share this origin; these checks are not a hostile-code sandbox.

A killed writer can leave `.lock`/`.partial` files. Stop all writers, inspect and back up the workspace before removing only confirmed abandoned files; never remove a live lock.

## Agent instruction template

> Read AGENTS.md, this feedback and the affected shot brief. Verify project, scene, source SHA, shot and local frame. Open the referenced PNG or run `bun run snap --project projects/<id> --scene <scene> --shot <shot> --frame <local-frame>`. Preserve unrelated work. Fix HTML/CSS/vanilla JS/SVG source, not historical captures. Validate, capture a new review directory, inspect boundary/milestone PNGs, compare exact matched frames, and export through the existing renderer. Report addressed UUIDs with evidence. Do not automatically resolve feedback, claim human approval, add narration or dispatch an agent.
