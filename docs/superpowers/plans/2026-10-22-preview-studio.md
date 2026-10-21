# Preview Studio Implementation Plan

> **For agentic workers:** Execute inline, one red/green slice at a time. Tests observe the validated project API and the local Studio URL, not private React state. Commit each independently testable slice.

**Goal:** Deliver a local browser Preview Studio for Framecraft's existing HTML shots and scene manifests, without changing Remotion export behavior.

**Architecture:** Extend the validated loader for a scene list while retaining the legacy one-scene entry point. Share a Remotion scene composition between export and `@remotion/player`, serve a read-only manifest and bundled local assets via Bun, and drive Studio controls from the Player's own frame clock and shot acknowledgement.

**Tech Stack:** Bun 1.4.3, React 19.3.1, Remotion/Player 4.0.537, Playwright-core 1.64.1, plain CSS, optional development-only TypeScript + Bun typings for checking.

## Global constraints

- Demo stays `intro`: four shots of 60, 90, 60, 120 frames, total **330 at 1920×1080/30**, zero overlap. Keep current project JSON schema and single-scene export guard.
- `src/spike/shot.tsx` and `projects/demo/runtime.js` remain the deterministic seek/ack bridge; do not add a second animation scheduler or replace Remotion.
- No backend/database beyond a local-only read-only Bun static/manifest server. No UI kit, new runtime dependencies, audio, transitions, video, drag-and-drop, or fake content.
- App direction: `data-terminal` seed 2088916148, adapted because a graph-node palette is not a video preview. Dark neutral stage; narrow blue line indicates selected scene/shot; IBM Plex Sans for text and existing JetBrains Mono for timecodes. ENERGY 1 / RHYTHM 2 / MOTION 1.
- Leave pre-existing untracked `framecraft.zip` alone. Antislop project setup in `AGENTS.md`, `antislop.md` and `skills/` was authorized; include it in a separate commit.

## File ownership and test seams

- `src/spike/project.ts`, `tests/project.test.ts`: loader seam; add `loadStudioProject(root)` returning `{id,title,video,scenes:[{id,title,shots,durationFrames}]}`. Keep `loadProject(root): Project` unchanged for CLI callers.
- `src/spike/composition.tsx`, `src/spike/index.tsx`, `tests/render.test.ts`: shared scene composition, unchanged render output.
- `scripts/studio.ts`, `src/studio/main.tsx`, `src/studio/Studio.tsx`, `src/studio/studio.css`, `src/studio/frame.ts`, `tests/studio.test.ts`: Bun URL/API and real browser interaction seams. No test should reach into React internal state.
- `package.json`, `bun.lock`, `tsconfig.json`, `docs/studio.md`, `docs/rendering.md`: command, type check, usage, and verification. `docs/screenshots/` holds requested representative screenshots.

### Task 1: Validated multi-scene read model

**Interfaces:** `loadStudioProject(root: string): Promise<StudioProject>` returns project `id`, `title`, validated `video`, and `scenes: Scene[]`; `Scene` carries `id`, `title`, `shots: Shot[]`, `durationFrames`. `loadProject(root: string): Promise<Project>` still rejects zero or multiple scenes with its existing explicit error.

- [ ] Add a failing test to `tests/project.test.ts` using its existing `fixture()` helper: append a `second` scene reference with a distinct `scenes/second/scene.json` and valid HTML, persist both; assert `loadStudioProject(root)` reports two scene IDs, offsets and duration and `loadProject(root)` rejects multi-scene. Add checks for duplicate scene IDs and zero-scene Studio read model.

  ```ts
  const second = {id: 'second', path: 'scenes/second/scene.json'};
  data.project.scenes.push(second);
  await mkdir(join(data.root, 'scenes/second/shots'), {recursive: true});
  await writeFile(join(data.root, 'scenes/second/shots/next.html'), '<!doctype html>');
  await writeFile(join(data.root, second.path), JSON.stringify({id:'second', title:'Second', shots:[{id:'next',entry:'shots/next.html',durationFrames:30,overlapFrames:0}], audio:[]}));
  await data.save();
  expect((await loadStudioProject(data.root)).scenes.map(s => [s.id,s.durationFrames])).toEqual([['intro',210],['second',30]]);
  expect(loadProject(data.root)).rejects.toThrow('exactly one scene');
  ```

