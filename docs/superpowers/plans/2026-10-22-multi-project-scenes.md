# Phase 3.5 Multi-Project and Multi-Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select validated local projects and scenes consistently in Studio, stills, MP4, review and validation while preserving demo behavior and security.

**Architecture:** One canonical manifest loader and selection helper feed each command and the Studio registry. Remotion uses validated scene data as input props with dynamic metadata; Studio serves only registry-authorized assets in project-ID namespaces. Review artifacts remain immutable and tied to the selected project's source digest and scene.

**Tech Stack:** Bun, TypeScript, React, Remotion 4.0.537, Playwright-core, bundled ffmpeg/ffprobe.

## Global Constraints

- Keep `projects/demo` working without migration, with `intro` as the no-argument selection.
- Studio discovery is restricted to direct projects under the repository's `projects/`; `--project` may authorize one external canonical root.
- Browser URL parameters are validated project/scene IDs, never filesystem paths. Studio binds to `127.0.0.1` by default.
- Resolve all referenced paths canonically and reject traversal and symlink escapes. Isolate invalid discovered projects.
- Preserve `window.framecraft.shot` and deterministic frame seeking, local assets, scene/shot audio, atomic render replacement and review approval semantics.
- No database, new framework, project-management subsystem or unrelated UI redesign. Do not modify `.taste-skill/` or other unrelated untracked files.
- Review fixture frames visually; a successful capture is not an editorial decision.

---

## File map

`src/spike/project.ts` validates manifests and selects scenes. `src/spike/registry.ts` discovers and authorizes Studio roots. `src/spike/index.tsx` registers generic Remotion compositions. `scripts/spike.ts`, `scripts/validate.ts`, `scripts/review.ts`, `scripts/studio.ts` implement CLI/server integration. `src/studio/Studio.tsx` manages project/scene routing and Player reset. `src/review/artifacts.ts` verifies the selected scene. `projects/<fixture>/` proves authoring portability. Existing `tests/*.test.ts` receive focused regressions; the user-facing docs and six `skills/framecraft-*/SKILL.md` files lose demo-only directions. Do not modify `projects/demo/runtime.js` or existing demo assets.

### Task 1: Canonical loader and selectors

**Files:** Modify `src/spike/project.ts`; create `src/spike/selection.ts`; modify `tests/project.test.ts`; create `tests/selection.test.ts`.

**Interfaces:** `loadStudioProject(root: string): Promise<StudioProject>` remains. `selectScene(project: StudioProject, sceneId?: string): Scene` returns the unique scene or throws, and `projectRoot(value?: string): Promise<string>` canonicalizes the explicit path or default demo root. `loadProject(root)` remains a single-scene compatibility API.

- [ ] **Step 1: Write failing tests.** Extend the two-scene fixture in `tests/project.test.ts`, and add `tests/selection.test.ts` with these assertions:

```ts
import {expect, test} from 'bun:test';
import {resolve} from 'node:path';
import {loadStudioProject} from '../src/spike/project';
import {projectRoot, selectScene} from '../src/spike/selection';

test('demo defaults to intro and rejects malformed selectors', async () => {
  const project = await loadStudioProject(await projectRoot());
  expect(selectScene(project).id).toBe('intro');
  expect(() => selectScene(project, '../intro')).toThrow();
  expect(() => selectScene(project, 'missing')).toThrow();
  expect(await projectRoot('projects/demo')).toBe(resolve('projects/demo'));
});
```

Add a second scene with an identically named shot and assert `selectScene(project)` rejects ambiguity but each explicit ID succeeds. Extend existing path and symlink tests to cover project references and their canonical targets.

