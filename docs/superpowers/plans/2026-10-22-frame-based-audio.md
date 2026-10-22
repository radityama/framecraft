# Frame-Based Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one versioned, validated, frame-based timeline for local music and effects in the existing Studio Player and 330-frame MP4 export.

**Architecture:** Resolve scene and shot cues through one pure function into scene-frame ranges. Validate media on the server, then pass the same resolved cues to Remotion's existing scene composition in both Studio and export; Remotion owns playback and mixing. Keep the existing temporary-output/rename boundary.

**Tech Stack:** Bun 1.4.3, React 19.3.1, Remotion 4.0.537 (`remotion`, `@remotion/player`, `@remotion/renderer`, `@remotion/bundler`), bundled FFprobe for metadata only, WAV/MP3, Bun tests, Playwright browser tests.

## Global Constraints

- Project assets stay inside `projects/demo/`; no remote media, new mandatory dependency, cloud service, external audio mixer, or HTML shot API change.
- Placement, trims, loops and envelopes use integer frames at the project's fps. Do not claim sample accuracy or cross-machine audio identity.
- The default demo stays 1920×1080, 30 fps, four zero-overlap shots, 330 frames; shot-scoped exports include shot cues but not scene cues.
- Overlapping cues mix freely; only invalid source, cue, fade, or container ranges are rejected.
- Preserve prior MP4 output on every failed export; silent projects continue to export without mandatory audio.
- Leave the preexisting untracked `.taste-skill/` and `framecraft.zip` untouched.

## File map

- `src/spike/audio.ts`: browser-safe schema parser, frame-offset resolution and frame-gain math. No filesystem or browser clock.
- `src/spike/audio-assets.ts`: local-file codec/duration probe and decode-to-null validation; no mixing or encoding.
- `src/spike/project.ts`: existing filesystem trust boundary, now validates and returns resolved audio.
- `src/spike/composition.tsx`: the one scene renderer, now with frame-positioned Remotion audio.
- `src/spike/index.tsx`: existing registered scene and shot compositions use the shared resolver.
- `src/studio/Studio.tsx`: passes scene audio to the existing Player; no extra media clock.
- `scripts/spike.ts`, `scripts/atomic-output.ts`: renderer CLI and the existing atomic output boundary extracted for a failure test; permit isolated test output.
- `projects/demo/assets/audio/*`: generated fixtures and source/licensing note; scene/shot manifests declare them.
- `tests/audio.test.ts`, `tests/audio-assets.test.ts`, `tests/audio-export.test.ts`, `tests/project.test.ts`, `tests/frame.test.ts`, `tests/studio-browser.test.ts`: pure, filesystem, export and browser regression coverage and affected Shot fixtures.
- `AGENTS.md`, `docs/rendering.md`, `docs/studio.md`, `docs/audio.md`, `docs/audio-phase2-report.md`: authoring contract, operations, schema, observed results.

### Task 1: Resolve and test frame-based cues

**Files:** Create `src/spike/audio.ts`, `tests/audio.test.ts`.

**Interfaces:** Produce `AudioCue` with `id`, `src`, `startFrame`, `durationFrames`, `trimInFrames`, `trimOutFrames`, `gain`, `fadeInFrames`, `fadeOutFrames`, `loop`; `resolveAudioTimeline(sceneAudio: unknown, shots: Array<{id: string; startFrame: number; durationFrames: number; audio?: unknown}>, durationFrames: number): {cues: AudioCue[]; shotCues: Record<string, AudioCue[]>}`; `cueGain(cue: AudioCue, localFrame: number): number`. `shotCues` use shot-local starts; `cues` use scene starts.

- [ ] **Step 1: Add a failing test for resolution and boundaries.** Add to `tests/audio.test.ts`:

```ts
import {expect, test} from 'bun:test';
import {cueGain, resolveAudioTimeline} from '../src/spike/audio';

const source = {id: 'hit', src: 'assets/audio/hit.wav', startFrame: 2, durationFrames: 8,
  trimInFrames: 3, trimOutFrames: 7, gain: 0.5, fadeInFrames: 2, fadeOutFrames: 2, loop: true};
const shots = [{id: 'a', startFrame: 0, durationFrames: 10},
  {id: 'b', startFrame: 10, durationFrames: 20, audio: [source]}];

test('shot cues resolve once to scene frames while retaining local scope and trim loop', () => {
  const result = resolveAudioTimeline({schemaVersion: 1, cues: [{...source, id: 'bed', startFrame: 0, durationFrames: 30}]}, shots, 30);
  expect(result.cues.map(cue => [cue.id, cue.startFrame, cue.durationFrames])).toEqual([['bed', 0, 30], ['b:hit', 12, 8]]);
  expect(result.shotCues.b?.[0]?.startFrame).toBe(2);
  expect(result.shotCues.b?.[0]?.trimOutFrames).toBe(7);
  expect(result.shotCues.b?.[0]?.trimOutFrames! - result.shotCues.b?.[0]?.trimInFrames!).toBe(4);
  expect(result.shotCues.b?.[0]?.loop).toBe(true);
  expect([0, 1, 2, 6, 7].map(f => cueGain(result.shotCues.b![0]!, f))).toEqual([0, 0.25, 0.5, 0.5, 0.25]);
});

test('rejects cue collisions in one scope and impossible ranges, but mixes overlaps', () => {
  const valid = {schemaVersion: 1, cues: [{...source, id: 'one', startFrame: 0}, {...source, id: 'two', startFrame: 1}]};
  expect(resolveAudioTimeline(valid, [], 30).cues).toHaveLength(2);
  expect(() => resolveAudioTimeline({schemaVersion: 1, cues: [source, source]}, [], 30)).toThrow('duplicate');
  expect(() => resolveAudioTimeline({schemaVersion: 1, cues: []}, [{...shots[1]!, audio: [source, source]}], 30)).toThrow('duplicate');
  expect(() => resolveAudioTimeline({schemaVersion: 1, cues: [{...source, startFrame: 29}]}, [], 30)).toThrow('durationFrames');
  expect(() => resolveAudioTimeline({schemaVersion: 1, cues: [{...source, fadeOutFrames: 7}]}, [], 30)).toThrow('fade');
  expect(() => resolveAudioTimeline([], [{...shots[1]!, audio: [source]}], 30)).toThrow('schemaVersion');
});
```

