# Phase 3.5 implementation and verification report

## A. Summary and definition of done

The existing multi-project/multi-scene implementation has been completed without replacing the renderer, authoring API or Studio design. Project discovery, CLI selection, Studio routing, generic scene/shot rendering, hashing, review verification and audio now use the selected project and scene consistently.

- Discovery is deterministic, isolates invalid neighbors, omits ambiguous IDs and authorizes an external root only through an explicit CLI path.
- Studio and its real server share the catalog contract, including CLI-selected defaults. Project, scene and shot links survive refresh and browser history. Invalid selections produce recovery controls rather than silent fallback.
- Export, still capture, hashing and review use generic composition IDs with matching selection/render input props. Multi-scene exports require a scene selector.
- Source containment, immutable review directories, exact PNG verification and atomic output preservation remain enforced. Render/hash destinations cannot overwrite the selected project's source tree.
- The supplied showcase contains two independently selectable scenes with local fonts, SVG, runtime and deterministic diagnostic audio. Two first-frame title contrast defects were corrected after actually opening the captures.
- No narration generation, editor, cloud service, alternate rendering engine, dependency upgrade, commit, push or new worktree was introduced.

The final full test run passed **95 tests across 19 files, with 692 assertions and zero failures**. The retained fresh-render and visual-review evidence is described in section D.

## B. Root causes, affected files and regression checks

| Root cause | Focused fix | Regression evidence |
| --- | --- | --- |
| Studio expected `defaultProjectId`/`defaultSceneId`, but the server returned `selected` | Shared `StudioCatalog` in `src/studio/catalog.ts`; server and UI consume the same shape | Real CLI-selected showcase/noninitial-scene initialization, explicit URL override, refresh and history in `tests/studio-browser.test.ts` |
| Browser tests recreated an obsolete single-project server and omitted `/api/projects` | `tests/fixtures/studio-server.ts` launches the actual `scripts/studio.ts`; server and browser tests use it | Actual registry, APIs and namespaced assets exercised in `tests/studio.test.ts` and `tests/studio-browser.test.ts` |
| Hashing still selected removed shot-specific composition IDs without input props | `scripts/hash.ts` selects generic `shot`, passes identical props to selection/capture, records project/scene/source/video metadata | Historical demo keys retained; both showcase scenes hashed twice in `tests/hash.test.ts` |
| Linked stylesheet validation called an unimported `resolve` | Added the missing import in `scripts/validate.ts` | Typecheck and existing all-scene/linked-CSS validation tests |
| Raw shot paths were joined before validation, normalizing an absolute path into an apparently relative one | Validate local raw paths before joining in `src/spike/project.ts` | Absolute, URL, backslash and NUL path regressions in `tests/project.test.ts` |
| Discovery depended on directory order, warned about unrelated directories and could silently lose an explicit duplicate selection | Sort discovered entries and final IDs; ignore nonprojects; reject explicit collisions; keep browser diagnostics free of absolute roots | `tests/registry.test.ts` covers order, duplicates, canonical aliases and diagnostic boundaries |
| Shot navigation had no canonical URL state; a same-frame seek could wait forever for an acknowledgement that would not be emitted | Shared route parser/serializer, shot history state and already-confirmed-frame handling in Studio | Boundary seeks, same-shot click, reverse/rapid seeks, recovery and URL tests |
| Retry frame sought the same failed frame without reloading its iframe | Remount only the preview on Retry, at the requested frame | Actual browser regression first failed at frame 60, then passed after removing the injected failing shot |
| Render/hash output paths could enter the project source tree | Shared canonical-parent destination guard in `scripts/atomic-output.ts` | Nested missing directories and directory-symlink aliases rejected without writes; prior output preserved on failures |
| Intended Studio fonts were not actually imported | Bundle the existing local font stylesheet in `src/studio/studio.css` | Browser asserts loaded IBM Plex Sans and JetBrains Mono |
| Showcase opening titles started below large-text contrast requirements | Raise only the two initial title opacity floors to 0.6 | Original captures marked needs-revision; corrected first-frame contrast is 3.7168:1; actual browser opacity assertions |

The startup typecheck exposed two errors: the missing validator import and insufficient narrowing of `loaded` in Studio. Both are fixed. The initial full-suite checkpoint recorded 67 passes and 16 failures; it was started before the new raw-path regression was added, so that number is not presented as a pristine original-checkout baseline. Its log is retained.

