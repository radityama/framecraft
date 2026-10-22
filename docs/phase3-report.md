# Phase 3: demo intro agent visual review

## Final capture after brief correction

The follow-up corrected only `projects/demo/scenes/intro/brief.md`: commit local **60** is the output delay boundary with a completed command and no output; local **89** shows output; local **90** is the rule's zero-width onset. No shot HTML, audio, manifest schema, workflow link or render input changed. The original review reported these pixels accurately, but the original brief did not.

- Current review: [final manifest](reviews/demo-intro-final/manifest.json), [final summary](reviews/demo-intro-final/summary.md) and **20 new PNGs** in `docs/reviews/demo-intro-final/screenshots/`. Capture command: `bun run review --output docs/reviews/demo-intro-final --milestone title:20 --milestone diagram:30 --milestone commit:60 --milestone commit:90`. All 20 captures succeeded; manifest validation exit 0, no warnings or errors.
- Source HEAD recorded at this capture: `1de7a3d9908e0bd4039517c1e1a318312a36571f` with `trackedDirty: true` (the corrected brief had not yet been committed), `untrackedDirty: false`; current project-file SHA-256: `c14ff630deebdaa2bdcbc8b085283953ce3b2a35a547aefb0b17e05e57db9e78`. Committing the already-captured brief changes HEAD, not that source digest.
- Agent `Framecraft review agent` individually opened each of the **20 final PNGs** with an image-capable reader, including cut pairs 59/60, 149/150 and 209/210, before manually accepting against the **corrected inferred** brief. The frame-by-frame pixel observations below apply to this new set as independently inspected. Direct comparison of the 20 final screenshot SHA-256 values to the historical manifest found **0 changed PNG hashes**, consistent with the brief-only edit; hash equality did not replace image inspection. No visual defect or shot-source revision was warranted.
- `bun run review --summary docs/reviews/demo-intro-final/manifest.json` and `bun run review --check docs/reviews/demo-intro-final/manifest.json` passed after the agent decision. This is the current checkable review. `docs/reviews/demo-intro/` is preserved **unchanged as historical evidence**: its source digest is `947b9b55695ad26c8b11ab846c0eb68b01fdefbd761ebde061fd49bc3696ed82`, and `bun run review --check docs/reviews/demo-intro/manifest.json` now exits nonzero with `source digest mismatch`, as intended. Its manifest and PNGs were not edited to make an old capture appear current.

Follow-up checks: `bun test tests/review-frames.test.ts tests/review-artifacts.test.ts tests/review-capture.test.ts` passed (20 tests, 152 assertions); `bun run typecheck` and `bun run validate` passed (60/90/60/120 shot frames). The existing `output/intro.mp4` was independently re-probed using the bundled FFprobe command below: 330 decoded 1920×1080/30 H.264 video frames plus a separate AAC stream. This was **not a new export**: the brief-only edit did not change the shot/audio inputs, so no second full render or rerun of the full audio-export regression was performed. The original full `bun test` including audio-export and full `bun run render` results remain recorded below.

## Historical capture and decision

- Source HEAD at capture: `d614ff4640fb552c608c9736649e8b3296d9bbe7`; project-file SHA-256: `947b9b55695ad26c8b11ab846c0eb68b01fdefbd761ebde061fd49bc3696ed82`. The captured manifest records `untrackedDirty: true` because the new inferred `brief.md` was not yet committed; `trackedDirty: false`. The project digest, not the historical commit, is the freshness check.
- Capture command: `bun run review --output docs/reviews/demo-intro --milestone title:20 --milestone diagram:30 --milestone commit:60 --milestone commit:90`.
- Retained artifact: [manifest](reviews/demo-intro/manifest.json), [summary](reviews/demo-intro/summary.md), and 20 individually opened PNGs under `docs/reviews/demo-intro/screenshots/` (16 default frames plus four distinct milestones). All 20 captures succeeded; validation in the manifest has exit 0, zero warnings and zero errors. Capture environment: Bun 1.4.3, Remotion 4.0.537, Chromium 157.0.8080.0, Linux x64; installed-font inventory `[]` (not proof that bundled WOFF2 faces did or did not load).
- Reviewer: **agent**, `Framecraft review agent`; historical manifest status **accepted after visual inspection against the original inferred brief**, not automatically accepted or reviewed by a human. No defect or shot-source revision was warranted in that review. A subsequent *brief-only* correction led to the separate final capture above.

## Individual PNG observations