- [ ] **Step 2: Run `bun test tests/project.test.ts tests/selection.test.ts`.** Expected: FAIL because `src/spike/selection.ts` does not exist.
- [ ] **Step 3: Implement the two exported selection functions and keep manifest validation centralized.** Use `realpath(resolve(value ?? join(import.meta.dir, '../../projects/demo')))` for roots; reject invalid/missing scene IDs and ambiguous omitted selections. Keep `loadProject`'s legacy single-scene error and existing path checks. Reuse `loadStudioProject` in all new consumers.
- [ ] **Step 4: Run `bun test tests/project.test.ts tests/selection.test.ts` and `bun run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit `src/spike/project.ts src/spike/selection.ts tests/project.test.ts tests/selection.test.ts` with `feat: centralize project scene selection`.**

### Task 2: Remotion metadata and export CLI

**Files:** Modify `src/spike/index.tsx`, `scripts/spike.ts`, `tests/render.test.ts`, `tests/audio-export.test.ts`.

**Interfaces:** Two registered compositions, `scene` and `shot`, accept validated JSON props `{scene: Scene; video: StudioProject['video']; shotId?: string}`. Every `selectComposition`, `renderStill` and `renderMedia` receives identical `inputProps`; scene selection happens before bundling.

- [ ] **Step 1: Write failing tests.** Update `tests/render.test.ts` to call `selectComposition({serveUrl, id: 'scene', inputProps: {scene: projectScene, video: project.video}})` and `id: 'shot'` with `shotId: 'diagram'`; assert 330 and 90 frames. Add the second scene with a reused shot ID to an isolated test and assert metadata matches that scene, not `intro`. In `tests/audio-export.test.ts`, preserve the existing overlapping cue assertions.
- [ ] **Step 2: Run `bun test tests/render.test.ts tests/audio-export.test.ts`.** Expected: FAIL for unregistered `scene` / `shot`.
- [ ] **Step 3: Register the two generic compositions with `calculateMetadata={({props}) => ({durationInFrames: props.shotId ? props.scene.shots.find(s => s.id === props.shotId)!.durationFrames : props.scene.durationFrames, ...props.video})}` and a typed default demo scene loaded through validated input at CLI selection time. The scene composition receives all selected shots and scene audio; the shot composition receives the selected shot with `startFrame: 0` and its own audio. Keep the existing iframe component unchanged.**
- [ ] **Step 4: Parse `--project` and `--scene` in `scripts/spike.ts`; call `projectRoot`, `loadStudioProject`, `selectScene` before creating the bundle directory, resolve `--shot` against that scene, and pass one `inputProps` object into both selection and rendering. Use the canonical selected root as `publicDir`; keep frame/destination checks and `atomicOutput`. Preserve `intro`-based default output names for the demo; include the selected project/scene in new default filenames to avoid collisions.**
- [ ] **Step 5: Run `bun test tests/render.test.ts tests/audio-export.test.ts`, `bun run snap --frame 0`, `bun run typecheck`.** Expected: PASS and a valid demo still.
- [ ] **Step 6: Commit the four files with `feat: render selected project scenes and shots`.**

### Task 3: Validate and review selected scenes

**Files:** Modify `scripts/validate.ts`, `scripts/review.ts`, `src/review/artifacts.ts`, `tests/validate.test.ts`, `tests/review-artifacts.test.ts`, `tests/review-capture.test.ts`.

**Interfaces:** Validation scans every shot of every scene, with `--scene` verifying a valid selection but not hiding other invalid scenes. `verifyReview(manifestPath: string, projectRoot: string, options?: {checkSummary?: boolean; sceneId?: string}): Promise<void>` verifies manifest and selected scene against the validated root. Capture/check/summary share `--project`/`--scene` parsing.

- [ ] **Step 1: Add failing tests.** In `tests/validate.test.ts`, run `bun scripts/validate.ts --project <multi-scene-root> --scene second` with an invalid first-scene shot and expect a nonzero exit. In `tests/review-artifacts.test.ts`, use a multi-scene project and a manifest for its second scene; assert mismatched `--scene` and changed source digest reject. In `tests/review-capture.test.ts`, assert output beneath the selected external project via symlink is rejected.
- [ ] **Step 2: Run `bun test tests/validate.test.ts tests/review-artifacts.test.ts tests/review-capture.test.ts`.** Expected: new assertions FAIL.
- [ ] **Step 3: Reuse `projectRoot`/`selectScene` and scan `project.scenes.flatMap(scene => scene.shots)` in validation, preserving the positional-root alias but rejecting conflicting roots. For review, select a scene before capture and validate the selected root via `bun run validate --project <root> --scene <id>`; bind its SHA-256 and ID to the manifest. In verification, locate the manifest's scene in the validated project, ensure the optional CLI scene matches, and apply that scene's frame policy. Resolve output ancestors canonically and reject paths inside the selected project. Pass identical `inputProps` to the Remotion shot composition and still renderer.**
- [ ] **Step 4: Run `bun test tests/validate.test.ts tests/review-artifacts.test.ts tests/review-capture.test.ts` and `bun run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit the six files with `feat: review and validate selected scenes`.**