- [ ] **Step 2: Run `bun test tests/audio.test.ts`.** Expected: FAIL because `src/spike/audio.ts` does not exist.
- [ ] **Step 3: Implement `src/spike/audio.ts`.** Keep parsing, defaults, offsets and envelope here (no I/O):

```ts
export type AudioCue = {id: string; src: string; startFrame: number; durationFrames: number;
  trimInFrames: number; trimOutFrames: number; gain: number; fadeInFrames: number;
  fadeOutFrames: number; loop: boolean};
type AudioShot = {id: string; startFrame: number; durationFrames: number; audio?: unknown};
const record = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
};
const integer = (value: unknown, field: string, min: number): number => {
  if (!Number.isSafeInteger(value) || (value as number) < min) throw new Error(`${field} must be an integer >= ${min}`);
  return value as number;
};
function parse(raw: unknown, scope: string, limit: number, seen: Set<string>): AudioCue {
  const value = record(raw, scope);
  const id = value.id;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`${scope}.id must be a kebab-case id`);
  if (seen.has(id)) throw new Error(`${scope}: duplicate audio cue id ${id}`);
  seen.add(id);
  if (typeof value.src !== 'string' || !value.src) throw new Error(`${scope}.${id}.src must be a local file`);
  const field = `${scope}.${id}`;
  const startFrame = integer(value.startFrame, `${field}.startFrame`, 0);
  const durationFrames = integer(value.durationFrames, `${field}.durationFrames`, 1);
  const trimInFrames = integer(value.trimInFrames ?? 0, `${field}.trimInFrames`, 0);
  const trimOutFrames = integer(value.trimOutFrames, `${field}.trimOutFrames`, 1);
  const fadeInFrames = integer(value.fadeInFrames ?? 0, `${field}.fadeInFrames`, 0);
  const fadeOutFrames = integer(value.fadeOutFrames ?? 0, `${field}.fadeOutFrames`, 0);
  const gain = value.gain ?? 1;
  if (typeof gain !== 'number' || !Number.isFinite(gain) || gain < 0 || gain > 1) throw new Error(`${field}.gain must be between 0 and 1`);
  if (value.loop !== undefined && typeof value.loop !== 'boolean') throw new Error(`${field}.loop must be boolean`);
  if (trimOutFrames <= trimInFrames || (!value.loop && durationFrames > trimOutFrames - trimInFrames)) throw new Error(`${field}: invalid source trim range`);
  if (!Number.isSafeInteger(startFrame + durationFrames) || startFrame + durationFrames > limit) throw new Error(`${field}.durationFrames exceeds its scope`);
  if (fadeInFrames + fadeOutFrames > durationFrames) throw new Error(`${field}: overlapping fades exceed durationFrames`);
  return {id, src: value.src, startFrame, durationFrames, trimInFrames, trimOutFrames,
    gain, fadeInFrames, fadeOutFrames, loop: value.loop === true};
}
export function resolveAudioTimeline(sceneAudio: unknown, shots: AudioShot[], durationFrames: number) {
  const shotCues: Record<string, AudioCue[]> = {};
  let raw: unknown[];
  if (Array.isArray(sceneAudio) && sceneAudio.length === 0) {
    if (shots.some(shot => Array.isArray(shot.audio) && shot.audio.length)) throw new Error('scene.audio.schemaVersion required for shot audio');
    raw = [];
  } else {
    const timeline = record(sceneAudio, 'scene.audio');
    if (timeline.schemaVersion !== 1 || !Array.isArray(timeline.cues)) throw new Error('scene.audio.schemaVersion must be 1 with a cues array');
    raw = timeline.cues;
  }
  const seenScene = new Set<string>();
  const cues = raw.map((cue, index) => parse(cue, `scene.audio[${index}]`, durationFrames, seenScene));
  for (const shot of shots) {
    const list = shot.audio ?? [];
    if (!Array.isArray(list)) throw new Error(`shot ${shot.id}.audio must be an array`);
    const seen = new Set<string>();
    shotCues[shot.id] = list.map((cue, index) => parse(cue, `shot ${shot.id}.audio[${index}]`, shot.durationFrames, seen));
    cues.push(...shotCues[shot.id]!.map(cue => ({...cue, id: `${shot.id}:${cue.id}`, startFrame: shot.startFrame + cue.startFrame})));
  }
  return {cues, shotCues};
}
export function cueGain(cue: AudioCue, localFrame: number): number {
  return cue.gain * Math.max(0, Math.min(1, cue.fadeInFrames ? localFrame / cue.fadeInFrames : 1,
    cue.fadeOutFrames ? (cue.durationFrames - localFrame) / cue.fadeOutFrames : 1));
}
```

Additional test assertions in the same file:

```ts
expect(() => resolveAudioTimeline({schemaVersion: 1, cues: [{...source, loop: false}]}, [], 30)).toThrow('trim');
expect(() => resolveAudioTimeline({schemaVersion: 1, cues: [{...source, gain: NaN}]}, [], 30)).toThrow('gain');
expect(() => resolveAudioTimeline({schemaVersion: 2, cues: []}, [], 30)).toThrow('schemaVersion');
expect(() => resolveAudioTimeline({schemaVersion: 1, cues: [{...source, startFrame: Number.MAX_SAFE_INTEGER}]}, [], 30)).toThrow('durationFrames');
```

- [ ] **Step 4: Run `bun test tests/audio.test.ts && bun run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit:** `git add src/spike/audio.ts tests/audio.test.ts && git commit -m "feat: resolve versioned audio cues in frames"`.

### Task 2: Validate local media and generate licensed fixtures

**Files:** Create `src/spike/audio-assets.ts`, `scripts/generate-audio-fixtures.ts`, `projects/demo/assets/audio/LICENSE.md`, `tests/audio-assets.test.ts`; modify `src/spike/project.ts`, `tests/project.test.ts`, `tests/frame.test.ts`.

**Interfaces:** Consume `resolveAudioTimeline()` and `AudioCue`. Produce `probeAudioFrames(path: string, fps: number): Promise<number>` and `Project.audio`, `Scene.audio` (resolved scene cues), `Shot.audio` (shot-local cues). Keep `loadProject()`'s one-scene guard and `loadStudioProject()`'s zero-or-more scenes.

- [ ] **Step 1: Write a failing asset/loader test.** Create `tests/audio-assets.test.ts`:

```ts
import {expect, test} from 'bun:test';
import {copyFile, mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {loadProject} from '../src/spike/project';
import {probeAudioFrames} from '../src/spike/audio-assets';

const assets = resolve(import.meta.dir, '../projects/demo/assets/audio');
const bed = {id: 'bed', src: 'assets/audio/bed.wav', startFrame: 0, durationFrames: 330, trimOutFrames: 330};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-audio-test-'));
  await mkdir(join(root, 'scenes/intro/shots'), {recursive: true});
  await mkdir(join(root, 'assets/audio'), {recursive: true});
  await copyFile(join(assets, 'bed.wav'), join(root, bed.src));
  await writeFile(join(root, 'scenes/intro/shots/a.html'), '<!doctype html>');
  await writeFile(join(root, 'scenes/intro/shots/b.html'), '<!doctype html>');
  const project = {schemaVersion: 1, id: 'demo', video: {width: 1920, height: 1080, fps: 30}, scenes: [{id: 'intro', path: 'scenes/intro/scene.json'}], audio: [] as unknown[]};
  const scene = {id: 'intro', shots: [
    {id: 'a', entry: 'shots/a.html', durationFrames: 60, overlapFrames: 0},
    {id: 'b', entry: 'shots/b.html', durationFrames: 270, overlapFrames: 0,
      audio: [{id: 'hit', src: bed.src, startFrame: 15, durationFrames: 5, trimOutFrames: 5}]},
  ], audio: {schemaVersion: 1, cues: [bed, {...bed, id: 'effect', startFrame: 72, durationFrames: 5, trimOutFrames: 5}]}};
  const save = async () => {
    await writeFile(join(root, 'project.json'), JSON.stringify(project));
    await writeFile(join(root, 'scenes/intro/scene.json'), JSON.stringify(scene));
  };
  await save();
  return {root, project, scene, save};
}

test('validates scene/shot audio and source duration', async () => {
  const data = await fixture();
  try {
    expect((await loadProject(data.root)).audio.map(cue => cue.startFrame)).toEqual([0, 72, 75]);
    await copyFile(join(assets, 'hit-a.mp3'), join(data.root, 'assets/audio/hit-a.mp3'));
    data.scene.audio.cues[1]!.src = 'assets/audio/hit-a.mp3';
    await data.save();
    expect((await loadProject(data.root)).audio[1]?.src).toBe('assets/audio/hit-a.mp3');
    data.scene.audio.cues[1]!.src = bed.src;
    data.scene.audio.cues[0]!.trimOutFrames = 331;
    await data.save();
    await expect(loadProject(data.root)).rejects.toThrow(/bed.*330/);
    data.scene.audio.cues[0]!.trimOutFrames = 330;
    data.scene.audio.cues[0]!.src = 'assets/audio/missing.wav';
    await data.save();
    await expect(loadProject(data.root)).rejects.toThrow(/bed.*missing.wav/);
    data.scene.audio.cues[0]!.src = bed.src;
    data.project.audio.push(bed);
    await data.save();
    await expect(loadProject(data.root)).rejects.toThrow('project.audio');
  } finally { await rm(data.root, {recursive: true, force: true}); }
});

test('rejects traversal, symlink escape, unsupported media and invalid codec', async () => {
  const data = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'framecraft-audio-outside-'));
  try {
    await writeFile(join(outside, 'sound.wav'), 'not audio');
    await symlink(join(outside, 'sound.wav'), join(data.root, 'assets/audio/link.wav'));
    await writeFile(join(data.root, 'assets/audio/sound.ogg'), 'not audio');
    for (const src of ['../outside.wav', 'assets/audio/link.wav', 'assets/audio/sound.ogg']) {
      data.scene.audio.cues[0]!.src = src;
      await data.save();
      await expect(loadProject(data.root)).rejects.toThrow(/audio|project|unsupported|not found/i);
    }
    await writeFile(join(data.root, 'assets/audio/fake.wav'), 'not audio');
    data.scene.audio.cues[0]!.src = 'assets/audio/fake.wav';
    await data.save();
    await expect(loadProject(data.root)).rejects.toThrow(/bed.*audio probe/i);
    await copyFile(join(assets, 'hit-a.mp3'), join(data.root, 'assets/audio/wrong.wav'));
    data.scene.audio.cues[0]!.src = 'assets/audio/wrong.wav';
    await data.save();
    await expect(loadProject(data.root)).rejects.toThrow(/bed.*unsupported audio codec/);
    await expect(probeAudioFrames(join(assets, 'bed.wav'), 30)).resolves.toBe(330);
    await expect(probeAudioFrames(join(assets, 'hit-a.mp3'), 30)).resolves.toBeGreaterThanOrEqual(20);
  } finally { await rm(data.root, {recursive: true, force: true}); await rm(outside, {recursive: true, force: true}); }
});

