import {expect, test} from 'bun:test';
import {copyFile, mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {RenderInternals} from '@remotion/renderer';
import {loadProject, loadStudioProject} from '../src/spike/project';
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
    {id: 'a', entry: 'shots/a.html', durationFrames: 60, overlapFrames: 0, audio: [] as unknown[]},
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

test('validates scene and shot audio for both loaders and checks source frames', async () => {
  const data = await fixture();
  try {
    const loaded = await loadProject(data.root);
    expect(loaded.audio.map(cue => [cue.id, cue.startFrame])).toEqual([['bed', 0], ['effect', 72], ['b:hit', 75]]);
    expect(loaded.shots[1]?.audio?.map(cue => [cue.id, cue.startFrame])).toEqual([['hit', 15]]);
    expect((await loadStudioProject(data.root)).scenes[0]?.audio).toEqual(loaded.audio);
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
    await expect(loadStudioProject(data.root)).rejects.toThrow(/bed.*missing.wav/);
    data.scene.audio.cues[0]!.src = bed.src;
    data.project.audio.push(bed);
    await data.save();
    await expect(loadProject(data.root)).rejects.toThrow('project.audio');
  } finally { await rm(data.root, {recursive: true, force: true}); }
});

test('rejects traversal, symlink escapes, unsupported media and invalid codec', async () => {
  const data = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'framecraft-audio-outside-'));
  try {
    await copyFile(join(assets, 'bed.wav'), join(outside, 'sound.wav'));
    await symlink(join(outside, 'sound.wav'), join(data.root, 'assets/audio/link.wav'));
    await writeFile(join(data.root, 'assets/audio/sound.ogg'), 'not audio');
    for (const src of ['../outside.wav', 'assets/audio/link.wav', 'assets/audio/sound.ogg']) {
      data.scene.audio.cues[0]!.src = src;
      await data.save();
      await expect(loadProject(data.root)).rejects.toThrow(/bed.*(escapes|project file|unsupported)/i);
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

test('accepts an MP3 with embedded cover art', async () => {
  const data = await fixture();
  try {
    const cover = resolve(import.meta.dir, '../docs/screenshots/studio-phone.png');
    const mp3 = join(data.root, 'assets/audio/covered.mp3');
    const binary = RenderInternals.getExecutablePath({type: 'ffmpeg', indent: false, logLevel: 'error', binariesDirectory: null});
    const process = Bun.spawn([binary, '-v', 'error', '-i', join(assets, 'hit-a.mp3'), '-i', cover,
      '-map', '0:a', '-map', '1:v', '-c:a', 'copy', '-c:v', 'png', '-disposition:v', 'attached_pic', '-y', mp3], {stderr: 'pipe'});
    const [error, exit] = await Promise.all([new Response(process.stderr).text(), process.exited]);
    expect(error).toBe('');
    expect(exit).toBe(0);
    await expect(probeAudioFrames(mp3, 30)).resolves.toBeGreaterThanOrEqual(20);
    data.scene.audio.cues[1]!.src = 'assets/audio/covered.mp3';
    await data.save();
    expect((await loadProject(data.root)).audio[1]?.src).toBe('assets/audio/covered.mp3');
  } finally { await rm(data.root, {recursive: true, force: true}); }
});

test('audio asset errors identify the scene when cue ids are reused', async () => {
  const data = await fixture();
  try {
    await mkdir(join(data.root, 'scenes/second/shots'), {recursive: true});
    await writeFile(join(data.root, 'scenes/second/shots/a.html'), '<!doctype html>');
    await writeFile(join(data.root, 'scenes/second/scene.json'), JSON.stringify({id: 'second', shots: [
      {id: 'a', entry: 'shots/a.html', durationFrames: 330, overlapFrames: 0},
    ], audio: {schemaVersion: 1, cues: [{...bed, src: 'assets/audio/missing.wav'}]}}));
    data.project.scenes.push({id: 'second', path: 'scenes/second/scene.json'});
    await data.save();
    await expect(loadStudioProject(data.root)).rejects.toThrow(/scene second.*audio cue bed.*missing\.wav/);
    await writeFile(join(data.root, 'scenes/second/scene.json'), JSON.stringify({id: 'second', shots: [
      {id: 'a', entry: 'shots/a.html', durationFrames: 330, overlapFrames: 0},
    ], audio: {schemaVersion: 1, cues: [{...bed, trimOutFrames: 331}]}}));
    await expect(loadStudioProject(data.root)).rejects.toThrow(/scene second.*audio cue bed.*331.*330/);
  } finally { await rm(data.root, {recursive: true, force: true}); }
});

test('legacy empty audio stays silent and shot cues require a versioned scene timeline', async () => {
  const data = await fixture();
  try {
    data.scene.shots[1]!.audio = [];
    await writeFile(join(data.root, 'scenes/intro/scene.json'), JSON.stringify({...data.scene, audio: []}));
    expect((await loadProject(data.root)).audio).toEqual([]);
    expect((await loadStudioProject(data.root)).scenes[0]?.shots[1]?.audio).toEqual([]);
    data.scene.shots[1]!.audio = [{id: 'hit', src: bed.src, startFrame: 15, durationFrames: 5, trimOutFrames: 5}];
    await writeFile(join(data.root, 'scenes/intro/scene.json'), JSON.stringify({...data.scene, audio: []}));
    await expect(loadProject(data.root)).rejects.toThrow('schemaVersion');
  } finally { await rm(data.root, {recursive: true, force: true}); }
});