The paths in the [final summary](reviews/demo-intro-final/summary.md) identify each final PNG by shot-local and global frame; the [historical summary](reviews/demo-intro/summary.md) identifies its own files. **Both sets of 20 PNGs were opened individually** with an image-capable read tool, not judged from a contact sheet or hashes. The observations below were confirmed anew for the final set; no visual differences were seen.

| Shot | Local (global) | Observed pixels |
| --- | --- | --- |
| title | 0 (0) | Plain dark background; word invisible at reveal start. |
| title | 20 (20) | Full cream “Framecraft” centered, no crop. |
| title | 29 (29) | Settled full word, same framing. |
| title | 59 (59) | Full word still readable at the cut. |
| diagram | 0 (60) | HTML node visible left; Frame node starts smaller and translucent right, connected by amber line. |
| diagram | 22 (82) | Amber pulse visible near the HTML end of the track; Frame enlarged but still translucent. |
| diagram | 30 (90) | Pulse farther right; both labels readable while result continues revealing. |
| diagram | 44 (104) | Pulse near the center; Frame larger and less translucent. |
| diagram | 66 (126) | Pulse nearing Frame; result is nearly full-size and legible. |
| diagram | 89 (149) | Both full-size nodes and labels visible; pulse has reached the result side. |
| close | 0 (150) | Dark centered “Made frame by frame.” on amber, no crop. |
| close | 29 (179) | Same legible centered line. |
| close | 59 (209) | Same legible centered line at cut. |
| commit | 0 (210) | Green prompt and white block cursor only; defined pre-typing state. |
| commit | 29 (239) | Partial `git commit` text; cursor in its off phase. |
| commit | 59 (269) | `git commit -m "ship it` visible without output; cursor off. |
| commit | 60 (270) | Complete `git commit -m "ship it"`, cursor on; output has not yet appeared at its delay boundary. |
| commit | 89 (299) | Command and green `[main 4f2a9c1] ship it` output visible; rule not yet expanded. |
| commit | 90 (300) | Same text and output; rule begins at zero width at this exact onset frame. |
| commit | 119 (329) | Command and output readable, green rule fully extended inside viewport. |

Cut pairs inspected separately: global **59/60** changes from the complete title to the starting HTML/Frame diagram; **149/150** changes from completed diagram to centered closing sentence on amber; **209/210** changes from closing sentence to the prompt/cursor. All three are intentional hard cuts, with no visible clipping or misplaced content in these sampled frames. This is a judgment on sampled stills, not a full-motion playback assessment.

## Original delivery verification (before brief correction)

| Command | Result |
| --- | --- |
| `bun run review --summary docs/reviews/demo-intro/manifest.json` | Passed after manually setting the agent review section; summary regenerated. |
| `bun run review --check docs/reviews/demo-intro/manifest.json` | Passed after summary regeneration and again after export; checker is read-only. |
| `bun test` | 70 passed, 0 failed, 467 assertions across 15 files. Includes `tests/studio-browser.test.ts`, `tests/review-capture.test.ts`, and `tests/audio-export.test.ts` (decoded bed, concurrent effects, loop, fades, shot isolation and partial-export safety). |
| `bun run typecheck` | Passed (`tsc --noEmit`). |
| `bun run validate` | Passed: title 60, diagram 90, close 60, commit 120 frames; no warnings reported. |
| `bun run render` | Passed: `output/intro.mp4`, 330 frames, 1920×1080/30 fps, 634583 bytes. |
| `node_modules/@remotion/compositor-linux-x64-gnu/ffprobe -v error -count_frames -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_read_frames -of json output/intro.mp4` | Independent probe: video stream 0 H.264, 1920×1080, `30/1`, **330 decoded frames**; separate audio stream 1 AAC (`nb_read_frames: 516` reported for audio packets/frames, not video). |

No package or lockfile changes, dependencies, providers, or shot-API changes were made. `docs/rendering.md` documents the existing one-demo-scene static composition limit; this report does not claim arbitrary-project export. Audio is only verified by the existing export test and stream probe, **not** human listening. No second-machine render/pixel-identity comparison, human visual inspection, or full-motion visual playback was performed. Forced process kills can leave temporary files. `.taste-skill/` remains unrelated and untracked. `framecraft.zip` was untracked at the start but was absent on the final workspace check; it was not staged or intentionally deleted, and no copy was located under the project tree or `/tmp/opencode`. Its contents are unknown, so it was not recreated.
