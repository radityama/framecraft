# Phase 3: demo intro agent visual review

## Artifacts and decision

- Source HEAD at capture: `d614ff4640fb552c608c9736649e8b3296d9bbe7`; project-file SHA-256: `947b9b55695ad26c8b11ab846c0eb68b01fdefbd761ebde061fd49bc3696ed82`. The captured manifest records `untrackedDirty: true` because the new inferred `brief.md` was not yet committed; `trackedDirty: false`. The project digest, not the historical commit, is the freshness check.
- Capture command: `bun run review --output docs/reviews/demo-intro --milestone title:20 --milestone diagram:30 --milestone commit:60 --milestone commit:90`.
- Retained artifact: [manifest](reviews/demo-intro/manifest.json), [summary](reviews/demo-intro/summary.md), and 20 individually opened PNGs under `docs/reviews/demo-intro/screenshots/` (16 default frames plus four distinct milestones). All 20 captures succeeded; validation in the manifest has exit 0, zero warnings and zero errors. Capture environment: Bun 1.4.3, Remotion 4.0.537, Chromium 157.0.8080.0, Linux x64; installed-font inventory `[]` (not proof that bundled WOFF2 faces did or did not load).
- Reviewer: **agent**, `Framecraft review agent`; manifest status **accepted after visual inspection against the inferred brief**, not automatically accepted or reviewed by a human. No defect or revision was warranted; no HTML shot changed, and no revised capture was needed.

## Individual PNG observations

The paths in the [summary](reviews/demo-intro/summary.md) identify each PNG by shot-local and global frame. Each of these 20 PNGs was opened individually with an image-capable read tool, not judged from a contact sheet or hashes.

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

## Verification

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
