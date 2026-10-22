# Agent Visual Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give any repository-aware agent a reproducible capture, inspection and verification workflow for the existing demo without automating subjective approval.

**Architecture:** A pure selector derives a modest set of scene/shot frames from the validated loader. A review command reuses Remotion's existing still-rendering path to retain PNGs and a versioned manifest; a separate read-only check verifies source, frames, files, hashes and summary. Repository Markdown guides and an actual inspected demo review complete the workflow.

**Tech Stack:** Bun/TypeScript, Remotion 4.0.537, Node crypto/filesystem, existing HTML shot runtime and Studio, Bun tests. No new package or service.

## Global Constraints

- `AGENTS.md` remains the canonical entry point; all guides are ordinary Markdown usable by any coding agent without provider-specific installation or MCP.
- Preserve the existing project/scene/shot format, HTML shot API, Studio, `snap`, fixed-frame `hash`, render defaults and audio behavior. The current renderer statically registers only the demo intro scene; do not advertise arbitrary-project export.
- Never claim visual quality from a hash, passing validation or a generated summary. A named reviewer must open the PNGs and write findings/notes before marking `accepted`.
- Do not fetch assets or add cloud AI, database, heavy dependency, narration generation, renderer replacement or transition implementation. Narration is opt-in via supplied local media.
- Keep generated captures outside `projects/demo/`; reject existing output directories and never overwrite prior reviews or source. Preserve existing user files `.taste-skill/` and `framecraft.zip`.
- A forced process kill can leave temporary files. Do not claim pixel identity across machines or a human listening check unless performed.

## File map

- `src/review/frames.ts`: pure selection policy, milestone parsing and stable filenames.
- `src/review/artifacts.ts`: project digest, manifest types, summary text and read-only verification; no screenshot rendering.
- `src/review/capture.ts`: atomic per-frame PNG publication with an injected still function for failure tests.
- `scripts/review.ts`: CLI preflight, validation, one bundle/browser, composition checks, capture orchestration, `--check` and `--summary`.
- `package.json`: `review` script only.
- `tests/review-frames.test.ts`, `tests/review-artifacts.test.ts`, `tests/review-capture.test.ts`: unit, corruption/failure and bounded demo integration.
- `projects/demo/scenes/intro/brief.md`: explicitly inferred four-shot intent and reveal milestones.
- `skills/framecraft-{storyboard,html-shot,motion,visual-review,sound,export}/SKILL.md`: six short, local workflow guides.
- `AGENTS.md`, `docs/agent-workflow.md`, `docs/phase3-report.md`, `docs/reviews/demo-intro/`: discovery, ten-step workflow, actual verification and inspected artifacts.

---

### Task 1: Pure review frame selection

**Files:** Create `src/review/frames.ts`, `tests/review-frames.test.ts`.

**Interfaces:** Consume `Pick<Shot, 'id' | 'startFrame' | 'durationFrames'>[]` from `src/spike/project.ts`; produce `ReviewFrame = {shotId: string; localFrame: number; globalFrame: number; path: string}` and `selectReviewFrames(shots, milestones: string[]): ReviewFrame[]`. `path` is a forward-slash relative path under `screenshots/`.

- [ ] **Step 1: Write failing tests** in `tests/review-frames.test.ts`:

