# Preview Studio

A local browser workspace for inspecting Framecraft shots frame by frame. It plays the same HTML shots the renderer uses; it does not encode video or edit projects.

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
- **Timeline** is a frame range from 0 to the last frame. The filled span marks the current shot; the line marks the playhead.
- The timecode reads `mm:ss:ff` where the last pair is frames at the scene's fps. The frame counter shows `Frame N of last`.

Keyboard: Tab moves through the project and scene pickers, shot buttons, transport and timeline. When focus is not on a control, Space plays or pauses and Left / Right steps one frame (pausing playback). Space or Enter activates a focused button; the focused timeline range responds to its own arrow keys. Shortcuts do not override focused form controls.

## Frame accuracy

The Studio mounts the same `SceneComposition` as the Remotion export inside `@remotion/player`. Seeking is delegated to the deterministic shot runtime: `ShotView` posts a frame to the shot iframe, and the runtime settles fonts, images and animations before it acknowledges. Studio marks a requested frame ready only when the acknowledgement for that shot-local frame arrives from the mounted iframe, so a fast or reversed seek never leaves an older frame labelled as current. While a seek is pending, the preview shows a loading overlay rather than a stale frame.

Playback advances through the Player's frame updates; the acknowledgement gate applies to manual seeks and paused frames that have not settled yet. Switching scenes unmounts the Player and its iframe, drops pending acknowledgements and resets frame, playback and error state. A shot that throws, fails to load, or references an image that cannot decode shows an error with a retry.

Audio follows the Player clock across play, pause, frame seeks and scene switches. Browsers may block autoplay until the user interacts. Cues are declared in the scene and shot manifests, not in the HTML iframe; see [Audio](audio.md).

## Interface notes

The Studio is an app screen, not a marketing page: the preview is the focal point and the chrome stays quiet. It uses the already bundled IBM Plex Sans for interface text and JetBrains Mono only for the timecode and frame readouts, so the workspace and its output share one type system without remote assets. The fixed dark theme is deliberate for judging video colour.

The `data-terminal` direction's accent is a single 1px selection line: active shot, active timeline span, and the Play control. Numbers and labels stay white or grey; no status is carried by colour alone. Design-taste's inspector passes at 1440, 768 and 390 with `font-not-dealt` allowed, because the project's local licensed fonts replace the dealt Public Sans by design. Its one lint warning is intentional: monospace is confined to clock and frame readouts.

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

Projects are trusted local executable HTML, not an untrusted-content sandbox. Localhost binding and containment do not provide remote authentication or isolate scripts between authorized projects. No remote project URL, upload, filesystem browser or write API is provided.

## Scope and limits

- Read-only preview: no shot editing, drag-and-drop, narration generation, live video or transitions.
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

Representative screenshots are in `docs/screenshots/`. The Phase 1 verification results are in [studio-phase1-report.md](studio-phase1-report.md).
