# Portable Demo Rendering Implementation Plan

> **For agentic workers:** Execute inline in red/green slices. Tests observe iframe messages, still pixels, and CLI outputs, not private helpers.

**Goal:** Make the four-shot demo's font and temporary-directory inputs portable, widen the machine hash report, and preserve the exact 330-frame export.

**Architecture:** Bundle licensed fonts and link one local stylesheet from each independent shot. The iframe runtime waits for font/layout settlement and serializes seeks. CLIs scan source conservatively and own/clean their bundle directories.

**Tech Stack:** Bun, existing Remotion/Playwright dependencies, node:fs/os/path, local WOFF2/OFL assets.

## Global Constraints

- No new runtime dependencies; leave `src/spike/shot.tsx` and `src/spike/index.tsx` alone unless a failing test proves a change necessary.
- Four shots, 330 frames, 1920×1080 at 30 fps; no system font first choice; flat colors/no new effects.
- Preserve untracked `framecraft.zip`; cross-machine identity must not be claimed without running a second machine.
- One failing test, minimal implementation, green test, and small commit per behavior.

### Task 1: Test isolation and bundle ownership

**Files:** `tests/project.test.ts`, `tests/validate.test.ts`, `tests/render.test.ts`, `scripts/spike.ts`, `scripts/hash.ts`, `tests/hash.test.ts`.

- [ ] Replace fixture roots with `mkdtemp(join(tmpdir(), 'framecraft-test-'))` and `mkdtemp(join(tmpdir(), 'framecraft-validate-'))`; rerun the two test files.
- [ ] Add a cleanup command test: snapshot `readdir(tmpdir())` entries beginning `remotion-webpack-bundle-` or `framecraft-bundle-`, run a valid snap then a post-bundle failure (`CHROME_BIN` set to an invalid path), and assert no new entries after either run. Assert the failed run preserves the previous snap. Run it red.
- [ ] Use a uniquely named `outDir` under `tmpdir()` for each `bundle()` call; wrap bundling and everything after it in `try/finally { await rm(bundleDir, {recursive:true, force:true}); }`. Apply twice in the Player test. Run cleanup test and full suite green, commit.

### Task 2: Bundled fonts and first-frame readiness

**Files:** `projects/demo/assets/fonts/{fonts.css,*.woff2,*-OFL.txt}`, four shot HTML files, `projects/demo/runtime.js`, `tests/fixtures/late-font.html`, `tests/spike.test.ts`.

- [ ] Vendor official OFL WOFF2 binaries and their license texts for IBM Plex Serif, IBM Plex Sans and JetBrains Mono; verify names/weights and licenses from source. Link `../../../../assets/fonts/fonts.css` in each shot and change first-choice families only (Georgia→IBM Plex Serif, Arial→IBM Plex Sans, ui-monospace→JetBrains Mono).
- [ ] Add a real-font fixture whose `renderFrame` inserts previously unused text into the local font. Delay the actual font response through the browser test server. Assert no `rendered` before the font arrives; after release, assert the first screenshot equals a subsequent same-frame screenshot and `document.fonts.check(...)`/the face's status show loaded. Keep the existing mocked settling test. Run new test red.
- [ ] After `renderFrame`, read `document.body.offsetHeight`; await `document.fonts.ready`, image decodes, two native rAF callbacks, and if status is not `loaded` await `document.fonts.ready` again before acknowledging. Run browser tests green and commit with font license files.

### Task 3: Font and external-URL validation

**Files:** `scripts/validate.ts`, `tests/validate.test.ts`.

- [ ] Add fixture HTML/CSS for an undeclared first font, declared local face, generic first family, harmless `xmlns="http://www.w3.org/2000/svg"`, and actual remote `<img src="https://example.org/image.png">`. Assert only the undeclared font/remote src warn; demo validation stays clean. Run red.
- [ ] Read local linked CSS relative to shot HTML and inline `<style>`; collect `@font-face` family names; compare first families of ordinary `font-family` declarations against them and generic families; warn nonfatally. For URL scan, remove `xmlns` attribute values before matching `https?://`. Run green and commit.

### Task 4: Last seek wins

**Files:** `projects/demo/runtime.js`, `tests/spike.test.ts`, `tests/fixtures/overlap.html`.

- [ ] In a browser fixture hold a real image/font or rAF step after a seek, post two seeks without awaiting the first, release the hold, and assert that only the latest `rendered` frame is received and the final DOM reflects it. Run red.
- [ ] Serialize the existing seek pipeline with a latest-generation check after awaited stages and before `rendered`/`error`; coalesce pending work to the latest request. Run overlap and all browser tests green; commit.

### Task 5: Hashes, guidance, and final evidence

**Files:** `scripts/hash.ts`, `tests/hash.test.ts`, `AGENTS.md`, `docs/rendering.md`, `docs/adr/0001-renderer.md`.

- [ ] Extend the hash CLI test's exact keys to `title:0,30,59`, `diagram:0,30,70`, `close:0,59`, `commit:0,30,75,119`, and require `environment.fonts` to be an array of fc-list records or `null`; run red.
- [ ] Add the six frames, capture `fc-list -f '%{family}|%{file}\n'` for requested families when available and `null` otherwise; keep atomic write. Run green. Run `bun run hash` again and compare the entire JSON with the previous local run. Commit mentioning intentional font-driven PNG hash changes.
- [ ] Add the relative-path skeleton and authoring rules from `docs/adr/0001-addendum-authoring-test.md` to `AGENTS.md`; update the rendering guide with exact Linux VPS install/compare commands and first-difference PNG inspection; update ADR Consequences to distinguish local evidence from unverified cross-machine identity. Commit docs.
- [ ] Run `bun test`, `bun run validate`, `bun run hash` twice, `bun run render`, and `node_modules/@remotion/compositor-linux-x64-gnu/ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_read_frames -of json output/intro.mp4`. Check no bundle directories created by these runs remain, `git status --short` shows only pre-existing user work, and report unresolved cross-machine comparison.