```ts
import {expect, test} from 'bun:test';
import {selectReviewFrames} from '../src/review/frames';

test('one-frame, short and long shots dedupe, sort and cover both sides of cuts', () => {
  const shots = [{id: 'one', startFrame: 0, durationFrames: 1},
    {id: 'short', startFrame: 1, durationFrames: 4},
    {id: 'long', startFrame: 5, durationFrames: 90}];
  const frames = selectReviewFrames(shots, ['long:67', 'short:0', 'long:67']);
  expect(frames.map(item => [item.shotId, item.localFrame, item.globalFrame])).toEqual([
    ['one', 0, 0], ['short', 0, 1], ['short', 1, 2], ['short', 3, 4],
    ['long', 0, 5], ['long', 22, 27], ['long', 44, 49], ['long', 66, 71], ['long', 67, 72], ['long', 89, 94],
  ]);
  expect(frames[4]?.path).toBe('screenshots/long-local-0000-global-0005.png');
  expect(frames.at(-1)?.path).toBe('screenshots/long-local-0089-global-0094.png');
});

test('invalid milestone fails before capture', () => {
  const shots = [{id: 'a', startFrame: 0, durationFrames: 2}];
  for (const milestone of ['missing:0', 'a:-1', 'a:2', 'a:1.2', 'a:1x', 'a:', 'a:0:1']) {
    expect(() => selectReviewFrames(shots, [milestone])).toThrow();
  }
});

test('filenames expand past four digits without truncation', () => {
  expect(selectReviewFrames([{id: 'x', startFrame: 10000, durationFrames: 1}], [])[0]?.path)
    .toBe('screenshots/x-local-0000-global-10000.png');
});
```

- [ ] **Step 2: Run `bun test tests/review-frames.test.ts`.** Expected: FAIL because `src/review/frames.ts` does not exist.
- [ ] **Step 3: Implement** `src/review/frames.ts`:

```ts
import type {Shot} from '../spike/project';

export const SELECTION_POLICY = 'boundaries-midpoints-v1' as const;
type ReviewShot = Pick<Shot, 'id' | 'startFrame' | 'durationFrames'>;
export type ReviewFrame = {shotId: string; localFrame: number; globalFrame: number; path: string};

export function selectReviewFrames(shots: ReviewShot[], milestones: string[]): ReviewFrame[] {
  const byId = new Map(shots.map(shot => [shot.id, shot]));
  const selected = new Map(shots.map(shot => {
    const last = shot.durationFrames - 1;
    if (!Number.isSafeInteger(shot.startFrame) || shot.startFrame < 0 || !Number.isSafeInteger(last) || last < 0 ||
      !Number.isSafeInteger(shot.startFrame + last)) throw new Error(`invalid shot frame range: ${shot.id}`);
    return [shot.id, new Set([0, Math.floor(last / 2), last,
      ...(shot.durationFrames >= 90 ? [Math.floor(last / 4), Math.floor(3 * last / 4)] : [])])] as const;
  }));
  if (byId.size !== shots.length) throw new Error('duplicate shot id');
  for (const value of milestones) {
    const match = /^([a-z0-9][a-z0-9-]*):(0|[1-9]\d*)$/.exec(value);
    if (!match) throw new Error(`invalid milestone: ${value}`);
    const shot = byId.get(match[1]!);
    const localFrame = Number(match[2]);
    if (!shot || !Number.isSafeInteger(localFrame) || localFrame >= shot.durationFrames) throw new Error(`milestone out of range: ${value}`);
    selected.get(shot.id)!.add(localFrame);
  }
  return shots.flatMap(shot => [...selected.get(shot.id)!].map(localFrame => {
    const globalFrame = shot.startFrame + localFrame;
    const pad = (frame: number) => String(frame).padStart(4, '0');
    return {shotId: shot.id, localFrame, globalFrame,
      path: `screenshots/${shot.id}-local-${pad(localFrame)}-global-${pad(globalFrame)}.png`};
  })).sort((a, b) => a.globalFrame - b.globalFrame || a.shotId.localeCompare(b.shotId));
}
```