One later verification run had 95 real tests passing but failed because copied baseline `*.test.ts` files under the evidence directory were accidentally discovered. Only those agent-created backups were renamed to `*.test.ts.snapshot`. The final plain `bun test` run then passed without changing test-discovery configuration.

## C. Implementation boundaries

### Selection and serving

`projectRoot()` canonicalizes CLI filesystem paths. `selectScene()` keeps the single-scene convenience default and rejects omitted multi-scene export/review/hash selection. All project scenes are validated even when only one is selected. Scene IDs are project-scoped; shot IDs are scene-scoped, including repeated IDs across different scenes.

Studio discovers repository projects and optionally one explicitly authorized external project. URLs contain IDs, never filesystem roots. API data uses project-prefixed HTML/audio paths; local static serving checks both lexical and canonical containment. Malformed IDs/encoding, directory requests, traversal and symlink escapes do not expose arbitrary files. Tests use an external temporary fixture to check the authorization boundary without modifying demo assets.

Compatibility is deliberate: `GET /api/project` still returns raw demo data, legacy demo `/public/assets`, `/public/scenes` and `/public/runtime.js` routes remain available, and `?clip=<scene-id>` remains a scene alias. New consumers use `/api/projects`, `/api/project?id=...` and `?project=...&scene=...&shot=...`.

### Rendering, hashing and artifacts

The existing generic `scene` and `shot` compositions and deterministic HTML runtime remain the engine. Selection and rendering receive the same `{scene, video, shotId?}` props and metadata is checked against the manifest. Demo pixels, runtime and assets were not edited.

The default demo hash report retains its exact twelve historical keys. Other scenes capture each shot at first, midpoint and last frame, deduplicating short shots. Reports record selected IDs, source-tree SHA-256, video and environment metadata. Source is checked again before an atomic report replacement. Historical golden hashes were not silently rebased.

Review capture still starts unreviewed. Verification checks source identity, selected scene, frame policy, capture order/count, exact PNG bytes/hash/decode and summary freshness. Existing review directories cannot be reused. Only an explicit named decision changes review status; successful capture or hashing does not approve visual quality.

Scene export includes only that scene's cues. Shot-only export excludes scene beds and other shots. Existing trim, loop, gain, fade, decode and media-boundary validation remains in place. Showcase WAVs were generated with its existing CC0 diagnostic generator, not replaced with production music. Narration stays opt-in.

### Documentation and scope

Updated `docs/rendering.md`, `docs/studio.md`, `docs/audio.md`, `docs/agent-workflow.md` and the relevant Framecraft authoring/export/review guides to describe selected project/scene commands, generic compositions, fixture durations, namespaces, compatibility routes, hash policy and remaining limitations. All five CLIs expose `--help` without starting a browser or writing artifacts.

## D. Verification and retained evidence

