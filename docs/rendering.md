# Rendering selected projects and scenes

Production acceptance uses [the production standard](production-standard.md) and `bun run production`; the commands below remain contract-free diagnostics. The isolated `projects/production-desktop` / `desk` acceptance scene contains one `workspace` shot, **450 frames / 15 seconds at 30fps**, with event-mapped original tactile SFX and no voice or music. Its final export is published under `output/production-desktop/final/`; permanent review and cleanup records live under `docs/production-runs/production-desktop/`.

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
bun run render --output /path/to/intro.mp4
bun run validate --project projects/showcase --scene pulse
bun run snap --project projects/showcase --scene pulse --shot opening --frame 0
bun run render --project projects/showcase --scene pulse
bun run render --project projects/showcase --scene signal
bun run hash
bun run hash --project projects/showcase --scene signal --output output/hashes-showcase-signal.json
bun run studio
```

Outputs are written under `output/snaps/` and `output/` by default, outside the bundled project assets. `--output` overrides the destination (absolute or relative to the working directory); use `.mp4` with `render` and `.png` with `snap`. `--project` selects a project directory relative to the working directory or by absolute path, and `--scene` selects a scene ID from that project's validated manifest. The no-argument default remains `projects/demo`/`intro`. Multi-scene projects require `--scene` for scene-specific commands. `--frame` is an integer zero-based frame in the selected shot or scene; `--shot` selects an ID within that scene. The demo intro contains 330 frames: `title` 60, `diagram` 90, `close` 60 and `commit` 120, with no overlaps. A shot-scoped `--frame` is shot-local. CLI inputs and project metadata are validated before bundling. The renderer writes a process-specific `.partial-*` file beside the destination and renames it only after a successful nonempty render; failure removes the partial and preserves a previous file. For browser inspection, use `bun run studio` and see [Preview Studio](studio.md). For audio authoring see [Audio](audio.md).

The project schema is `project.json` → scene references → independent HTML shot entries. Studio accepts an empty scene list; export/review require one selected nonempty scene. Every scene is validated even when another is selected. Scene IDs are unique within a project, shot IDs within a scene; reusing a shot ID in another scene is valid. Scene paths and shot entries must be relative local paths with canonical containment inside the project. Absolute paths, URLs, escaping symlinks and escaping traversal are rejected. The legacy `loadProject()` helper still requires exactly one scene; CLIs use `loadStudioProject()` plus explicit selection instead.

The generic Remotion compositions are `scene` and `shot`, not project-specific IDs. Every selection and render call passes the same `{scene, video, shotId?}` input props, and checks metadata against the validated manifest. For a new shot, follow `AGENTS.md`: include a project-local `runtime.js`, register `window.framecraft.shot()` once, and **set** the complete state in `renderFrame(ctx)`. The runtime waits for the requested shot-local frame, seekable animation state, fonts and images before capture. Unacknowledged frames fail rather than silently exporting stale pixels. All assets must stay local to the selected project.

### Bundled fixtures

| Project / scene | Video | Shots (frames) | Total |
| --- | --- | --- | --- |
| demo / intro | 1920×1080, 30 fps | title 60, diagram 90, close 60, commit 120 | 330 frames, 11 s |
| showcase / pulse | 960×540, 30 fps | opening 48, echo 48 | 96 frames, 3.2 s |
| showcase / signal | 960×540, 30 fps | carrier 48, receive 48 | 96 frames, 3.2 s |
| motion / examples | 640×360, 30 fps | cursor 90, window 90, type 90, camera 90 | 360 frames, 12 s |
| motion-benchmark-02 / film | 1920×1080, 30 fps | wake 360, desktop 450, story 450, resolve 390 | 1650 frames, 55 s |
| production-desktop / desk | 1920×1080, 30 fps | workspace 450 | 450 frames, 15 s |

The showcase uses its own runtime, local licensed fonts, SVG and CC0 diagnostic WAVs. If recreating the WAVs, run `bun projects/showcase/assets/audio/generate.ts`. Both scenes use zero-overlap cuts. Default filenames retain demo compatibility (`intro.mp4`, `title-0.png`); other scenes use project/scene-qualified names such as `showcase-signal.mp4` and `showcase-signal-carrier-0.png`. Render/hash destinations inside the selected project, including directory symlink aliases, are refused to protect source assets. All commands accept `--help`.

On each seek, the shot sees `Date.now() = 1700000000000 + ctx.seconds * 1000`, `performance.now()` and `requestAnimationFrame` timestamps equal to `ctx.seconds * 1000`, and a seeded `Math.random()` sharing the `ctx.random()` sequence. Progress is first frame 0, last frame 1, or 1 for a single-frame shot. Seeks serialize: if a newer frame arrives during an earlier seek, only the newest frame is acknowledged. Before `rendered`, the runtime flushes layout, waits for `document.fonts.ready`, decodes all `<img>` elements, waits two native animation frames, and rechecks font readiness. The four demo shots use bundled IBM Plex Serif, IBM Plex Sans, and JetBrains Mono WOFF2 files under `projects/demo/assets/fonts/`, with the corresponding `*-OFL.txt` licenses. The `commit` shot drives its block-cursor blink from `ctx.frame`; the previous CSS blink produced a one-pixel edge difference at frame 30 between renders. `setInterval` and `setTimeout` are not controlled; timer-driven state and live video are not deterministic. `bun run validate` checks the manifest and prints shot duration in frames and seconds. It warns (without failing) for `setInterval`, `requestAnimationFrame`, `fetch(`, remote URLs (excluding SVG namespace declarations), `Math.random` in shot HTML, and undeclared first-choice font families in shot HTML or linked local CSS. This conservative text scan is not a parser: single rAF callbacks can warn, and scripts in other files or indirect calls can escape it.

`bun run hash` is a selected-scene regression diagnostic. The default demo retains its twelve historical keys: title 0/30/59, diagram 0/30/70, close 0/59, commit 0/30/75/119. Other scenes capture each shot at frame 0, `floor(durationFrames / 2)` and its last frame, deduplicated for short shots. Use `--project`, `--scene` and optional `--output <report.json>`; multi-scene projects require `--scene`. Defaults are `output/hashes.json` for demo intro and `output/hashes-<project>-<scene>.json` otherwise.

Reports include project/scene IDs, a SHA-256 source-tree snapshot, video settings, PNG hashes and Bun, Remotion, Chromium, OS and matching `fc-list` installed-font family/path records (`null` when unavailable). The selected project is checked again before atomically replacing the report; errors preserve a previous report. Hashing is not editorial approval. Historical ADR 0001 PNG hashes predate bundled fonts and are not silently rebased. Temporary bundles and PNG directories are removed on normal success/failure; forced termination can leave process-owned temporary directories. To check a second Linux x64 machine (for example, a Dokploy VPS):

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
node_modules/@remotion/compositor-linux-x64-gnu/ffprobe -v error -count_frames -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_read_frames -of json output/intro.mp4
```

The licensing and weight trade-off is recorded in [ADR 0001](adr/0001-renderer.md). The demo exports H.264/yuv420p video with AAC audio; shot-only exports include only that shot's audio, so `title` has no audio stream. Browser assets and generated videos are not committed.