- [ ] **Step 4: Run `bun test tests/review-frames.test.ts && bun run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit:** `git add src/review/frames.ts tests/review-frames.test.ts && git commit -m "feat: select deterministic visual review frames"`.

### Task 2: Artifacts, read-only check and failure-safe capture seam

**Files:** Create `src/review/artifacts.ts`, `src/review/capture.ts`, `tests/review-artifacts.test.ts`.

**Interfaces:** Consume `ReviewFrame[]` and `loadProject(root)`; export `ReviewManifest`, `sourceDigest(root): Promise<string>`, `summaryText(manifest): string`, `verifyReview(manifestPath: string, projectRoot: string, options?: {checkSummary?: boolean}): Promise<void>`, and `captureFrames(frames: ReviewFrame[], output: string, render: (frame: ReviewFrame, partialPath: string) => Promise<void>): Promise<ReviewCapture[]>`. The manifest contains `schemaVersion: 1`, project/scene IDs, source commit/dirty/digest, policy/milestones, environment/video, validation exit/warnings/errors, captures, and review status/reviewer/findings/notes. `verifyReview` rejects malformed types, mismatched source, frame set, path/hash/PNG, failed capture, invalid acceptance and stale summary; no write.

- [ ] **Step 1: Write failing artifact tests** in `tests/review-artifacts.test.ts`:

```ts
import {afterEach, expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceDigest, summaryText, verifyReview, type ReviewManifest} from '../src/review/artifacts';
import {captureFrames} from '../src/review/capture';
import {selectReviewFrames} from '../src/review/frames';