- [ ] `bun test tests/project.test.ts` must fail because `loadStudioProject` does not exist. Factor the current validation body once: parse project-level metadata, iterate scene refs with duplicate-ID check, reuse existing validated shot path/duration loop for each scene. Allow `scenes: []` only in `loadStudioProject`; keep empty-shot scene invalid and legacy `loadProject` single-scene guard. Project/scene `title` falls back to validated ID when absent. Run targeted tests green and commit.

### Task 2: One Remotion scene composition

**Interfaces:** `SceneComposition({shots,video}: {shots: Shot[]; video: Project['video']})` creates `<Sequence from={shot.startFrame} durationInFrames={shot.durationFrames}><ShotView id={shot.id} entry={shot.entry} durationFrames={shot.durationFrames} {...video}/></Sequence>` for each shot. CLI compositions `intro/title/diagram/close/commit` remain registered unchanged.

- [ ] First add a focused assertion to `tests/render.test.ts` using its existing bundle/Player browser that composition `intro` lasts 330 frames, and stills at first frames 0/60/150/210 are visibly different after acknowledged renders. Existing 70→10→70 screenshot equality must remain. Observe red for a new expectation that is not yet met only if it tests a real change; the existing test is the regression gate for a pure extraction.
- [ ] Extract the shot-map JSX from `src/spike/index.tsx` into `src/spike/composition.tsx`. Replace `Intro` with a wrapper invoking `SceneComposition` and retain its static composition IDs/dimensions. `src/studio/Studio.tsx` will later mount this same component in `<Player>` with validated scene `shots` and `video`. Run `bun test tests/render.test.ts` and `bun run snap --shot diagram --frame 70`, then commit.

  ```tsx
  export function SceneComposition({shots,video}: {shots: Shot[];video: Project['video']}) {
    return <>{shots.map(shot => <Sequence key={shot.id} from={shot.startFrame} durationInFrames={shot.durationFrames}>
      <ShotView id={shot.id} entry={shot.entry} durationFrames={shot.durationFrames} {...video} />
    </Sequence>)}</>;
  }
  ```

### Task 3: Local-only Studio server and public data seam

**Interfaces:** `bun run studio` serves `/` and static assets on `127.0.0.1`, plus `GET /api/project` returning `StudioProject`; HTTP 500 JSON `{error:string}` on invalid project, HTTP 404 on unknown paths. `PORT=0` may be used in tests; print the assigned URL. No browser-provided path is read from disk.

- [ ] Write `tests/studio.test.ts` that spawns `bun scripts/studio.ts` with `PORT=0` and an isolated `TMPDIR`, reads printed URL, fetches `/api/project` expecting `demo`, `intro`, 330, verifies `/index.html` and local shot HTML are served, traversal returns 403/404, unknown file 404, then kills subprocess and checks only its temp bundle dirs are gone. Test red before server exists.
- [ ] Add `scripts/studio.ts`: own `mkdtemp(join(tmpdir(),'framecraft-studio-'))`; bundle `{entryPoint: src/studio/main.tsx,publicDir: projects/demo,ignoreRegisterRootWarning:true,outDir: bundleDir}`; `Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT ?? 3000),fetch})`; request `/api/project` calls `loadStudioProject(root)`; all other requests resolve inside bundle path and use `Bun.file` only after checking relative path stays inside, file exists, and no symlink escape. `SIGINT`/`SIGTERM` stop server then `rm(bundleDir,{recursive:true,force:true})`; startup failure removes bundle too. Add `studio` script and initial React entry mounting an explicit `Loading project…` label so the bundle compiles. Run server test green, commit.

### Task 4: Studio navigation, frame mapping and preview state

**Interfaces:** `formatTime(frame,fps): string` returns `mm:ss:ff` (total duration may be `mm:ss:00`); `activeShot(shots,frame): Shot | undefined` resolves `[startFrame,startFrame+durationFrames)`; `?clip=<id>` is the sole scene route. Studio uses Player `frameupdate`, `play`, `pause`, `ended`, `error`, plus same-origin current-iframe `ready/rendered/error` messages. Only an acknowledgement of the current shot-local requested frame makes preview ready.

