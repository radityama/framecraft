# Preview Studio

A local browser workspace for inspecting Framecraft shots frame by frame. It plays the same HTML shots the renderer uses; it does not encode video or edit projects.

```sh
bun run studio
```

Open the printed `http://127.0.0.1:3000/` URL. Set `PORT` to change the port (`PORT=0` picks a free one). The server binds to localhost only, validates `projects/demo`, bundles the Studio once at startup and serves it with the project's local assets. Stop it with `Ctrl+C`; the temporary bundle is removed. Restart it after changing Studio source or project shots, because the bundle is built at startup.

## Controls

- **Scene** selects a scene from `projects/demo/project.json`. The URL carries the choice as `?clip=<scene-id>`, so a reload or a shared link reopens the same scene. An unknown ID shows an error with buttons for the scenes that exist.
- **Shots** lists the validated shots in order with their frame counts. Clicking one seeks to its first frame.
- **Prev / Next** step exactly one frame and pause.
- **Play / Pause** runs the Player's own clock. Playback stops on the last frame and does not loop; pressing Play there restarts from frame 0.
- **Timeline** is a frame range from 0 to the last frame. The filled span marks the current shot; the line marks the playhead.
- The timecode reads `mm:ss:ff` where the last pair is frames at the scene's fps. The frame counter shows `Frame N of last`.

Keyboard: Tab moves through the scene picker, timeline, transport and shot buttons; Space or Enter activates the focused button. The timeline range responds to the arrow keys.

## Frame accuracy

The Studio mounts the same `SceneComposition` as the Remotion export inside `@remotion/player`. Seeking is delegated to the deterministic shot runtime: `ShotView` posts a frame to the shot iframe, and the runtime settles fonts, images and animations before it acknowledges. Studio marks a requested frame ready only when the acknowledgement for that shot-local frame arrives from the mounted iframe, so a fast or reversed seek never leaves an older frame labelled as current. While a seek is pending, the preview shows a loading overlay rather than a stale frame.

Playback advances through the Player's frame updates; the acknowledgement gate applies to manual seeks. Switching scenes unmounts the Player and its iframe, drops pending acknowledgements and resets frame, playback and error state. A shot that throws or fails to load shows the runtime's error message with a retry.

## Interface notes

The Studio is an app screen, not a marketing page: the preview is the focal point and the chrome stays quiet. It uses the already bundled IBM Plex Sans for interface text and JetBrains Mono only for the timecode and frame readouts, so the workspace and its output share one type system without remote assets. The fixed dark theme is deliberate for judging video colour.

The `data-terminal` direction's accent is a single 1px selection line: active shot, active timeline span, and the Play control. Numbers and labels stay white or grey; no status is carried by colour alone. Design-taste's inspector passes at 1440, 768 and 390 with `font-not-dealt` allowed, because the project's local licensed fonts replace the dealt Public Sans by design. Two lint warnings remain and are intentional: zero-padded timecode is a clock, and the monospace is confined to that clock.

## Scope and limits

- Read-only preview: no shot editing, drag-and-drop, audio, narration, live video or transitions.
- The project loader used here accepts zero or more scenes. The existing `bun run render` path still requires exactly one scene, so the demo exports `intro` as before; previewing a multi-scene project does not change what the renderer can export.
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

Representative screenshots are in `docs/screenshots/`.