test('legacy empty audio stays silent', async () => {
  const data = await fixture();
  try {
    data.scene.shots[1]!.audio = [];
    await writeFile(join(data.root, 'scenes/intro/scene.json'), JSON.stringify({...data.scene, audio: []}));
    expect((await loadProject(data.root)).audio).toEqual([]);
  } finally { await rm(data.root, {recursive: true, force: true}); }
});
```

In `tests/project.test.ts`, add `audio: []` to each Shot and Scene in the exact result at lines 47–56. The empty Studio project at line 65 has no scene entries, so its expected object does not change.
In `tests/frame.test.ts`, add `audio: []` to all four `Shot` literals at lines 6–9; no frame logic changes.

- [ ] **Step 2: Run `bun test tests/audio-assets.test.ts tests/project.test.ts`.** Expected: FAIL because `probeAudioFrames()` and resolved audio fields do not exist.
- [ ] **Step 3: Generate the local assets.** Write `scripts/generate-audio-fixtures.ts`:

```ts
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {RenderInternals} from '@remotion/renderer';

const root = resolve(import.meta.dir, '../projects/demo/assets/audio');
const rate = 48000;
async function wave(name: string, samples: number, frequencies: number[], amplitude: number) {
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples * 2, 4);
  data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    const sample = frequencies.reduce((total, frequency) => total + Math.sin(2 * Math.PI * frequency * index / rate), 0) / frequencies.length;
    data.writeInt16LE(Math.round(32767 * amplitude * sample), 44 + index * 2);
  }
  if (data.length !== 44 + samples * 2) throw new Error(`wrong WAV size: ${name}`);
  await writeFile(join(root, name), data);
}
await mkdir(root, {recursive: true});
await wave('bed.wav', 528000, [110, 165], 0.12);
await wave('hit-a.wav', 32000, [440], 0.55);
await wave('hit-b.wav', 32000, [740], 0.55);
const binary = RenderInternals.getExecutablePath({type: 'ffmpeg', indent: false, logLevel: 'error', binariesDirectory: null});
const process = Bun.spawn([binary, '-v', 'error', '-i', join(root, 'hit-a.wav'), '-codec:a', 'libmp3lame', '-q:a', '5', '-y', join(root, 'hit-a.mp3')], {stderr: 'pipe'});
const [error, exit] = await Promise.all([new Response(process.stderr).text(), process.exited]);
if (exit !== 0) throw new Error(`MP3 fixture encoding failed: ${error}`);
```

Write `projects/demo/assets/audio/LICENSE.md`:

```md
# Audio fixture provenance

`bed.wav`, `hit-a.wav`, `hit-b.wav` and `hit-a.mp3` are synthetic tones generated locally with `bun scripts/generate-audio-fixtures.ts`; no third-party sound recordings or samples are used. The generated fixture data is provided under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). These are diagnostic tones, not production music or sound design.
```

Run `bun scripts/generate-audio-fixtures.ts` and commit its outputs; no remote fetch.
- [ ] **Step 4: Add `src/spike/audio-assets.ts` for validation.** Renderer `getVideoMetadata()` was tried on a WAV and returned `No video stream found`; use already bundled FFprobe for metadata, and bundled FFmpeg in decode-to-null mode solely to reject corrupt but probeable files before preview. Neither operation mixes or encodes output.

```ts
import {extname} from 'node:path';
import {RenderInternals} from '@remotion/renderer';

