import {expect, test} from 'bun:test';
import {mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {RenderInternals} from '@remotion/renderer';
import {assertOutsideProject, atomicOutput} from '../scripts/atomic-output';

const cwd = resolve(import.meta.dir, '..');
const executable = (type: 'ffprobe' | 'ffmpeg') => RenderInternals.getExecutablePath({type, indent: false, logLevel: 'error', binariesDirectory: null});

async function run(command: string[], timeout = 240000) {
  const proc = Bun.spawn(command, {cwd, stdout: 'pipe', stderr: 'pipe'});
  const timer = setTimeout(() => proc.kill(), timeout);
  try {
    const [out, err, exit] = await Promise.all([new Response(proc.stdout).arrayBuffer(), new Response(proc.stderr).text(), proc.exited]);
    return {out: Buffer.from(out), err, exit};
  } finally { clearTimeout(timer); }
}

async function streams(path: string) {
  const probe = await run([executable('ffprobe'), '-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', path]);
  expect(probe.exit).toBe(0);
  return JSON.parse(probe.out.toString()).streams as Array<Record<string, string | number>>;
}

async function samples(path: string, start: number, length = 0.08) {
  const decoded = await run([executable('ffmpeg'), '-v', 'error', '-ss', String(start), '-i', path,
    '-t', String(length), '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 'wav', '-']);
  expect(decoded.err).toBe('');
  expect(decoded.exit).toBe(0);
  expect(decoded.out.toString('ascii', 0, 4)).toBe('RIFF');
  const data = decoded.out.indexOf('data', 12) + 8;
  expect(data).toBeGreaterThan(8);
  const count = (decoded.out.length - data) / 2;
  expect(count).toBeGreaterThan(0);
  return Array.from({length: count}, (_, i) => decoded.out.readInt16LE(data + i * 2));
}

async function tones(path: string, start: number, length = 0.08) {
  const decoded = await samples(path, start, length);
  return [110, 165, 440, 740].map(frequency => {
    let sin = 0;
    let cos = 0;
    for (let i = 0; i < decoded.length; i++) {
      const sample = decoded[i]!;
      const phase = 2 * Math.PI * frequency * i / 48000;
      sin += sample * Math.sin(phase);
      cos += sample * Math.cos(phase);
    }
    return 2 * Math.hypot(sin, cos) / decoded.length;
  });
}

test('330-frame MP4 contains distinguishable bed, concurrent effects, loop and fade; scoped shots isolate audio', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-audio-export-'));
  try {
    const video = join(root, 'intro.mp4');
    const exported = await run(['bun', 'run', 'render', '--output', video]);
    expect(exported.exit).toBe(0);
    const info = await streams(video);
    expect(info.find(stream => stream.codec_type === 'video')).toMatchObject({codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1', nb_read_frames: '330'});
    expect(info.find(stream => stream.codec_type === 'audio')?.codec_name).toBe('aac');

    const bed = await tones(video, 1);
    const hitA = await tones(video, 2.4, 0.07);
    const overlap = await tones(video, 2.65);
    const hitB = await tones(video, 3.09, 0.06);
    const loop = await tones(video, 3.22, 0.06);
    const fullBed = await tones(video, 10.35);
    const fadedBed = await tones(video, 10.88, 0.06);
    expect(bed[0]!).toBeGreaterThan(100);
    expect(bed[2]!).toBeLessThan(hitA[2]! / 8);
    expect(bed[3]!).toBeLessThan(hitB[3]! / 8);
    expect(hitA[2]!).toBeGreaterThan(bed[2]! * 8);
    expect(hitA[3]!).toBeLessThan(overlap[3]! / 8);
    expect(overlap[2]!).toBeGreaterThan(bed[2]! * 8);
    expect(overlap[3]!).toBeGreaterThan(bed[3]! * 8);
    expect(hitB[2]!).toBeLessThan(overlap[2]! / 8);
    expect(hitB[3]!).toBeGreaterThan(bed[3]! * 8);
    expect(loop[3]!).toBeGreaterThan(bed[3]! * 8);
    expect(fadedBed[0]!).toBeGreaterThan(0);
    expect(fadedBed[0]!).toBeLessThan(fullBed[0]! * 0.5);

    const title = join(root, 'title.mp4');
    expect((await run(['bun', 'run', 'render', '--shot', 'title', '--output', title])).exit).toBe(0);
    expect((await streams(title)).some(stream => stream.codec_type === 'audio')).toBe(false);
    const close = join(root, 'close.mp4');
    expect((await run(['bun', 'run', 'render', '--shot', 'close', '--output', close])).exit).toBe(0);
    if ((await streams(close)).some(stream => stream.codec_type === 'audio')) {
      expect((await samples(close, 0.3)).every(value => value === 0)).toBe(true);
    }

    await writeFile(video, 'previous-good-output');
    expect((await run(['bun', 'run', 'render', '--shot', 'missing', '--output', video])).exit).not.toBe(0);
    expect(await readFile(video, 'utf8')).toBe('previous-good-output');
  } finally { await rm(root, {recursive: true, force: true}); }
}, 900000);

test('a failure after writing a partial leaves the prior target unchanged', async () => {
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

test('export requires a scene for multi-scene projects and accepts explicit demo selection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-export-scenes-'));
  try {
    for (const id of ['first', 'second']) {
      await mkdir(join(root, 'scenes', id, 'shots'), {recursive: true});
      await writeFile(join(root, 'scenes', id, 'shots', 'shared.html'), '<!doctype html>');
      await writeFile(join(root, 'scenes', id, 'scene.json'), JSON.stringify({id, shots: [{id: 'shared', entry: 'shots/shared.html', durationFrames: 1, overlapFrames: 0}], audio: []}));
    }
    await writeFile(join(root, 'project.json'), JSON.stringify({schemaVersion: 1, id: 'fixture', video: {width: 640, height: 360, fps: 24}, scenes: ['first', 'second'].map(id => ({id, path: `scenes/${id}/scene.json`})), audio: []}));
    const ambiguous = await run(['bun', 'run', 'snap', '--project', root, '--frame', '0', '--output', join(root, 'ambiguous.png')]);
    expect(ambiguous.exit).not.toBe(0);
    expect(ambiguous.err).toContain('scene');

    const output = join(root, 'title.png');
    const selected = await run(['bun', 'run', 'snap', '--project', 'projects/demo', '--scene', 'intro', '--shot', 'title', '--frame', '0', '--output', output]);
    expect(selected.exit).toBe(0);
    expect((await readFile(output)).toString('hex', 0, 8)).toBe('89504e470d0a1a0a');
  } finally { await rm(root, {recursive: true, force: true}); }
}, 120000);

test('selected showcase scenes export only their own timed cues, and shot export omits the bed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-showcase-audio-'));
  const energy = async (path: string, start: number) => {
    const values = await samples(path, start, 0.08);
    return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  };
  try {
    const paths: Record<string, string> = {};
    for (const scene of ['pulse', 'signal']) {
      const output = join(root, `${scene}.mp4`);
      paths[scene] = output;
      const result = await run(['bun', 'run', 'render', '--project', 'projects/showcase', '--scene', scene, '--output', output]);
      expect(result.exit).toBe(0);
      const info = await streams(output);
      const video = info.find(stream => stream.codec_type === 'video')!;
      expect(video).toMatchObject({codec_name: 'h264', width: 960, height: 540, r_frame_rate: '30/1', nb_read_frames: '96'});
      expect(Number(video.duration)).toBeCloseTo(3.2, 3);
      expect(info.find(stream => stream.codec_type === 'audio')?.codec_name).toBe('aac');
    }
    // The first hit is at frame 0 in pulse and frame 18 in signal.
    expect(await energy(paths.pulse!, 0.03)).toBeGreaterThan(await energy(paths.signal!, 0.03) * 2);
    expect(await energy(paths.signal!, 0.63)).toBeGreaterThan(await energy(paths.pulse!, 0.63) * 1.2);
    const shot = join(root, 'carrier.mp4');
    expect((await run(['bun', 'run', 'render', '--project', 'projects/showcase', '--scene', 'signal', '--shot', 'carrier', '--output', shot])).exit).toBe(0);
    const shotVideo = (await streams(shot)).find(stream => stream.codec_type === 'video')!;
    expect(shotVideo.nb_read_frames).toBe('48');
    expect(Number(shotVideo.duration)).toBeCloseTo(1.6, 3);
    expect(await energy(shot, 0.2)).toBeLessThan(2);
    expect(await energy(shot, 0.63)).toBeGreaterThan(100);
  } finally { await rm(root, {recursive: true, force: true}); }
}, 600000);

test('output guard rejects project paths and symlink aliases before writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-output-guard-'));
  try {
    const project = join(root, 'project');
    await mkdir(project);
    await symlink(project, join(root, 'alias'));
    await expect(assertOutsideProject(join(project, 'new/nested/out.png'), project)).rejects.toThrow('inside project');
    await expect(assertOutsideProject(join(root, 'alias/new/out.json'), project)).rejects.toThrow('inside project');
    await expect(assertOutsideProject(join(root, 'outside/out.mp4'), project)).resolves.toBeUndefined();
    expect(await readdir(project)).toEqual([]);
  } finally { await rm(root, {recursive: true, force: true}); }
});
