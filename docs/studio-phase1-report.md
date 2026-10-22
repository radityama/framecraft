# Preview Studio — Phase 1 verification

The local Studio opens `?clip=intro` and previews the four independently loaded demo shots (60 + 90 + 60 + 120 = 330 frames). It keeps the existing Remotion Player and shot runtime; no export or authoring protocol changed. The ordered shot list is left of the preview on desktop, horizontal on tablets, and two columns on phones. Space toggles playback and Left / Right step by one frame when focus is not on a control.

## Checks run

- `bun test`: 37 pass, 0 fail. Browser tests cover shot boundaries, repeated/reverse and rapid seeks, quick keyboard stepping, native control keys, playback/pause/end, direct/invalid `?clip=` routing, scene switching, loading/error/empty states, thrown shot errors, missing-image decode failures, and phone-width shot visibility. Server test covers manifest/asset serving, traversal rejection, and temporary-bundle removal after shutdown.
- `bun run typecheck` and `bun run validate`: pass; validation reports title 60, diagram 90, close 60, commit 120.
- `bun run studio`: bundled and served locally at `127.0.0.1:3000`. Browser inspection confirmed frame 285 of the commit shot ready on desktop, tablet and phone; at 390px the document width remained 390px with the active shot visible and no browser page errors.
- `bun run render`: `output/intro.mp4` produced for 330 frames. Remotion's `getVideoMetadata` reported H.264, 1920×1080, 30 fps and 11 seconds (330 frames at 30 fps). `ffprobe` was not installed, so frame count is the renderer's reported count rather than an independently probed container frame count.
- Design-taste app inspector: 0 FAIL, 0 WARN at 1440, 768 and 390, allowing `font-not-dealt` for bundled local fonts. Lint: 0 FAIL, 1 intentional monospace warning for clock/frame readouts.

Screenshots captured after frame acknowledgement and inspected: [desktop](screenshots/studio-desktop.png), [tablet](screenshots/studio-tablet.png), [phone](screenshots/studio-phone.png). The phone screenshot was recaptured after fixing the initially hidden active shot.

## Limits

The Studio is a local read-only preview, not an editor or renderer. No second-machine pixel comparison, audio, transitions or live-video synchronization was tested. Studio rebuilding happens on server restart; a forced process kill can leave its temporary bundle, while ordinary shutdown removes it.
