import {expect, test} from 'bun:test';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {RenderInternals} from '@remotion/renderer';
import {atomicOutput} from '../scripts/atomic-output';

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
    'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames', '-of', 'json', path]);
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
