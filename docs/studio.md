# Preview Studio

A local browser workspace for inspecting Framecraft shots frame by frame and recording visual feedback. It plays the same HTML shots the renderer uses; it does not encode video or edit project source.

```sh
bun run studio
bun run studio --project projects/showcase --scene signal
```

Open the printed localhost URL. Set `PORT` to change the port (`PORT=0` picks a free one). The server binds to `127.0.0.1`, discovers valid projects under the repository's `projects/` directory and bundles Studio once. Invalid projects produce diagnostics without hiding valid neighbors; ambiguous duplicate project IDs are omitted. Catalog order is by project ID, independent of directory order. Unrelated directories without `project.json` are ignored.

With no arguments, the initial selection is `demo`/`intro`. `--project <path>` accepts a relative or absolute project directory, also authorizing that one external root for this process; canonical symlink aliases do not create duplicate entries. `--scene <id>` sets its initial scene, otherwise Studio uses its first scene. Explicit URL IDs override that initial choice. Stop with `Ctrl+C` to remove the temporary bundle. Restart after manifest or Studio changes. HTML and assets are served from their validated roots, not copied into the Studio bundle.

## Controls

- **Project / Scene** select from the server catalog. Canonical links use `?project=showcase&scene=signal&shot=receive`. Refresh and browser Back/Forward restore that selection; project and scene switches pause and reset the preview and media. The legacy `?clip=<scene-id>` remains a scene alias, not a shot selector. Unknown IDs, path-like IDs and repeated/conflicting selection parameters show recoverable errors instead of falling back silently.
- **Shots** lists the selected scene's shots in order with frame counts. Clicking one seeks to its first frame and updates `shot` in the URL. Direct links restore that shot's start, not an arbitrary scrubbed frame. On tablets the list scrolls horizontally above the preview; on phones it uses two columns.
- **Prev / Next** step exactly one frame and pause.
- **Play / Pause** runs the Player's own clock. Playback stops on the last frame and does not loop; pressing Play there restarts from frame 0.
- **Start / End / Stop** seek scene boundaries; Stop pauses and returns to zero. Previous shot / Next shot seek adjacent shot starts, bounded at scene ends.
- **Playback speed** selects 0.25×, 0.5×, 1× or 2× for preview only; export timing never changes.
- **Timeline** has a scene ruler, proportional shot segments with half-open ranges, current-shot selection, frame-exact range scrubber and numeric frame entry. Fit scene / Zoom in / Zoom out change visualization only; the timeline scrolls independently of the page.
- **Inspector** shows canonical project/scene/shot, frame, duration, source entry and declared audio assets without implying manifest editing.
- **Review annotations / Revision comparison** provide persistent feedback and matched captures; see [Visual feedback](feedback.md).
- The timecode reads `mm:ss:ff` where the last pair is frames at the scene's fps. The frame counter shows `Frame N of last`.

Keyboard: Tab moves through native controls. Outside controls, Space toggles play, Left/Right steps a frame, Shift+Left/Right selects adjacent shots, Home/End selects scene boundaries, +/− zooms, and 0 fits. Space/Enter activates focused buttons; ranges retain native arrow behavior. Shortcuts never override typing in inputs, textareas or editable regions. A shortcut disclosure is beside the timeline.

## Frame accuracy

The Studio mounts the same `SceneComposition` as the Remotion export inside `@remotion/player`. Seeking is delegated to the deterministic shot runtime: `ShotView` posts a frame to the shot iframe, and the runtime settles fonts, images and animations before it acknowledges. Studio marks a requested frame ready only when the acknowledgement for that shot-local frame arrives from the mounted iframe, so a fast or reversed seek never leaves an older frame labelled as current. While a seek is pending, the preview shows a loading overlay rather than a stale frame.

Playback advances through the Player's frame updates; the acknowledgement gate applies to manual seeks and paused frames that have not settled yet. Switching scenes unmounts the Player and its iframe, drops pending acknowledgements and resets frame, playback and error state. A shot that throws, fails to load, or references an image that cannot decode shows an error with a retry.

Audio follows the Player clock across play, pause, frame seeks and scene switches. Browsers may block autoplay until the user interacts. Cues are declared in the scene and shot manifests, not in the HTML iframe; see [Audio](audio.md).

## Interface notes

The Studio is an app screen, not a marketing page: the preview is the focal point and the chrome stays quiet. It uses the already bundled IBM Plex Sans for interface text and JetBrains Mono only for the timecode and frame readouts, so the workspace and its output share one type system without remote assets. The fixed dark theme is deliberate for judging video colour.

The existing direction uses a quiet selection line and active-shot surface. Numbers and labels stay white or grey; status also uses text. Local licensed fonts are deliberate, and monospace is confined to clocks, source/code and frame readouts. Phase 4 extends this language rather than replacing it; current measurements and screenshots belong in [the Phase 4 report](phase4-report.md), not a historical inspector claim.

## Server contract and asset boundary

`src/studio/catalog.ts` defines the shared server/UI catalog type:

```ts
{
  projects: [{id, title, scenes: [{id, title, durationFrames}]}],
  warnings: string[],
  selected: {projectId, sceneId} // sceneId is null for an empty project
}
```

- `GET /api/projects` returns that catalog, without filesystem roots.
- `GET /api/project?id=<project-id>` returns validated project data. Shot and audio paths are prefixed with the project ID for `/public/<project-id>/...`.
- Compatibility: `GET /api/project` still returns the raw demo project and `/public/assets/...`, `/public/scenes/...`, `/public/runtime.js` still serve demo assets. New clients should use the ID-based API and namespace.
- IDs never authorize paths. Only discovered roots and the explicit CLI root can be served. Static requests reject malformed encoding, traversal, backslashes, NULs, directories and symlink escapes; missing files return 404. Duplicate/malformed API IDs return 400 and unknown IDs return 404.
- `GET /api/review?project=<id>&scene=<id>` returns validated feedback, expected-revision token, current source SHA and authorized revision summaries. Same-origin JSON `PUT` with `If-Match` saves feedback only. `GET /api/feedback-export` downloads JSON/Markdown; `GET /api/revision-image?revision=<sha>&capture=<index>` reads one authorized, hash-checked PNG. See [feedback boundaries](feedback.md).

Projects are trusted local executable HTML, not an untrusted-content sandbox. Localhost binding and containment do not provide remote authentication or isolate scripts between authorized projects. No remote project URL, upload or filesystem browser is provided. The only write API is constrained, versioned feedback in the CLI-authorized workspace, with same-origin/size/schema checks, atomic replacement and expected-revision conflict detection. Historical artifacts remain immutable.

## Scope and limits

- Source remains read-only: no clip trimming, shot editing, drag-and-drop editor, narration generation, live video or transitions. Review feedback is editable separately.
- Studio supports empty projects with a recovery message. Export and review target one selected nonempty scene at a time; multi-scene projects require `--scene`. Duplicate shot IDs are allowed across scenes, not within a scene. Generic `scene` and `shot` compositions receive the selected scene and video settings through input props.
- Cross-machine pixel identity is not guaranteed; see [ADR 0001](adr/0001-renderer.md).
- The theme is fixed; there is no toggle.
- The Studio hides the Remotion Player's own controls so the transport, timeline and timecode stay in one frame-accurate place.

## Verification

```sh
bun test                  # loader, server, frame mapping and real-browser Studio tests
bun run typecheck
bun run validate
bun run render
```

Historical screenshots are in `docs/screenshots/`. See [Phase 4 architecture](phase4-architecture.md), [motion helpers](motion.md) and [Phase 4 verification](phase4-report.md) for the current workflow.