### Task 4: Authorized Studio registry and asset serving

**Files:** Create `src/spike/registry.ts`, `tests/registry.test.ts`; modify `scripts/studio.ts`, `tests/studio.test.ts`.

**Interfaces:** `discoverProjects(directory: string, explicitRoot?: string)` returns validated ID-to-`{root, project}` entries and warnings. Studio exposes `/api/projects` (safe ID/title/scene summary) and `/api/project?id=<id>` (validated project), and serves `/public/<id>/<relative-asset>` only from that ID's canonical root. Keep `/api/project` and legacy demo static URLs valid for the no-argument demo invocation.

- [ ] **Step 1: Write failing tests.** Create a temporary `projects/` tree with two valid entries, an invalid manifest, a symlink outside, and a duplicate ID. Assert valid entries survive invalid neighbors; duplicate IDs cannot be resolved; an external project is present only with an explicit CLI root. Extend `tests/studio.test.ts` to request an unauthorized project ID, `..%2f` traversal, and a symlinked asset outside an authorized root, expecting non-200 responses.
- [ ] **Step 2: Run `bun test tests/registry.test.ts tests/studio.test.ts`.** Expected: FAIL for missing registry and endpoints.
- [ ] **Step 3: Implement discovery with `readdir({withFileTypes: true})`, `realpath` and containment checks against the canonical repository `projects/` directory. Validate children independently; omit invalid entries and report their names/reasons. Reject collisions rather than choosing an arbitrary project. Add the explicitly selected external root only after validation.**
- [ ] **Step 4: Keep server bind at `127.0.0.1`; resolve API IDs from the registry only, reject malformed/duplicate values; decode request paths once, deny traversal and symlink escapes using `realpath` containment and file type checks. Namespace project assets by ID and rewrite validated scene shot entries/audio sources in API data to `/<id>/<project-relative-path>` so `staticFile()` loads `/public/<id>/...`; keep the original data unchanged for CLI and digest. Keep the existing demo legacy `/public/scenes/...` route.**
- [ ] **Step 5: Run `bun test tests/registry.test.ts tests/studio.test.ts`, `bun run typecheck`.** Expected: PASS.
- [ ] **Step 6: Commit registry, server and tests with `feat: authorize Studio projects and assets`.**

### Task 5: Studio project navigation and browser behavior

**Files:** Modify `src/studio/Studio.tsx`, `src/studio/studio.css` only if responsive selectors require it; modify `tests/studio-browser.test.ts`.

**Interfaces:** `?project=<validated-id>&scene=<validated-id>` identifies a preview; demo `?clip=intro` remains valid. A project picker changes authorized project; a scene picker changes a validated scene. Changes reset Player, pending acknowledgement, clock, error and playback.