const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const roots: string[] = [];
afterEach(async () => { for (const path of roots.splice(0)) await rm(path, {recursive: true, force: true}); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-review-source-'));
  const output = await mkdtemp(join(tmpdir(), 'framecraft-review-artifact-'));
  roots.push(root, output);
  await mkdir(join(root, 'scenes/intro/shots'), {recursive: true});
  await mkdir(join(output, 'screenshots'), {recursive: true});
  await writeFile(join(root, 'project.json'), JSON.stringify({schemaVersion: 1, id: 'demo',
    video: {width: 2, height: 2, fps: 30}, scenes: [{id: 'intro', path: 'scenes/intro/scene.json'}], audio: []}));
  await writeFile(join(root, 'scenes/intro/scene.json'), JSON.stringify({id: 'intro', shots: [
    {id: 'only', entry: 'shots/only.html', durationFrames: 1, overlapFrames: 0}], audio: []}));
  await writeFile(join(root, 'scenes/intro/shots/only.html'), '<!doctype html>');
  const frame = selectReviewFrames([{id: 'only', startFrame: 0, durationFrames: 1}], [])[0]!;
  await writeFile(join(output, frame.path), onePixelPng);
  const manifest: ReviewManifest = {schemaVersion: 1, projectId: 'demo', sceneId: 'intro',
    source: {gitCommit: 'a'.repeat(40), trackedDirty: false, untrackedDirty: false, sha256: await sourceDigest(root)},
    selection: {policy: 'boundaries-midpoints-v1', milestones: []},
    environment: {bun: '1.4.3', remotion: '4.0.537', chromium: 'Chrome',
      os: {platform: 'linux', arch: 'x64', release: 'test'}, video: {width: 2, height: 2, fps: 30}, fonts: null},
    validation: {command: 'bun run validate', exitCode: 0, warnings: [], errors: []},
    captures: [{...frame, status: 'captured', sha256: sha(onePixelPng)}],
    review: {status: 'unreviewed', reviewer: null, findings: [], notes: ''}};
  const save = async () => {
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await writeFile(join(output, 'summary.md'), summaryText(manifest));
  };
  await save();
  return {root, output, manifest, frame, save};
}

test('read-only check detects tampering, stale summary and impossible review claims', async () => {
  const data = await fixture();
  const path = join(data.output, 'manifest.json');
  await verifyReview(path, data.root);
  data.manifest.review.notes = 'Inspected one still';
  await writeFile(path, JSON.stringify(data.manifest));
  await expect(verifyReview(path, data.root)).rejects.toThrow('summary');
  await data.save();
  data.manifest.review.status = 'accepted';
  await data.save();
  await expect(verifyReview(path, data.root)).rejects.toThrow('reviewer');
  data.manifest.review.status = 'unreviewed';
  data.manifest.review.notes = '';
  data.manifest.captures[0]!.globalFrame = 1;
  await data.save();
  await expect(verifyReview(path, data.root)).rejects.toThrow('frame');
  data.manifest.captures[0]!.globalFrame = 0;
  data.manifest.captures[0]!.path = '../outside.png';
  await data.save();
  await expect(verifyReview(path, data.root)).rejects.toThrow('path');
  data.manifest.captures[0]!.path = data.frame.path;
  await data.save();
  await writeFile(join(data.output, data.frame.path), Buffer.concat([onePixelPng, Buffer.from('tampered')]));
  await expect(verifyReview(path, data.root)).rejects.toThrow('hash');
  await writeFile(join(data.output, data.frame.path), onePixelPng);
  await rm(join(data.output, data.frame.path));
  await expect(verifyReview(path, data.root)).rejects.toThrow();
});

test('source digest includes project files and link targets, not external bytes', async () => {
  const data = await fixture();
  const first = await sourceDigest(data.root);
  expect(await sourceDigest(data.root)).toBe(first);
  const outside = join(data.output, 'outside.txt');
  await writeFile(outside, 'first');
  await symlink(outside, join(data.root, 'external-link'));
  const linked = await sourceDigest(data.root);
  expect(linked).not.toBe(first);
  await writeFile(outside, 'second');
  expect(await sourceDigest(data.root)).toBe(linked);
  await writeFile(join(data.root, 'scenes/intro/shots/only.html'), '<h1>changed</h1>');
  expect(await sourceDigest(data.root)).not.toBe(linked);
});

test('failed still records error, skips remainder and removes partial file', async () => {
  const data = await fixture();
  const frames = selectReviewFrames([{id: 'many', startFrame: 0, durationFrames: 4}], []);
  let calls = 0;
  const captures = await captureFrames(frames, data.output, async (_, path) => {
    calls++;
    await writeFile(path, calls === 1 ? onePixelPng : Buffer.from('partial'));
    if (calls === 2) throw new Error('browser seek failed');
  });
  expect(captures.map(item => item.status)).toEqual(['captured', 'failed', 'failed']);
  expect(captures[0]).toMatchObject({sha256: sha(onePixelPng)});
  expect(captures[1]).toMatchObject({error: expect.stringContaining('browser seek failed')});
  expect(captures[2]).toMatchObject({error: expect.stringContaining('skipped')});
  expect((await readdir(join(data.output, 'screenshots'))).some(name => name.includes('partial'))).toBe(false);
});
```

- [ ] **Step 2: Run `bun test tests/review-artifacts.test.ts`.** Expected: FAIL because the artifact modules do not exist.
- [ ] **Step 3: Implement `src/review/capture.ts`** (the injected renderer is not a production CLI option):

```ts
import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, rm} from 'node:fs/promises';
import {join} from 'node:path';
import type {ReviewFrame} from './frames';
import type {ReviewCapture} from './artifacts';