export async function probeAudioFrames(path: string, fps: number): Promise<number> {
  const extension = extname(path).toLowerCase();
  if (extension !== '.wav' && extension !== '.mp3') throw new Error(`unsupported audio format: ${extension || path}`);
  const binary = RenderInternals.getExecutablePath({type: 'ffprobe', indent: false, logLevel: 'error', binariesDirectory: null});
  const proc = Bun.spawn([binary, '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type', '-of', 'json', path], {stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exit !== 0) throw new Error(`audio probe failed: ${stderr.trim() || path}`);
  const info = JSON.parse(stdout) as {streams?: Array<{codec_name?: string; codec_type?: string}>; format?: {duration?: string}};
  const codecs = info.streams?.filter(stream => stream.codec_type === 'audio').map(stream => stream.codec_name);
  if (info.streams?.length !== 1 || codecs?.length !== 1 || !(extension === '.wav' ? codecs[0]?.startsWith('pcm_') : codecs[0] === 'mp3')) throw new Error(`unsupported audio codec in ${path}`);
  const duration = Number(info.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`invalid audio duration in ${path}`);
  const frames = Math.floor(duration * fps + 1e-6);
  if (!Number.isSafeInteger(frames) || frames < 1) throw new Error(`audio duration too short in ${path}`);
  const decoder = RenderInternals.getExecutablePath({type: 'ffmpeg', indent: false, logLevel: 'error', binariesDirectory: null});
  const decode = Bun.spawn([decoder, '-v', 'error', '-xerror', '-i', path, '-vn', '-f', 'null', '-'], {stdout: 'ignore', stderr: 'pipe'});
  const [decodeError, decodeExit] = await Promise.all([new Response(decode.stderr).text(), decode.exited]);
  if (decodeExit !== 0) throw new Error(`audio decode failed in ${path}: ${decodeError.trim()}`);
  return frames;
}
```

- [ ] **Step 5: Wire the existing loader trust boundary.** Add imports and replace the type declarations in `src/spike/project.ts`:

```ts
import {resolveAudioTimeline, type AudioCue} from './audio';
import {probeAudioFrames} from './audio-assets';

export type Shot = {id: string; entry: string; durationFrames: number; startFrame: number; audio: AudioCue[]};
export type Project = {video: {width: number; height: number; fps: number}; shots: Shot[]; durationFrames: number; audio: AudioCue[]};
export type Scene = {id: string; title: string; shots: Shot[]; durationFrames: number; audio: AudioCue[]};
```

Keep the `project.audio` guard, changing its error to `project.audio is reserved; use scene.audio`; delete the `scene.audio must be empty` guard. In the shot loop retain the raw shot audio in a separate local array parallel to `shots` (e.g. `const rawShots: Array<Shot & {audio?: unknown}> = []` is not appropriate because unknown is swallowed by `Shot.audio`); instead use `const audioInputs: Array<{id: string; startFrame: number; durationFrames: number; audio?: unknown}> = []` and append alongside `shots`:

```ts
shots.push({id: shotId, entry: shotEntry, durationFrames: duration, startFrame: durationFrames, audio: []});
audioInputs.push({id: shotId, startFrame: durationFrames, durationFrames: duration, audio: shot.audio});
durationFrames += duration;
```

After the shot loop, replace the old `scenes.push(...)` with:

```ts
const resolved = resolveAudioTimeline(scene.audio, audioInputs, durationFrames);
const media = new Map<string, {src: string; frames: number}>();
for (const cue of [...resolved.cues, ...Object.values(resolved.shotCues).flat()]) {
  let source = media.get(cue.src);
  if (!source) {
    let canonical: string;
    let frames: number;
    try {
      canonical = await entry(base, cue.src, `audio cue ${cue.id}.src`);
      frames = await probeAudioFrames(join(base, canonical), resultVideo.fps);
    } catch (error) { throw new Error(`audio cue ${cue.id}: ${String(error)}`); }
    source = {src: canonical, frames};
    media.set(cue.src, source);
  }
  if (cue.trimOutFrames > source.frames) throw new Error(`audio cue ${cue.id}: trimOutFrames ${cue.trimOutFrames} exceeds ${source.frames} source frames in ${cue.src}`);
  cue.src = source.src;
}
for (const shot of shots) shot.audio = resolved.shotCues[shot.id]!;
scenes.push({id: sceneId, title: title(scene.title, sceneId, 'scene.title'), shots, durationFrames, audio: resolved.cues});
```

The import and `loadProject()` return must carry the scene's resolved audio:

```ts
const {shots, durationFrames, audio} = project.scenes[0]!;
return {video: project.video, shots, durationFrames, audio};
```

`audioInputs` is declared next to `shots` inside the scene loop. Keep the existing shot-offset increment, overflow check, entry validation and scene guards unchanged.
- [ ] **Step 6: Run `bun scripts/generate-audio-fixtures.ts && bun test tests/audio-assets.test.ts tests/project.test.ts tests/frame.test.ts && bun run typecheck`.** Expected: PASS and fixture sizes within about 1.3 MiB total.
- [ ] **Step 7: Commit:** `git add src/spike/audio-assets.ts src/spike/project.ts tests/audio-assets.test.ts tests/project.test.ts tests/frame.test.ts scripts/generate-audio-fixtures.ts projects/demo/assets/audio && git commit -m "feat: validate local audio assets and frame ranges"`.

### Task 3: Mount the same audio in Player and export

**Files:** Modify `src/spike/composition.tsx`, `src/spike/index.tsx`, `src/studio/Studio.tsx`, `projects/demo/scenes/intro/scene.json`, `tests/studio-browser.test.ts`.

**Interfaces:** `SceneComposition({shots, video, audio}: {shots: Shot[]; video: Project['video']; audio: AudioCue[]})`. Shot-only compositions call it with one shot at frame zero and only that shot's local cues. Remotion's `Html5Audio` and `staticFile` come from the already installed `remotion` package.

- [ ] **Step 1: Add a failing browser test** in `tests/studio-browser.test.ts` using the existing `open()`, `seek()` and `ready()` helpers:

```ts
test('audio follows seek, pause, replay and scene switch', async () => {
  const {page, errors} = await open('/?clip=intro');
  try {
    await ready(page, 0);
    await seek(page, 78);
    await page.waitForFunction(() => [...document.querySelectorAll('audio')].filter(a => a.currentTime > 0).length >= 2);
    const before = await page.locator('audio').evaluateAll(nodes => nodes.map(node => ({time: (node as HTMLAudioElement).currentTime, paused: (node as HTMLAudioElement).paused})));
    expect(before.some(item => Math.abs(item.time - 78 / 30) < 0.35)).toBe(true);
    await seek(page, 96);
    await page.waitForFunction(() => {
      const media = document.querySelector<HTMLAudioElement>('audio[src*="hit-b.wav"]');
      return !!media && media.currentTime < 0.2;
    }, undefined, {timeout: 10000});
    const loopTime = await page.locator('audio[src*="hit-b.wav"]').evaluate(node => (node as HTMLAudioElement).currentTime);
    expect(loopTime).toBeLessThan(0.2);
    await page.getByRole('button', {name: 'Play'}).click();
    await page.getByRole('button', {name: 'Pause'}).click();
    await page.waitForTimeout(300);
    expect(await page.locator('audio').evaluateAll(nodes => nodes.every(node => (node as HTMLAudioElement).paused))).toBe(true);
    await seek(page, 329);
    await page.getByRole('button', {name: 'Play'}).click();
    await ready(page, 0);
    expect(errors).toEqual([]);
  } finally { await page.close(); }
}, 120000);
```

Extend the existing two-scene browser test's mocked `second` at lines 194–199 with `audio: []`. Just before selecting it (line 207), add `await seek(page, 78); expect(await page.locator('audio').count()).toBeGreaterThanOrEqual(2);`. Immediately after selecting it and awaiting its ready state, add `expect(await page.locator('audio').count()).toBe(0);` and retain the existing one-iframe check. This checks cleanup of mounted media, not merely a frame label.
- [ ] **Step 2: Run `bun test tests/studio-browser.test.ts`.** Expected: new audio test FAIL (no `<audio>`).
- [ ] **Step 3: Mount cues in `src/spike/composition.tsx`.** Replace the component with the complete implementation below. `Html5Audio.durationInFrames` selects the trimmed source interval; the outer `Sequence` limits playback to the cue duration. Numeric volume is recalculated from the integer local frame even during loops:

```tsx
import React from 'react';
import {Html5Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {cueGain, type AudioCue} from './audio';
import type {Project, Shot} from './project';
import {ShotView} from './shot';

function Cue({cue}: {cue: AudioCue}) {
  const localFrame = useCurrentFrame();
  return <Html5Audio src={staticFile(cue.src)} trimBefore={cue.trimInFrames}
    durationInFrames={cue.trimOutFrames - cue.trimInFrames} loop={cue.loop}
    volume={cueGain(cue, localFrame)} />;
}

export function SceneComposition({shots, video, audio}: {shots: Shot[]; video: Project['video']; audio: AudioCue[]}) {
  return <>
    {shots.map(shot => <Sequence key={shot.id} from={shot.startFrame} durationInFrames={shot.durationFrames}>
      <ShotView id={shot.id} entry={shot.entry} durationFrames={shot.durationFrames} {...video} />
    </Sequence>)}
    {audio.map(cue => <Sequence key={cue.id} from={cue.startFrame} durationInFrames={cue.durationFrames} layout="none">
      <Cue cue={cue} />
    </Sequence>)}
  </>;
}
```

Replace `src/spike/index.tsx` with:

```tsx
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import project from '../../projects/demo/project.json';
import scene from '../../projects/demo/scenes/intro/scene.json';
import {resolveAudioTimeline} from './audio';
import {SceneComposition} from './composition';
import type {Shot} from './project';

const {width, height, fps} = project.video;
let offset = 0;
const rawShots = scene.shots.map(shot => {
  const result = {...shot, entry: `${project.scenes[0]!.path.replace(/\/[^/]+$/, '')}/${shot.entry}`,
    startFrame: offset, audio: 'audio' in shot ? shot.audio : []};
  offset += shot.durationFrames;
  return result;
});
const resolved = resolveAudioTimeline(scene.audio, rawShots, offset);
const shots: Shot[] = rawShots.map(shot => ({id: shot.id, entry: shot.entry, startFrame: shot.startFrame,
  durationFrames: shot.durationFrames, audio: resolved.shotCues[shot.id]!}));
const Intro = () => <SceneComposition shots={shots} video={project.video} audio={resolved.cues} />;
const Scoped = ({shot}: {shot: Shot}) => <SceneComposition shots={[{...shot, startFrame: 0}]}
  video={project.video} audio={shot.audio} />;
const Root = () => <>
  <Composition id="intro" component={Intro} durationInFrames={offset} fps={fps} width={width} height={height} />
  {shots.map(shot => <Composition key={shot.id} id={shot.id} component={Scoped}
    durationInFrames={shot.durationFrames} fps={fps} width={width} height={height} defaultProps={{shot}} />)}
</>;
registerRoot(Root);
```

In `src/studio/Studio.tsx`, change only `inputProps` to `{shots: scene.shots, video: project.video, audio: scene.audio}`. Do not add Studio-owned `<audio>` elements or timers.
- [ ] **Step 4: Declare audio in `projects/demo/scenes/intro/scene.json`:**

```json
"audio": {"schemaVersion": 1, "cues": [
  {"id": "bed", "src": "assets/audio/bed.wav", "startFrame": 0, "durationFrames": 330,
   "trimOutFrames": 330, "gain": 0.35, "fadeInFrames": 6, "fadeOutFrames": 12},
  {"id": "hit-a", "src": "assets/audio/hit-a.wav", "startFrame": 72, "durationFrames": 20,
   "trimOutFrames": 20, "gain": 0.6}
]}
```

Add to the `diagram` shot:

```json
"audio": [{"id": "hit-b", "src": "assets/audio/hit-b.wav", "startFrame": 15,
  "durationFrames": 24, "trimOutFrames": 20, "gain": 0.6, "loop": true}]
```

Add to the `close` shot:

```json
"audio": [{"id": "muted-bed", "src": "assets/audio/bed.wav", "startFrame": 0,
  "durationFrames": 60, "trimOutFrames": 60, "gain": 0}]
```

This produces two effects overlapping at scene frames 75–91 over the bed; hit-b then loops its 20-frame trimmed interval for four more frames. The title shot remains silent when scoped, while the close shot isolates the zero-gain export path. Preserve the shot counts and `overlapFrames: 0`.
- [ ] **Step 5: Run `bun test tests/studio-browser.test.ts tests/render.test.ts && bun run typecheck && bun run validate`.** Expected: PASS, Studio sees two or three cue elements at frame 78, and visual frame counts remain 330. Investigate any browser autoplay restriction rather than adding a second audio clock.
- [ ] **Step 6: Commit:** `git add src/spike/composition.tsx src/spike/index.tsx src/studio/Studio.tsx projects/demo/scenes/intro/scene.json tests/studio-browser.test.ts && git commit -m "feat: play shared audio timeline in Studio and Remotion"`.

### Task 4: Export safety, integration proof and authoring documentation

**Files:** Modify `scripts/spike.ts`, `tests/studio-browser.test.ts`, `AGENTS.md`, `docs/rendering.md`, `docs/studio.md`; create `scripts/atomic-output.ts`, `tests/audio-export.test.ts`, `docs/audio.md`, `docs/audio-phase2-report.md`.

**Interfaces:** Add `--output <absolute-or-relative-path>` to the existing CLI for isolated export tests, defaulting to the current `output/<id>.mp4`. Existing `.partial-<pid>.mp4` file remains in that output's directory. Export no other behavior changes.

- [ ] **Step 1: Add a failing integration test.** Create `tests/audio-export.test.ts` using the existing Remotion-installed binaries rather than a system FFmpeg:

```ts
import {expect, test} from 'bun:test';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {RenderInternals} from '@remotion/renderer';
import {atomicOutput} from '../scripts/atomic-output';

const cwd = resolve(import.meta.dir, '..');
const executable = (type: 'ffprobe' | 'ffmpeg') => RenderInternals.getExecutablePath({type, indent: false, logLevel: 'error', binariesDirectory: null});
async function run(command: string[], timeout = 120000) {
  const proc = Bun.spawn(command, {cwd, stdout: 'pipe', stderr: 'pipe'});
  const timer = setTimeout(() => proc.kill(), timeout);
  try {
    const [out, err, exit] = await Promise.all([new Response(proc.stdout).arrayBuffer(), new Response(proc.stderr).text(), proc.exited]);
    return {out: Buffer.from(out), err, exit};
  } finally { clearTimeout(timer); }
}
async function streams(path: string) {
  const probe = await run([executable('ffprobe'), '-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames', '-of', 'json', path]);
  expect(probe.exit).toBe(0);
  return JSON.parse(probe.out.toString()).streams as Array<Record<string, string | number>>;
}
async function rms(path: string, start: number, length = 0.16) {
  const result = await run([executable('ffmpeg'), '-v', 'error', '-ss', String(start), '-i', path,
    '-t', String(length), '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-']);
  expect(result.exit).toBe(0);
  let energy = 0;
  for (let index = 0; index < result.out.length; index += 2) energy += result.out.readInt16LE(index) ** 2;
  return Math.sqrt(energy / (result.out.length / 2));
}

test('330-frame MP4 mixes a bed with two concurrent effects and scoped title stays silent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-audio-export-'));
  try {
    const video = join(root, 'intro.mp4');
    const exported = await run(['bun', 'run', 'render', '--output', video], 180000);
    expect(exported.exit).toBe(0);
    const info = await streams(video);
    expect(info.find(stream => stream.codec_type === 'video')).toMatchObject({width: 1920, height: 1080, r_frame_rate: '30/1', nb_read_frames: '330'});
    expect(info.find(stream => stream.codec_type === 'audio')?.codec_name).toBe('aac');
    const bed = await rms(video, 1);
    const hitA = await rms(video, 2.41, 0.06);
    const overlap = await rms(video, 2.6);
    const hitB = await rms(video, 3.13);
    expect(bed).toBeGreaterThan(0);
    expect(hitA).toBeGreaterThan(bed * 2);
    expect(hitB).toBeGreaterThan(bed * 2);
    expect(overlap).toBeGreaterThan(Math.max(hitA, hitB) * 1.15);
    expect(await rms(video, 10.3)).toBeGreaterThan(0);
    const silent = join(root, 'title.mp4');
    expect((await run(['bun', 'run', 'render', '--shot', 'title', '--output', silent], 180000)).exit).toBe(0);
    expect((await streams(silent)).some(stream => stream.codec_type === 'audio')).toBe(false);
    const muted = join(root, 'close.mp4');
    expect((await run(['bun', 'run', 'render', '--shot', 'close', '--output', muted], 180000)).exit).toBe(0);
    if ((await streams(muted)).some(stream => stream.codec_type === 'audio')) expect(await rms(muted, 0.3)).toBe(0);
    await writeFile(video, 'previous-good-output');
    expect((await run(['bun', 'run', 'render', '--shot', 'missing', '--output', video])).exit).not.toBe(0);
    expect(await readFile(video, 'utf8')).toBe('previous-good-output');
  } finally { await rm(root, {recursive: true, force: true}); }
}, 420000);