Evidence root: [`output/phase35-H9Nm72`](../output/phase35-H9Nm72/). Final source-matching renders and review captures are kept separately under its `final/` directory. Initial rejected captures remain retained for comparison; they are not the accepted final evidence.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Full suite, plain `bun test` | 95 pass, 0 fail; 692 assertions; 19 files; 330.50 s | `logs/tests-final.log` |
| `bun run typecheck` | Exit 0 | `typecheck.txt` |
| `git diff --check` | Exit 0 | `git-diff-check.txt` |
| Retry-frame regression | Red: ready-at-60 timed out; green: 1 pass after preview remount fix | `logs/framecraft-phase35-retry-{red,green}.log` |
| Contrast calculation | Studio normal text minimum among tested pairs 4.8219:1; error text 5.2302:1; showcase large first-frame titles 3.7168:1 | `contrast.json` |
| Fresh sequential CLI verification | 39 commands: 35 successful commands and four expected nonzero failures | `final/commands.json`, with exact arguments, output, exit codes and timing |
| Static validation | Demo, whole showcase and selected noninitial signal all exit 0 | `final/logs/validate-*.log` |
| Actual stills | 14 PNGs: demo scene first/middle/last plus commit 60; both showcase scenes first/boundary/last plus every shot at 24 | `final/snaps/`; every retained still was opened |
| Fresh review captures | Eight PNGs per showcase scene, covering every shot at local 0, 23, 24 and 47; all 16 individually opened | `final/review-{pulse,signal}/screenshots/` |
| Named visual decisions | Both fresh reviews accepted by agent GPT-6.1 Sol; summary regeneration and checks exit 0 | `final/review-{pulse,signal}/{manifest.json,summary.md}`, `final/review-decisions.json` |
| Repeated hashing | Demo intro, showcase pulse and noninitial signal each run twice; all corresponding frame maps equal | Six `final/hash-*.json` reports; 48 PNG renders representing 24 selected sample keys |
| Source integrity | Demo and showcase source-tree digests unchanged throughout fresh verification | `final/source-before.json` equals `final/source-after.json` |
| Actual MP4s | Four H.264/yuv420p videos, all 30 fps with AAC; exact video frame counts and durations below | Four `final/*.mp4` files, `final/ffprobe.json` |
| Failure preservation | Missing project, omitted ambiguous scene, unknown scene and missing image all fail nonzero without replacing the prior output sentinel | `final/logs/{invalid-project,ambiguous-scene,invalid-scene,invalid-image-asset}.log`; assertions in retained verification-script snapshot |
| Audio timing/isolation | Both showcase scene exports have their own first-hit timing; carrier shot-only excludes scene hum and retains its hit; demo bed/hit/loop/fade checks pass | `tests/audio-export.test.ts` in the final full suite |
| Supplemental real Studio run | 88 recorded agent-browser commands all exit 0; actual CLI-selected signal and explicit navigation exercised | `ui-complete/commands.json` |
| Desktop/phone visual inspection | Opened all three supplemental PNGs: 1440×900 preview, 390×844 pulse controls and invalid-project recovery | `ui-complete/{desktop-signal,phone-pulse,phone-invalid-project}.png` |
| Phone geometry and fonts | Width and scroll width both 390; all eight rendered controls 44 px high; IBM Plex Sans and JetBrains Mono loaded | `loaded-fonts-and-geometry` record in `ui-complete/commands.json` |
| Console/page errors | Zero page errors and no console-error messages; three Remotion license reminders are warnings | `console` and `page-errors` records in `ui-complete/commands.json` |

Fresh-render environment: Bun 1.4.4, Remotion 4.0.537, React 19.3.1, Chromium 157.0.8080.0, Linux x64. No version was upgraded. Hash metadata records the OS release and installed-font inspection; bundled fonts are local project assets, not inferred from the installed-font list.

| Selected output | Size | Video frames | Video duration | Container duration | Audio |
| --- | --- | ---: | ---: | ---: | --- |
| Demo / intro | 1920×1080 | 330 | 11.000 s | 11.008 s | AAC |
| Showcase / pulse | 960×540 | 96 | 3.200 s | 3.200 s | AAC |
| Showcase / signal | 960×540 | 96 | 3.200 s | 3.200 s | AAC |
| Showcase / signal / carrier | 960×540 | 48 | 1.600 s | 1.600 s | AAC |

The demo container's additional 8 ms is its AAC stream duration, not an extra video frame. Source-tree SHA-256 values before and after the fresh run:

```text
demo     c14ff630deebdaa2bdcbc8b085283953ce3b2a35a547aefb0b17e05e57db9e78
showcase 670d3b8ff2ec795632bca6eedde02597aee0c5b8df4ce15f91207217015bd167
```

The initial reviews were explicitly marked needs-revision after opening their first-frame titles and calculating contrast below 3:1. They remain retained outside `final/`, with the old source digest. The accepted reviews use fresh PNGs and the corrected source digest; no old screenshot or hash was edited to manufacture acceptance. The accepted decision is agent visual review, not human approval or subjective audio acceptance.

Real-browser tests cover project/scene/shot navigation, direct URLs, refresh, Back/Forward, CLI-selected noninitial scenes, legacy scene aliases, malformed/repeated selectors, delayed stale requests, exact/reverse/rapid seeks, playback/pause/end/replay, keyboard behavior, audio seek/pause/reset, loading/empty/error recovery, missing images, Retry frame, loaded fonts and phone overflow.

Supplemental control-by-control record, using the actual CLI server:

| Action | Observed result |
| --- | --- |
| CLI `--project projects/showcase --scene signal` | Opens carrier at scene frame 0 |
| Click receive | Frame 48 and canonical `project=showcase&scene=signal&shot=receive` |
| Reload, Back, Forward | Receive 48, carrier 0, receive 48 |
| Project selector: demo | Intro frame 0; previous project's media removed |
| Shot buttons plus native slider arrow keys | Demo frame 70 → 10 → 70, with ready acknowledgement at each target |
| Next, Previous | 70 → 71 → 70 |
| Play, Pause | Frame advances, then returns to paused ready state |
| Focus Project, Tab | Scene receives a visible solid outline of at least 2 px |
| Project selector: showcase; Scene selector: signal then pulse | Each selected scene starts ready at frame 0 |
| Phone controls | No horizontal overflow; project/scene, both shots, three transport buttons and slider are each 44 px high |
| Open unknown project URL | Explicit alert, no fallback iframe |
| Open demo recovery | Demo intro becomes ready at frame 0 |
| Owned browser/server cleanup | Browser closed and CLI server stopped; empty server stderr |