const pngHeader = '89504e470d0a1a0a';
export async function captureFrames(frames: ReviewFrame[], output: string,
  render: (frame: ReviewFrame, partialPath: string) => Promise<void>): Promise<ReviewCapture[]> {
  await mkdir(join(output, 'screenshots'));
  const captures: ReviewCapture[] = [];
  let failed = false;
  for (const frame of frames) {
    if (failed) {
      captures.push({...frame, status: 'failed', error: 'skipped after prior capture failure'});
      continue;
    }
    const destination = join(output, frame.path);
    const partial = `${destination}.partial-${process.pid}.png`;
    try {
      await render(frame, partial);
      const bytes = await readFile(partial);
      if (bytes.length <= 8 || bytes.subarray(0, 8).toString('hex') !== pngHeader)
        throw new Error(`invalid PNG: ${frame.shotId}:${frame.localFrame}`);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await rename(partial, destination);
      captures.push({...frame, status: 'captured', sha256});
    } catch (error) {
      failed = true;
      captures.push({...frame, status: 'failed', error: String(error)});
    } finally { await rm(partial, {force: true}); }
  }
  return captures;
}
```

The `output` directory exists and is empty when called. This helper writes only its own new screenshot paths and returns exactly one entry per selected frame.
- [ ] **Step 4: Implement `src/review/artifacts.ts`** with these exact schema rules:

```ts
export type ReviewCapture = ReviewFrame & ({status: 'captured'; sha256: string} | {status: 'failed'; error: string});
export type ReviewManifest = {
  schemaVersion: 1; projectId: string; sceneId: string;
  source: {gitCommit: string; trackedDirty: boolean; untrackedDirty: boolean; sha256: string};
  selection: {policy: typeof SELECTION_POLICY; milestones: string[]};
  environment: {bun: string; remotion: string; chromium: string;
    os: {platform: string; arch: string; release: string};
    video: {width: number; height: number; fps: number}; fonts: Array<{family: string; file: string}> | null};
  validation: {command: 'bun run validate'; exitCode: number; warnings: string[]; errors: string[]};
  captures: ReviewCapture[];
  review: {status: 'unreviewed' | 'needs-revision' | 'accepted';
    reviewer: null | {kind: 'human' | 'agent'; name: string}; findings: string[]; notes: string};
};
```

Use `readdir(root,{withFileTypes:true})` recursively in lexical relative-path order, hash regular-file bytes with `createHash('sha256')`, and hash symlink text via `readlink`, never traverse links. For each file feed `relativePath + '\0' + fileHash + '\n'` to an outer SHA-256. `verifyReview` first parse JSON as unknown and validate every nested value (strings, finite safe integer frames, arrays, enum values, 64-character lowercase SHA-256, accepted reviewer/nonempty notes). Call `loadProject(projectRoot)` and read `project.json` for IDs; regenerate expected frames with `selectReviewFrames(project.shots, selection.milestones)`, requiring one capture per expected frame and exact canonical `path`. Check path is relative inside artifact directory, its realpath stays within it (reject symlink escapes), PNG signature and SHA-256. Reject nonzero validation, failed captures, mismatched `sourceDigest(projectRoot)`, or `readFile(summary.md) !== summaryText(manifest)`. Keep `gitCommit` historical; only require a nonempty hex commit hash. `summaryText` deterministically writes project/scene, source digest, validation exit/warnings, a short capture table and explicit review status, reviewer, findings and notes; never calls an unreviewed run good.
- [ ] **Step 5: Run `bun test tests/review-artifacts.test.ts tests/review-frames.test.ts && bun run typecheck`.** Expected: PASS, no project-source writes.
- [ ] **Step 6: Commit:** `git add src/review/artifacts.ts src/review/capture.ts tests/review-artifacts.test.ts && git commit -m "feat: verify review artifacts and capture failures"`.

### Task 3: CLI capture with one bundle and bounded integration proof

**Files:** Create `scripts/review.ts`, `tests/review-capture.test.ts`; modify `package.json`.

**Interfaces:** Consume Task 1's `selectReviewFrames`, Task 2's `captureFrames`, `sourceDigest`, `summaryText`, `verifyReview`, plus `loadProject`. Produce `bun run review --output <new-dir> [--milestone shot:frame...]`, `bun run review --check <manifest>`, `bun run review --summary <manifest>`; no flag injects a production rendering error. Existing `hash` and `snap` interfaces remain untouched.

- [ ] **Step 1: Add failing integration test** `tests/review-capture.test.ts`:

```ts
import {expect, test} from 'bun:test';
import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import type {ReviewManifest} from '../src/review/artifacts';
import {sourceDigest} from '../src/review/artifacts';

