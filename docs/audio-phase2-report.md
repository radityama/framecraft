# Phase 2 audio verification — 2026-10-22

## Checks performed

- Red/green: `bun test tests/audio-export.test.ts` first failed on the missing `scripts/atomic-output.ts`; after extraction it passed (2 tests, 61 assertions, 41.89s). An intermediate run exposed that the bundled FFmpeg cannot mux raw `s16le`; the test now decodes to a WAV pipe and reads its PCM samples.
- `bun test`: 50 passed, 0 failed, 315 assertions across 12 files (final run 114.88s). `bun test tests/studio-browser.test.ts`: 9 passed, 0 failed, 45 assertions (15.04s).
- `bun run typecheck`: passed. `bun run validate`: passed; reported title 60, diagram 90, close 60 and commit 120 frames.
- `bun run render`: passed; `output/intro.mp4`, 330 frames, 1920×1080 at 30 fps, 634583 bytes. `bun run render --shot title --output /tmp/opencode/framecraft-phase2-silent.mp4`: passed; 60 frames, 52451 bytes.
- Independent stream probe with `node_modules/@remotion/compositor-linux-x64-gnu/ffprobe -v error -count_frames -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_read_frames -of json <file>`: the full output contains H.264 1920×1080 30/1 video with 330 decoded frames and AAC audio with 516 decoded frames; the scoped title has H.264 video with 60 frames and **no audio stream**.
- Independently decoded 0.06-second mono 48 kHz PCM WAV windows from `output/intro.mp4` using the bundled FFmpeg. A sine/cosine projection at 110/165/440/740 Hz gave approximate amplitudes (16-bit scale):

  | Scene time (s) | 110 Hz | 165 Hz | 440 Hz | 740 Hz | Interpretation |
  | --- | ---: | ---: | ---: | ---: | --- |
  | 1.00 | 509 | 516 | 9 | 4 | bed only |
  | 2.40 | 472 | 578 | 7653 | 18 | bed + hit-a |
  | 2.65 | 586 | 798 | 7689 | 7677 | bed + both effects |
  | 3.09 | 538 | 599 | 34 | 7666 | bed + hit-b only |
  | 3.22 | 460 | 538 | 31 | 7639 | bed + hit-b after its 20-frame loop point |
  | 10.88 | 154 | 154 | 3 | 2 | fading bed |

- The integration test also exported the zero-gain close shot and checked decoded samples are silent if an audio stream is emitted. It replaced a test target with `previous-good-output`, then ran `render --shot missing --output <target>` and confirmed the earlier contents were unchanged. The direct `atomicOutput` test wrote partial data, threw, and confirmed the prior target survived with no partial file left.
- Manual agent-browser Studio session: sought to frame 78 and observed the bed at 2.6 s with hit-a and hit-b mounted; played and paused, observing paused audio. With an in-memory local proxy adding a silent second scene to the API (no repo files changed), switched from intro at frame 78 to the second scene: frame reset to 0, one iframe remained, and zero project audio elements remained; switching back remounted the bed. The existing browser tests also assert seek, looping, pause/replay and scene-switch cleanup. No screenshot was needed because no UI changed.
- After closing the browser and servers, no `/tmp/framecraft-bundle-*`, `/tmp/framecraft-studio-*` or `/tmp/framecraft-studio-browser-*` directories remained. `git diff --check` passed. Pre-existing `.taste-skill/` and `framecraft.zip` were not touched.

## Limits

The fixture tones are synthetic and local (CC0 1.0; see `projects/demo/assets/audio/LICENSE.md`). These checks establish frame-level placement and audible content on this setup, not sample-accurate timing or bit-identical audio across machines, browsers or encoders. A second-machine render and a human listening test were not performed. Browser autoplay may require interaction; manual scene-switch verification used a mocked second scene because the shipped demo has only one scene. A forced process kill can leave temporary files despite normal-exit cleanup.