Two earlier supplemental runs stopped at agent-browser range-fill and label-focus commands. Their records remain in `ui/` and `ui-final/`; they are not counted as successful final runs. The complete run uses native range keyboard input and explicit selector focus. No application code was changed in response to those tool interaction failures.

### Visual delivery gate

The existing direction is a quiet, dark video-review workspace, with the preview as focal point, IBM Plex Sans interface text and JetBrains Mono clocks: ENERGY 1 / RHYTHM 1 / MOTION 1. No new decorative assets or visual direction were invented. The title-opacity adjustment preserves the showcase's supplied paper/ink/terracotta direction.

Scope of the gate: the changed Studio controls and supplied showcase shots, in the tested Chromium environment. It is not a claim about every browser or physical phone.

**Hard gates**

- R-02 PASS: new report/UI prose uses no em dash; existing user-authored content was not silently rewritten.
- R-03 PASS: the retained 390×844 run has width/scroll width 390 and eight 44 px controls; desktop and phone PNGs were opened and inspected.
- R-17 PASS: frame totals, durations, test counts and hash counts come from manifests, actual test output and ffprobe records.
- R-18 PASS: no testimonials, people or invented endorsements were added.
- R-23 PASS: no unrequested logo, avatar or artwork was generated; existing fonts/SVG were retained and the supplied audio generator produced the missing diagnostic WAVs.
- R-24 PASS: project/scene options and shot buttons use real catalog entries; malformed destinations show an explicit recovery state.
- R-25 PASS: measured Studio text pairs meet 4.5:1 and corrected large showcase titles meet 3:1; exact color pairs and calculations are retained in `contrast.json`.
- R-26 PASS: the control-by-control table records actual project/scene/shot, transport, timeline and recovery behavior; browser tests also exercise Retry and warning disclosure.
- R-27 PASS: actual browser tests exercise loading, empty catalog/project, fetch failure, runtime failure, missing image and Retry recovery.
- R-28 PASS: no FAQ or template content was added.
- R-32 PASS: native slider arrow keys seek correctly; Project → Tab focuses Scene with a solid outline at least 2 px wide; keyboard shortcut and disclosure tests pass.
- R-33 PASS: UI changes live directly in `Studio.tsx`, `catalog.ts` and `studio.css`; external verification scripts do not rewrite application styles or features.
- R-34 PASS: the existing fixed dark workspace is the only theme shipped; no nonfunctional theme toggle was introduced.
- R-35 PASS: the app was run through the production CLI, all listed controls exercised, desktop/phone screenshots opened and console/page errors inspected; see the recorded control table.
- R-36 PASS: this report distinguishes actual execution, expected failure, named agent review and untested portability; it makes no compliance or security-certification claim.
- R-37 PASS: the existing video-judging direction in `docs/studio.md` was retained and the design read was stated before editing.
- R-38 PASS: the UI displays actual manifest/catalog data and diagnostic fixtures are labeled as such in their license/docs.

**Purpose gates**

- R-01 PASS: no gradient or glow treatment added; the existing blue accent marks interactive controls.
- R-04 PASS: no decorative icon library added; transport labels describe real actions.
- R-06 PASS: local IBM Plex Sans serves interface readability and JetBrains Mono aligns frame/time readouts; browser font-loading assertions pass.
- R-07 PASS: no decorative background grid added; the preview remains the judging surface.
- R-08 PASS: no decorative CTA arrows added; previous/next controls change exactly one frame.
- R-09 PASS: no promotional badges added; state messages report actual loading/errors.
- R-10 PASS: no blur/glass stack added; flat surfaces keep preview colors legible.
- R-12 PASS: no new shadow stack added; layout and surface contrast separate controls.
- R-13 PASS: no glow added; a visible outline supplies keyboard focus.
- R-14 PASS: shots remain an ordered functional list, not a repeated feature-card grid.
- R-19 PASS: UI motion comes from requested video playback, not decorative reveal templates; shot state remains frame-addressable.
- R-22 PASS: the supplied antenna SVG depicts the signal scene's actual subject and remains local.