- [ ] Write `tests/frame.test.ts` with literal worked cases: `formatTime(0,30) === '00:00:00'`, `formatTime(61,30) === '00:02:01'`, `formatTime(330,30) === '00:11:00'`, active shot at 59/60/149/150/209/210/329 and no shot at 330. Run red, implement the two small pure functions in `src/studio/frame.ts`, green, commit.
- [ ] Add browser tests in `tests/studio.test.ts` for `/?clip=intro` and no query, invalid clip with recovery select, reload retaining selection, frame range at 59→60 and 209→210, shot click seeking first frame, rapid repeated seeks, play/pause, end stop, missing iframe asset/error, and scene-switch cleanup using a Playwright route to supply a two-scene manifest based on real demo assets. The test should compare acknowledged screenshot pixels at frame 70 after 70→10→70, not just the counter. Exercise each control by role/label; assert loading/error/empty text from stubbed API responses. First run red against the loading-only Studio.
- [ ] Implement `src/studio/Studio.tsx`: fetch validated manifest once with retry; parse `?clip=` against its scene IDs, handle `popstate`; key the Player subtree on scene ID so old iframe/listeners unmount. Use only Player ref methods (`seekTo`, `play`, `pause`, `isPlaying`, `getCurrentFrame`) and events; no custom playback timers. On manual seek, mark preview pending before `seekTo`; on Player frame updates update requested frame; mark ready only on versioned same-origin `rendered` from the currently mounted iframe when local frame matches `requested - shot.startFrame`. Drop old errors/acks after scene change; present loading, invalid route, missing asset and runtime errors with retry. Bind controls to frame range 0..duration-1 and clamp steps. Scene dropdown changes `history.pushState` URL; new scene begins frame 0, paused. Run browser tests green, then commit.

### Task 5: Interface craft, type check, documentation and evidence

**Interfaces:** Studio CSS only changes presentation; no new functionality. User-facing controls and semantics remain testable by accessible role/name. Local license-bearing fonts already exist in `projects/demo/assets/fonts/`.

- [ ] Add `src/studio/studio.css` for a compact dark stage, timecode-led header, ordered shot rows, duration-proportional timeline, and 16:9 responsive preview. At widths 1440, 768 and 390, stack shot list below preview when it stops fitting beside it; avoid horizontal overflow; 44px tap targets and visible `:focus-visible`. Verify text with `skills/antislop-human/contrast-check.py`. No logo/icon/photograph is fabricated; existing output in the Player is the sole artwork.
- [ ] Add `tsconfig.json` and `bun run typecheck`. Only if needed for a real local check, install `typescript` and `@types/bun` as explicit devDependencies (justification: check Studio and Bun server types, no runtime weight); use `jsx: react-jsx`, `moduleResolution: bundler`, `resolveJsonModule: true`, and include touched TS/TSX files. Run `bun run typecheck` and fix genuine errors, then `bun test` and `bun run validate`.
- [ ] Run `bun run studio` in a real browser using agent-browser; click each control, inspect console and frames for all four shots, capture and inspect representative screenshots at 1440, 768, 390 (and reduced-motion/keyboard). Use design-taste app `lint.mjs --app` and `inspect.mjs --app` on final Studio, fix every FAIL, critique screenshots and rerun. Save requested final screenshots to `docs/screenshots/studio-desktop.png`, `studio-tablet.png`, `studio-phone.png`; do not commit transient `.taste-skill/inspect` artifacts.
- [ ] Add `docs/studio.md` with local startup, `?clip` scene URL, controls, multi-scene read-only vs single-scene export limit, font/asset/runtime errors, responsive behavior, and limits. Link it from `docs/rendering.md`; note any inspector allowance and why. Commit UI/docs/screenshots and the separately approved antislop setup.
- [ ] Full verification: `bun test`, `bun run typecheck`, app lint/inspect, `bun run validate`, `bun run render`, and `node_modules/@remotion/compositor-linux-x64-gnu/ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_read_frames -of json output/intro.mp4`; expect 330, 1920, 1080, 30/1. If a pre-change comparable MP4 hash was not retained, record byte identity as unverified rather than claiming it. Check for owned bundle leaks and `git status --short`; never delete `framecraft.zip`.

## Self-review

- Every spec deliverable maps to a task: validated scenes, route, preview/control readiness, errors/empty/loading, browser tests, screenshot evidence, docs and export check.
- No Studio code changes the shot runtime, Remotion `ShotView` bridge or schema. The one shared-composition extraction is guarded by existing rendering tests.
- User-facing empty state applies to zero scene references; invalid empty-shot scenes are validation errors. The title comes from manifests; the accent selection mark and tabular timecodes are the product-specific visual choices.