- [ ] **Step 1: Add failing Playwright tests.** Start Studio with two valid repository fixtures and assert a deep link opens the selected scene, switching projects changes the loaded shot HTML and audio metadata, back/forward restores selection, invalid project/scene IDs show actionable errors, and rapid middle → first → middle seeks report the correct `data-frame` and preview pixels. Assert no horizontal overflow at 390px and no browser console errors at 390px and 1440px.
- [ ] **Step 2: Run `bun test tests/studio-browser.test.ts`.** Expected: FAIL because project selection and namespaced URLs do not exist.
- [ ] **Step 3: Load registry summaries and fetch the selected project by validated ID. Store project ID separately from scene ID; parse `project`, `scene` and legacy `clip` URL parameters without accepting path values; reset all frame/acknowledgement state and key `<Player>` by `${project.id}/${scene.id}`. Handle `popstate`, loading, missing project/scene, empty projects, errors and retry. Add a native labeled project select next to the existing scene select; retain dark theme, IBM Plex Sans, timecode font, keyboard transport and focus behavior.**
- [ ] **Step 4: Run `bun test tests/studio-browser.test.ts`, `bun run typecheck`; inspect desktop and phone screenshots and click project, scene, shots, transport, range, back/forward and retry controls.** Expected: PASS with no stale iframe or horizontal overflow.
- [ ] **Step 5: Commit Studio and browser tests with `feat: navigate authorized Studio projects`.**

### Task 6: Multi-scene authored fixture, docs and acceptance

**Files:** Create `projects/showcase/project.json`, `projects/showcase/scenes/pulse/scene.json`, `projects/showcase/scenes/signal/scene.json`, at least three `projects/showcase/scenes/*/shots/*/index.html`, local `projects/showcase/assets/`, scene and shot `brief.md`; modify `AGENTS.md`, `docs/rendering.md`, `docs/studio.md`, `docs/audio.md`, `docs/agent-workflow.md`, `skills/framecraft-{storyboard,html-shot,motion,visual-review,sound,export}/SKILL.md`; extend tests in `tests/project.test.ts` and `tests/audio-export.test.ts`.

**Interfaces:** The `showcase` fixture uses schemaVersion 1, scene IDs `pulse` and `signal`, at least three total shots, project-local asset references and overlapping scene/shot audio. Its exact shot IDs and durations are established in its manifest and copied into tests and docs.

- [ ] **Step 1: Author two small distinct scenes and briefs, at least three seekable shots, a local WOFF2/image or drawn SVG and short local WAV cues. Ensure every HTML shot calls `window.framecraft.shot` exactly once and uses only frame-derived visual state; use the same relative runtime/font convention as the demo.**
- [ ] **Step 2: Add a failing fixture regression test that loads both scenes, checks independent shot start offsets and overlapping cue frames, and rejects omitted `--scene` on export. Run `bun test tests/project.test.ts tests/audio-export.test.ts`; expected: FAIL until fixture and commands agree.**
- [ ] **Step 3: Update the current docs and portable skills to use selected-project examples (`--project projects/showcase --scene pulse`) while retaining short demo commands; document registry authorization, deep links, validation limitations, review's named decision and MP4/audio checks. Do not rewrite historical `docs/superpowers` records.**
- [ ] **Step 4: Run `bun test`, `bun run typecheck`, `bun run validate` and `bun run validate --project projects/showcase --scene pulse`. Inspect retained first, middle and last stills per scene, then middle → first → middle. Run `bun run render` and `bun run render --project projects/showcase --scene pulse`; probe both files with the bundled ffprobe for expected dimensions/fps/frame counts and audible/mixed audio streams. Run Studio in a real browser at desktop and phone sizes with both projects/scenes, inspect screenshots, console and controls. Run review capture/check/summary for the fixture, open captured PNGs and record a named assessment without automatically accepting it.**
- [ ] **Step 5: Commit only Phase 3.5 files with `feat: add multi-scene fixture and document project workflow`. Confirm `git status --short` still reports unrelated `.taste-skill/` unchanged; report commit SHA, tests, browser evidence and limitations.**

## Self-review and execution notes

The six tasks cover loader and IDs, Remotion, CLI, review integrity, Studio registry and UI, fixture, docs and verification. The fixture ID and scene IDs are fixed as `showcase`, `pulse` and `signal`; shot IDs and exact durations are defined by its authored manifests. No step calls for a new dependency or browser-path API. Before each commit, inspect `git diff --check` and do not stage unrelated files. Capture starts `unreviewed`; only a named reviewer who has opened images can record another decision.