**Liveliness and identity**

- Design read PASS: video-review workspace for shot authors, preview-first dark language, stated before edits.
- ENERGY 1 PASS: restrained selectors and transport remain subordinate to the actual video.
- RHYTHM 1 PASS: project/scene, shots, preview and timeline retain the existing predictable workspace structure.
- MOTION 1 PASS: no ornamental UI motion added; playback alone advances the scene.
- Focal point PASS: the retained desktop capture places the selected scene in the primary preview, not decorative content.
- Hierarchy/whitespace PASS: sidebar selection and transport are separated from the video surface in the existing layout.
- Accent/identity PASS: one blue functional accent and frame-accurate clocks retain the Framecraft authoring identity.

**Craftsmanship and consistency**

- C-1 PASS: dark surfaces support color judging; native selectors expose catalog scope; mono clocks expose exact frame position; spacing separates selection from playback.
- C-2 PASS: project/scene selection, shot jump, range seek, previous/next, play/pause, Retry and recovery are exercised by real browser tests.
- C-3 PASS: layout is driven by actual projects, scenes, shots and preview controls, without marketing filler.
- C-4 PASS: real tests cover loading/empty/error states, malformed links, stale requests, keyboard focus and phone overflow.
- C-5 PASS: raw logs, exact arguments, PNGs, hashes, source digests and ffprobe output are retained.
- R-05 PASS: the functional workspace structure was preserved, not replaced by a landing-page template.
- R-11 PASS: control corners stay consistent with the existing square, quiet interface.
- R-15 PASS: Play, Pause, Retry frame and Open demo describe their tested actions.
- R-16 PASS: no marketing buzzwords or invented capabilities added.
- R-20 PASS: the shot list, exact frame clock and video surface remain specific to Framecraft.
- R-21 PASS: fixed dark surfaces have the documented purpose of judging video colors.
- R-29 PASS: Studio keeps neutral surfaces plus one blue accent; showcase keeps its supplied paper/ink/terracotta palette.
- R-30 PASS: no imitation of another product or new visual direction introduced.
- R-31 PASS: the major layout, color, type, motion and asset choices each have their one-line purpose above.

## E. Remaining risks and limits

- Repeated hashes establish same-environment repeatability, not cross-machine pixel identity. No second host, GPU/OS combination or non-Chromium browser was tested.
- Review decisions are named agent reviews, not human editorial approval. The diagnostic tones demonstrate timing/isolation, not finished sound design. No subjective listening-quality or production-mastering claim is made.
- Project HTML is trusted local executable content. Canonical serving and localhost binding are not a hostile-content sandbox, remote authentication or cross-project script isolation.
- Manifests and registry metadata are loaded at Studio startup. Restart after manifest or Studio changes; this phase adds no file watcher or editor.
- Normal success/failure cleans process-owned bundles and partial files. Forced process termination can leave temporary files. Concurrent source mutation remains outside a transactional snapshot model; review/hash before/after digests detect changes during their work.
- Existing deliberate output replacement remains atomic on success. Use a new output path when retaining an older successful render is important. Existing review directories, unlike render targets, are never overwritten.
- Remotion's Player emits its existing license reminder. It was not suppressed or treated as proof of license eligibility; check the upstream license for the intended deployment.

## F. Working-tree preservation and attribution

Work began on `main` at `4f29bc6`, already two commits ahead of `origin/main`. The checkout already had **19 modified tracked files, 478 insertions and 178 deletions**, plus untracked `.taste-skill/`, the showcase fixture, registry/selection modules and their tests. Those changes were not attributed to this implementation or discarded.

The original binary-capable patch, initial status and copies of the original untracked files were retained before edits. `.taste-skill/` was not modified. The original generic renderer, generalized review verification, selection helper and much of the multi-scene loader work were preserved rather than rewritten.

Assistant-only delta against that initial dirty checkout: **35 files total: 33 text files with 680 insertions and 223 deletions, and two generated WAV binaries**, excluding this report. This is not the combined HEAD diff. `assistant-delta.json` gives per-file counts; `assistant-delta.patch` and `baseline-source-files/*.snapshot` preserve exact attribution. Only two existing showcase HTML lines changed; the rest of its supplied source/assets were kept, with the missing audio generated from its existing script.

No commit, push, merge, rebase, reset, stash, new worktree or dependency update was performed. Generated proof remains under ignored `output/`; it is not part of the source diff.

