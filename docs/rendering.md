# Phase 0 rendering

On Linux, install [Bun](https://bun.sh/) 1.4.3, then run:

```sh
bun install --frozen-lockfile
bunx remotion browser ensure
bun test
bun run validate
bun run snap --frame 70 --shot diagram
bun run snap --frame 160
bun run snap --shot commit --frame 0
bun run snap --shot commit --frame 60
bun run snap --shot commit --frame 119
bun run render --shot diagram
bun run render
bun run hash
bun run studio
```

Outputs are written under `output/snaps/` and `output/`, outside the bundled project assets. `--frame` is an integer zero-based frame in the selected shot or entire scene; `--shot` selects an ID from `projects/demo/scenes/intro/scene.json` (`title`, `diagram`, `close`, `commit`). The full scene contains 330 frames; the shots last 60, 90, 60, and 120 frames, with no overlaps. A shot-scoped `--frame` is shot-local. CLI inputs and project metadata are validated before bundling. Failure removes only the unfinished `.partial-*` output, leaving any previous render intact. The CLI currently targets this one demo project; `render` and `snap` are spike commands that export or still the one scene, not a general project loader. For frame-by-frame inspection in a browser, use `bun run studio` and see [Preview Studio](studio.md).

The project schema is `projects/demo/project.json` → `scenes/intro/scene.json` → independent HTML shot entries. For a new shot, follow `AGENTS.md`: include `runtime.js`, register `window.framecraft.shot()` once, and **set** the exact frame state in `renderFrame(ctx)` (no return value required). The bridge exchanges same-origin, versioned `init`, `ready`, `seek`, `rendered`, and `error` messages. React's `useCurrentFrame()` in the shot's `<Sequence>` gives a shot-local frame; rendering waits for the matching `rendered` message before taking a still. Unacknowledged frames cancel after approximately 9 seconds. CSS/WAAPI animations and paused GSAP timelines registered with `window.framecraft.timeline(timeline)` are explicitly sought to `ctx.seconds`; the `timelines: [timeline]` shot property still works but is deprecated. All assets must be local.

On each seek, the shot sees `Date.now() = 1700000000000 + ctx.seconds * 1000`, `performance.now()` and `requestAnimationFrame` timestamps equal to `ctx.seconds * 1000`, and a seeded `Math.random()` sharing the `ctx.random()` sequence. Progress is first frame 0, last frame 1, or 1 for a single-frame shot. Seeks serialize: if a newer frame arrives during an earlier seek, only the newest frame is acknowledged. Before `rendered`, the runtime flushes layout, waits for `document.fonts.ready`, decodes all `<img>` elements, waits two native animation frames, and rechecks font readiness. The four demo shots use bundled IBM Plex Serif, IBM Plex Sans, and JetBrains Mono WOFF2 files under `projects/demo/assets/fonts/`, with the corresponding `*-OFL.txt` licenses. The `commit` shot drives its block-cursor blink from `ctx.frame`; the previous CSS blink produced a one-pixel edge difference at frame 30 between renders. `setInterval` and `setTimeout` are not controlled; timer-driven state and live video are not deterministic. `bun run validate` checks the manifest and prints shot duration in frames and seconds. It warns (without failing) for `setInterval`, `requestAnimationFrame`, `fetch(`, remote URLs (excluding SVG namespace declarations), `Math.random` in shot HTML, and undeclared first-choice font families in shot HTML or linked local CSS. This conservative text scan is not a parser: single rAF callbacks can warn, and scripts in other files or indirect calls can escape it.

`bun run hash` bundles once and renders title frames 0/30/59, diagram frames 0/30/70, close frames 0/59, and commit frames 0/30/75/119. It atomically writes `output/hashes.json` with each PNG's SHA-256 and Bun, Remotion, Chromium, OS, and matching `fc-list` installed-font family/path records (`null` when `fc-list` is unavailable). Hashes changed intentionally after bundling fonts; historical PNG hashes in ADR 0001 predate the fonts. Bundle/still temporary directories are removed on both success and failure in normal process exit; forced termination can leave a process-owned temporary directory. To check a second Linux x64 machine (for example, a Dokploy VPS):

```sh
# Locally, from the same Framecraft commit:
bun run hash
cp output/hashes.json /tmp/framecraft-local-hashes.json

# On the VPS, from a checkout of that same commit (Bun 1.4.3 required):
bun --version
bun install --frozen-lockfile
bunx remotion browser ensure
bun run hash

# Locally, copy the report back, then compare frame hashes separately from metadata:
scp USER@VPS:/path/to/framecraft/output/hashes.json /tmp/framecraft-vps-hashes.json
diff -u <(jq -S .frames /tmp/framecraft-local-hashes.json) <(jq -S .frames /tmp/framecraft-vps-hashes.json)
jq .environment /tmp/framecraft-local-hashes.json /tmp/framecraft-vps-hashes.json
```

The comparison uses Bash and `jq` as optional diagnostic tools; replace `USER@VPS` and the remote checkout path. If a hash differs, find the first differing `shot:frame`, for example run `bun run snap --shot commit --frame 75` on both machines, copy that PNG from the VPS, and inspect the two files side by side. Check font loading and the `environment` metadata first; matching versions do not guarantee matching GPU/font/OS behavior. Before the cursor change, two local reports differed only at `commit:30`; the first expanded-report run was not retained for a per-frame comparison. Repeated local reports after the cursor change match. A second-machine run has **not** been performed, so cross-machine pixel identity is unverified. On non-Linux-x64 hosts, set `CHROME_BIN` to the browser executable used for rendering before running `hash`.

Packages `remotion`, `@remotion/{bundler,cli,renderer,player}` are pinned at 4.0.537; React is 19.3.1 and GSAP 3.15.0. `bunx remotion browser ensure` installed Headless Shell Chromium 157.0.8080.0 at `node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell`; override with `CHROME_BIN=/path/to/chrome` if necessary. The Remotion compositor package contains FFmpeg and ffprobe n7.1; no system installation is needed for the spike. Check exact MP4 properties with:

```sh
node_modules/@remotion/compositor-linux-x64-gnu/ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_read_frames -of json output/intro.mp4
```

The licensing and weight trade-off is recorded in [ADR 0001](adr/0001-renderer.md). Demo output uses H.264/yuv420p. Browser assets and generated videos are not committed.
