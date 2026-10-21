# Phase 0 rendering

On Linux, install [Bun](https://bun.sh/) 1.4.3, then run:

```sh
bun install --frozen-lockfile
bunx remotion browser ensure
bun test
bun run snap --frame 70 --shot diagram
bun run snap --frame 160
bun run render --shot diagram
bun run render
```

Outputs are written under `output/snaps/` and `output/`, outside the bundled project assets. `--frame` is an integer zero-based frame in the selected shot or entire scene; `--shot` selects an ID from `projects/demo/scenes/intro/scene.json` (`title`, `diagram`, `close`). The full scene contains 210 frames; the shots last 60, 90, and 60 frames, with no overlaps. A shot-scoped `--frame` is shot-local. CLI inputs and project metadata are validated before bundling. Failure removes only the unfinished `.partial-*` output, leaving any previous render intact. The CLI currently targets this one demo project; `render` and `snap` are spike commands, not a general project loader or interactive preview.

The project schema is `projects/demo/project.json` → `scenes/intro/scene.json` → independent HTML shot entries. For a new shot, follow `AGENTS.md`: include `runtime.js`, register `window.framecraft.shot()`, and return an exact frame state from `renderFrame(ctx)`. The bridge exchanges same-origin, versioned `init`, `ready`, `seek`, `rendered`, and `error` messages. React's `useCurrentFrame()` in the shot's `<Sequence>` gives a shot-local frame; rendering waits for the matching `rendered` message before taking a still. Unacknowledged frames cancel after approximately 9 seconds. CSS/WAAPI animations and paused GSAP timelines passed in `timelines: [timeline]` are explicitly sought to `ctx.seconds`. All assets must be local.

Packages `remotion`, `@remotion/{bundler,cli,renderer,player}` are pinned at 4.0.537; React is 19.3.1 and GSAP 3.15.0. `bunx remotion browser ensure` installed Headless Shell Chromium 157.0.8080.0 at `node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell`; override with `CHROME_BIN=/path/to/chrome` if necessary. The Remotion compositor package contains FFmpeg and ffprobe n7.1; no system installation is needed for the spike. Check exact MP4 properties with:

```sh
node_modules/@remotion/compositor-linux-x64-gnu/ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_read_frames -of json output/intro.mp4
```

The licensing and weight trade-off is recorded in [ADR 0001](adr/0001-renderer.md). Demo output uses H.264/yuv420p. Browser assets and generated videos are not committed.