The combined tracked HEAD diff is **31 files, 968 insertions and 340 deletions**. It includes original user work and excludes all untracked files. In particular, `AGENTS.md`, `src/review/artifacts.ts`, `src/spike/index.tsx`, `src/spike/selection.ts` and the existing render/review-artifacts/selection/validate tests have no assistant edits. The exact initial and final records, expanded untracked listing and per-file attribution are retained as `baseline/status.txt`, `git-status-final.txt`, `git-status-final-all.txt`, `git-diffstat-final.txt`, `git-numstat-final.txt` and `assistant-delta.json` under the evidence root.

Exact final `git status --short`:

```text
 M AGENTS.md
 M docs/agent-workflow.md
 M docs/audio.md
 M docs/rendering.md
 M docs/studio.md
 M scripts/atomic-output.ts
 M scripts/hash.ts
 M scripts/review.ts
 M scripts/spike.ts
 M scripts/studio.ts
 M scripts/validate.ts
 M skills/framecraft-export/SKILL.md
 M skills/framecraft-html-shot/SKILL.md
 M skills/framecraft-sound/SKILL.md
 M skills/framecraft-storyboard/SKILL.md
 M skills/framecraft-visual-review/SKILL.md
 M src/review/artifacts.ts
 M src/spike/index.tsx
 M src/spike/project.ts
 M src/studio/Studio.tsx
 M src/studio/studio.css
 M tests/audio-export.test.ts
 M tests/bundle-cleanup.test.ts
 M tests/hash.test.ts
 M tests/project.test.ts
 M tests/render.test.ts
 M tests/review-artifacts.test.ts
 M tests/review-capture.test.ts
 M tests/studio-browser.test.ts
 M tests/studio.test.ts
 M tests/validate.test.ts
?? .taste-skill/
?? docs/phase35-report.md
?? projects/showcase/
?? src/spike/registry.ts
?? src/spike/selection.ts
?? src/studio/catalog.ts
?? tests/cli.test.ts
?? tests/fixtures/studio-server.ts
?? tests/registry.test.ts
?? tests/selection.test.ts
?? tests/studio-catalog.test.ts
```

Exact final `git diff --stat`:

```text
 AGENTS.md                                |   8 +-
 docs/agent-workflow.md                   |  12 +-
 docs/audio.md                            |   8 +-
 docs/rendering.md                        |  27 +++-
 docs/studio.md                           |  32 ++++-
 scripts/atomic-output.ts                 |  19 ++-
 scripts/hash.ts                          |  59 ++++++---
 scripts/review.ts                        |  82 ++++++-------
 scripts/spike.ts                         |  42 +++++--
 scripts/studio.ts                        | 107 +++++++++++++---
 scripts/validate.ts                      |  35 +++++-
 skills/framecraft-export/SKILL.md        |   2 +-
 skills/framecraft-html-shot/SKILL.md     |   2 +-
 skills/framecraft-sound/SKILL.md         |   2 +-
 skills/framecraft-storyboard/SKILL.md    |   2 +-
 skills/framecraft-visual-review/SKILL.md |   2 +-
 src/review/artifacts.ts                  |  15 ++-
 src/spike/index.tsx                      |  47 +++----
 src/spike/project.ts                     |  11 +-
 src/studio/Studio.tsx                    | 188 +++++++++++++++++-----------
 src/studio/studio.css                    |   9 +-
 tests/audio-export.test.ts               |  71 ++++++++++-
 tests/bundle-cleanup.test.ts             |   4 +-
 tests/hash.test.ts                       |  41 ++++++-
 tests/project.test.ts                    |  57 ++++++++-
 tests/render.test.ts                     |  35 +++++-
 tests/review-artifacts.test.ts           |  19 +++
 tests/review-capture.test.ts             |  56 ++++++++-
 tests/studio-browser.test.ts             | 204 +++++++++++++++++++++----------
 tests/studio.test.ts                     |  87 ++++++++-----
 tests/validate.test.ts                   |  23 ++++
 31 files changed, 968 insertions(+), 340 deletions(-)
```

## G. Next phase recommendation

Do a small portability-and-acceptance pass before adding editor features: run the selected-scene hash reports on a second Linux x64 host with the same project sources and pinned renderer/browser; investigate actual PNG differences rather than updating goldens automatically; then have a human review the retained video and audio. Keep narration explicitly requested and keep any future project mutation separate from this read-only preview/export boundary.