test('a write-time failure removes only its own partial output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-atomic-test-'));
  try {
    const video = join(root, 'intro.mp4');
    await writeFile(video, 'previous-good-output');
    await expect(atomicOutput(video, async partial => {
      await writeFile(partial, 'unfinished-audio');
      throw new Error('audio encode failed');
    })).rejects.toThrow('audio encode failed');
    expect(await readFile(video, 'utf8')).toBe('previous-good-output');
    expect(await readdir(root)).toEqual(['intro.mp4']);
  } finally { await rm(root, {recursive: true, force: true}); }
});
```
- [ ] **Step 2: Run `bun test tests/audio-export.test.ts`.** Expected: FAIL on unsupported `--output` (or missing audio stream if that flag was added first).
- [ ] **Step 3: Extract only the existing output boundary to `scripts/atomic-output.ts`:**

```ts
import {mkdir, rename, rm, stat} from 'node:fs/promises';
import {dirname, extname} from 'node:path';

export async function atomicOutput(output: string, encode: (partial: string) => Promise<void>): Promise<number> {
  const partial = `${output}.partial-${process.pid}${extname(output)}`;
  try {
    await mkdir(dirname(output), {recursive: true});
    await encode(partial);
    const {size} = await stat(partial);
    if (size === 0) throw new Error(`Empty render: ${partial}`);
    await rename(partial, output);
    return size;
  } finally { await rm(partial, {force: true}); }
}
```

In `scripts/spike.ts`, parse `--output` in the current two-argument flag loop:

```ts
let outputFlag: string | undefined;
else if (flags[index] === '--output' && value) outputFlag = value;
const output = outputFlag ? resolve(outputFlag) : join(resolve(import.meta.dir, '../output'), command === 'still' ? `snaps/${id}-${frame}.png` : `${id}.mp4`);
if (extname(output) !== (command === 'still' ? '.png' : '.mp4')) throw new Error('Output extension must match the command');
```

Replace the current `mkdir`/`renderStill`/`renderMedia`/console-error check/`stat`/`rename` block with the following, keeping the existing composition guard and logging:

```ts
const size = await atomicOutput(output, async temporary => {
  if (command === 'still') await renderStill({serveUrl, composition, frame: frame!, output: temporary, imageFormat: 'png', browserExecutable, onBrowserLog});
  else await renderMedia({serveUrl, composition, codec: 'h264', pixelFormat: 'yuv420p', outputLocation: temporary, browserExecutable, onBrowserLog, concurrency: 2});
  if (errors.length) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
});
```

Import `atomicOutput` from `./atomic-output`; remove now-unused `mkdir`, `rename`, `stat`, and keep `extname` for the output extension guard and `rm` for bundle cleanup. The `finally` block removes only `bundleDir`; `atomicOutput()` removes its own partial on failure or success.
- [ ] **Step 4: Run `bun test tests/audio-export.test.ts` and separately `bun run render`.** Expected: PASS; `output/intro.mp4` contains both visual and audio streams. Inspect streams independently with:

```sh
node_modules/@remotion/compositor-linux-x64-gnu/ffprobe -v error -count_frames -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_read_frames -of json output/intro.mp4
```

Check that the decoded audio is nonzero in each expected window; a stream alone does not prove the mix. Run the browser test again after any playback fix.
- [ ] **Step 5: Update the docs and authoring instructions.** Create `docs/audio.md` with the manifest contract and examples from the approved `docs/superpowers/specs/2026-10-22-deterministic-audio-design.md`, explicitly defining defaults, trimOut exclusivity, scene/shot scope, frame and gain math, loop behavior, local PCM WAV + MP3 codecs, FFprobe and decode-to-null validation, generated-fixture CC0 rights, zero-gain behavior and browser autoplay limits. In `AGENTS.md` add `Audio is declared in scene.audio or each shot's audio list, not in shot HTML; see docs/audio.md.` In `docs/rendering.md` add `bun run render`, `bun run render --shot diagram`, `bun run render --output /path/to/intro.mp4`, explain existing atomic failure and show the FFprobe stream inspection command in Step 4. In `docs/studio.md` replace its no-audio limitation with `Audio follows the Player clock across play, pause, frame seeks and scene switches. Browsers may block autoplay until the user interacts.` Create `docs/audio-phase2-report.md` after tests: record exact commands and observed results (tests, typecheck, validate, MP4 streams, audible windows, silent shot, browser test) and any failed/unperformed checks without claims of sample precision or cross-machine identity. Do not prefill results before running them.
- [ ] **Step 6: Run `bun test`, `bun run typecheck`, `bun run validate`, `bun run render`, plus `bun run render --shot title --output /tmp/opencode/framecraft-phase2-silent.mp4`.** Expected: all commands succeed, default 330-frame MP4 contains audio, scoped title MP4 has no audio. Open Studio in a real browser with `agent-browser` for a seek/play/pause/scene-switch check; capture a screenshot only if UI changes. Confirm no lingering `/tmp/framecraft-bundle-*` or `/tmp/framecraft-studio-*` from these runs and check `git status --short` without touching unrelated files.
- [ ] **Step 7: Commit only Phase 2 files:** `git add AGENTS.md docs/audio.md docs/audio-phase2-report.md docs/rendering.md docs/studio.md scripts/spike.ts scripts/atomic-output.ts tests/audio-export.test.ts tests/studio-browser.test.ts && git commit -m "test: verify audio export and document authoring"`.

## Self-review checklist

- Schema, integer timing, scene/shot scope, trim/loop/gain/fades and open mixing: Task 1.
- Local files, formats, codecs, metadata, safe paths, licensing: Task 2.
- One Remotion composition for Studio/export and existing shot API: Task 3.
- Export mix, unchanged silent path, output preservation, browser playback, full 330-frame verification, docs/report: Task 4.
- No dependency additions; renderer-owned bundled FFprobe is for metadata only because `getVideoMetadata()` rejects audio-only WAV; binary path comes from pinned `RenderInternals` and must be revisited if Remotion is upgraded.