const repo = resolve(import.meta.dir, '..');
const run = async (args: string[]) => {
  const proc = Bun.spawn(args, {cwd: repo, stdout: 'pipe', stderr: 'pipe'});
  const [out, err, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return {out, err, exit};
};
const review = (args: string[]) => run(['bun', 'run', 'review', ...args]);
const sourceStatus = () => run(['git', 'status', '--porcelain', '--untracked-files=all', '--', 'projects/demo']);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('retains repeatable PNGs and never writes source or replaces review output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-review-test-'));
  const first = join(root, 'first');
  const second = join(root, 'second');
  const sourceBefore = (await sourceStatus()).out;
  const digestBefore = await sourceDigest(join(repo, 'projects/demo'));
  try {
    const args = ['--milestone', 'diagram:70'];
    expect((await review(['--output', first, ...args])).exit).toBe(0);
    const manifestPath = join(first, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ReviewManifest;
    expect(manifest.captures).toHaveLength(17);
    expect(manifest.review.status).toBe('unreviewed');
    for (const capture of manifest.captures) {
      expect(capture.status).toBe('captured');
      if (capture.status !== 'captured') continue;
      const bytes = await readFile(join(first, capture.path));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(digest(bytes)).toBe(capture.sha256);
    }
    expect((await review(['--check', manifestPath])).exit).toBe(0);
    manifest.review.status = 'needs-revision';
    manifest.review.notes = 'Checked image set; follow-up planned';
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    expect((await review(['--check', manifestPath])).exit).not.toBe(0);
    expect((await review(['--summary', manifestPath])).exit).toBe(0);
    expect((await review(['--check', manifestPath])).exit).toBe(0);
    expect((await review(['--output', first])).exit).not.toBe(0);
    expect((await review(['--output', second, ...args])).exit).toBe(0);
    const replay = JSON.parse(await readFile(join(second, 'manifest.json'), 'utf8')) as ReviewManifest;
    expect(replay.captures.map(item => item.status === 'captured' ? item.sha256 : null))
      .toEqual(manifest.captures.map(item => item.status === 'captured' ? item.sha256 : null));
    const invalid = join(root, 'invalid');
    expect((await review(['--output', invalid, '--milestone', 'diagram:90'])).exit).not.toBe(0);
    await expect(stat(invalid)).rejects.toThrow();
    const forbidden = join(repo, 'projects/demo/review-must-not-exist');
    expect((await review(['--output', forbidden])).exit).not.toBe(0);
    await expect(stat(forbidden)).rejects.toThrow();
    expect((await sourceStatus()).out).toBe(sourceBefore);
    expect(await sourceDigest(join(repo, 'projects/demo'))).toBe(digestBefore);
  } finally { await rm(root, {recursive: true, force: true}); }
}, 420000);
```
- [ ] **Step 2: Run `bun test tests/review-capture.test.ts`.** Expected: FAIL because `bun run review` is not defined.
- [ ] **Step 3: Implement `scripts/review.ts`** with three mutually exclusive modes. Parse repeated `--milestone` pairs and at most one `--output`, `--check`, or `--summary`; reject unknown/missing values and invalid milestones before `mkdir`. For `--check` call `verifyReview(path, demoRoot)` without writing. For `--summary` call `verifyReview(path, demoRoot, {checkSummary:false})` (all other checks required), write only `summary.md`, then call full `verifyReview`; do not mutate the reviewer section. For capture: `loadProject(demoRoot)` and verify the one project scene ID from `project.json`; `selectReviewFrames`, default output to `output/reviews/<project>-<scene>-<ISO timestamp without punctuation>-<pid>` if `--output` is absent; reject output existing or inside `projects/demo`; run `Bun.spawn(['bun','run','validate'],{cwd:repo,stdout:'pipe',stderr:'pipe'})`, parse `warning ` lines from stderr, and reject nonzero before output creation. Record `sourceDigest` before capture and `git rev-parse HEAD` plus scoped `git status --porcelain --untracked-files=all -- projects/demo`; status lines starting `??` set `untrackedDirty`, all other lines set `trackedDirty`. Use `CHROME_BIN` or the existing Linux x64 bundled Chrome path from `scripts/hash.ts`, query `--version`; reuse `installedFonts()` logic from that file without changing `hash` output. `mkdir(output,{recursive:false})`, create a Remotion bundle in `mkdtemp(join(tmpdir(),'framecraft-bundle-'))`, open one browser, and use `selectComposition` once per shot, comparing duration/fps/size to `loadProject`. Pass the selected shot composition and local frame to `renderStill` via `captureFrames`, collecting browser log errors per frame. After failure, still write manifest/summary with complete failed/skipped frame records; set process exit nonzero. Always close browser and delete bundle in `finally`. Compare source digest after capture; if changed, record an error and exit nonzero. The manifest review starts `{status:'unreviewed',reviewer:null,findings:[],notes:''}`. Do not turn warnings into subjective findings.
Before `mkdir(output,{recursive:false})`, resolve the nearest existing ancestor of its parent with `realpath` and append the nonexisting suffix; compare that destination to the real project root to reject symlinked paths into project sources. Bundle, open the browser and select/validate **every** shot composition against the loader before creating the artifact directory; invalid composition metadata is a preflight failure with no artifact. Then create missing parents with `mkdir(dirname(output),{recursive:true})` and the output itself without recursion. Use the already selected composition objects during capture; close the browser and remove the bundle even if preflight fails. Once the output exists, a render or browser failure must write failed/skipped entries and the summary before nonzero exit.
- [ ] **Step 4: Modify only `package.json` scripts** by adding `"review": "bun scripts/review.ts"` adjacent to `hash`.
- [ ] **Step 5: Run `bun test tests/review-capture.test.ts && bun run typecheck && bun run validate && bun test tests/hash.test.ts`.** Expected: PASS; two 17-frame captures verify stable hashes on this setup. The existing hash diagnostic remains unchanged.
- [ ] **Step 6: Commit:** `git add scripts/review.ts tests/review-capture.test.ts package.json && git commit -m "feat: capture agent review artifacts with existing renderer"`.

### Task 4: Agent guides, observed demo review and final delivery

**Files:** Modify `AGENTS.md`; create `docs/agent-workflow.md`, `projects/demo/scenes/intro/brief.md`, six `skills/framecraft-*/SKILL.md`, `docs/phase3-report.md`, and `docs/reviews/demo-intro/manifest.json`, `summary.md`, `screenshots/*.png` (all selected frames). If a visual defect is observed, touch only its necessary HTML/CSS and capture into a new review directory.

**Interfaces:** Uses `bun run review --output docs/reviews/demo-intro --milestone <shot:frame>`; edits only `review` in manifest after opening PNGs; `bun run review --summary ...` and `--check ...` validate the final artifact. No agent-provider API.

- [ ] **Step 1: Write the inferred demo brief** at `projects/demo/scenes/intro/brief.md`:

```md
# Demo review brief (inferred)

These criteria were inferred from the existing four shot HTML files; this is not an original client brief.

The intro is 1920×1080 at 30 fps, 330 frames, with zero-overlap cuts at global frames 60, 150 and 210.

- `title` (0–59): the full “Framecraft” word reveals without clipping. Inspect local frame 20 when its scale/opacity settle.
- `diagram` (0–89): the nodes/pulse and result remain legible through the GSAP reveal. Inspect local frame 30 after one second of motion.
- `close` (0–59): “Made frame by frame.” stays readable, including the last frame.
- `commit` (0–119): typing, delayed output and the rule fit the viewport and have defined early/late states. Inspect local frame 60 as the output starts appearing and 90 as the rule starts expanding.

Always inspect first, midpoint and last frames of each shot and both sides of each cut. The milestones are `title:20`, `diagram:30`, `commit:60`, `commit:90`; they come from current HTML timing, not client instructions.
```
- [ ] **Step 2: Create six concise guides** (each `SKILL.md`): storyboard links manifest and inferred brief and asks for shot IDs/durations/intent/cuts; HTML shot points to `AGENTS.md` public API and `bun run snap --shot ... --frame ...`; motion points to frame-local CSS/WAAPI/GSAP seeking and absolute timing; visual review gives `bun run review`, open **every** PNG, record defects by shot/frame, recapture to a new directory after revision, manually set status/reviewer/notes then `--summary` and `--check`; sound points to `docs/audio.md`, local WAV/MP3 cues and opt-in supplied narration; export points to `bun run validate`, `bun run render`, `docs/rendering.md` stream probe, audio check and limits. Each says it is a repository Markdown guide, not a provider-installed dependency. In `AGENTS.md`, append a short `## Agent visual review` section linking `docs/agent-workflow.md` and the six guide paths without rewriting the HTML shot API. `docs/agent-workflow.md` lists the ten numbered steps: inspect manifests, read requirements, storyboard, author shot, validate, capture, inspect PNGs, revise/recapture, record review + check, render and inspect streams. Mention the one-demo-scene static composition limit and no automatic acceptance.
- [ ] **Step 3: Run** `bun run review --output docs/reviews/demo-intro --milestone title:20 --milestone diagram:30 --milestone commit:60 --milestone commit:90`. Expected: 20 captures (16 defaults, four new). Open **each** PNG with `functions.read`, including all six sides of the three cuts; compare text crops, reveal states, typography and continuity against the inferred criteria. Record any defects with shot/global frame and revise only the relevant shot. If changed, preserve the original directory and rerun into `docs/reviews/demo-intro-revised/` with the same flags. If none, record `No defect or revision warranted by the inferred brief after inspecting every capture` rather than inventing a change. Set `review.status` only after inspection, with `reviewer:{kind:'agent',name:'Framecraft review agent'}` and specific findings/notes; run `bun run review --summary docs/reviews/demo-intro/manifest.json`, then `bun run review --check docs/reviews/demo-intro/manifest.json` (or the final revised directory). Do not claim a human reviewed it.
- [ ] **Step 4: Run full verification**: `bun test`, `bun run typecheck`, `bun run validate`, `bun run render`, `bun run review --check <final-manifest>` and bundled FFprobe:

```sh
node_modules/@remotion/compositor-linux-x64-gnu/ffprobe -v error -count_frames -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames -of json output/intro.mp4
```

Expected: all pass; video 330 decoded H.264 frames at 1920×1080/30 fps plus AAC stream, and existing audio-export test within `bun test` checks decoded tones. Confirm browser/studio tests, no new dependency and source unchanged by capture except any intentional shot revision. `docs/phase3-report.md` records exact commands, counts, manifest paths, reviewer identity, specific observed issues/revisions or explicit none, video/audio probe, and unperformed checks (second machine/human listening).
- [ ] **Step 5: Commit only Phase 3 files** with `git add AGENTS.md docs/agent-workflow.md docs/phase3-report.md docs/reviews projects/demo/scenes/intro/brief.md skills/framecraft-*` and any explicitly reviewed HTML shot edits, then `git commit -m "docs: deliver agent visual review workflow"`. Do not stage `.taste-skill/` or `framecraft.zip`; report the resulting SHA.

## Plan self-review

- The frame policy, cut sides, milestones, deduplication and names are Task 1; output-count example is 16 default + one new milestone.
- Schema, source revision/digest, environment, status, PNG hashes and read-only checker are Task 2; partial-file and injected-render failure are Task 2 tests.
- Existing validation/Remotion integration, preflight/no overwrite, one browser, failure manifest and source nonmodification are Task 3.
- Six harness-agnostic guides, inferred demo intent, actually opened PNGs, manual decision, final render/audio verification and limits are Task 4.
- `--summary` must verify all non-summary invariants before writing; `--check` must remain read-only. The historical git commit is informational, while the project digest is the freshness check.
