import {expect, test} from 'bun:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {binary, correlate, verifyMedia} from '../src/production/media';
import {synthesize} from '../projects/production-desktop/production/synthesize';
import type {Plan} from '../src/production/contracts';
import type {StudioProject} from '../src/spike/project';

async function ffmpeg(args: string[]) {
  const proc = Bun.spawn([binary('ffmpeg'), '-v', 'error', '-y', ...args], {stdout: 'pipe', stderr: 'pipe'});
  const [stderr, exit] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (exit) throw new Error(stderr);
}
test('final media gate decodes real video, detects absent/muted/shifted audio and accepts deliberate silence', async () => {
  const root = await mkdtemp('/tmp/opencode/production-media-');
  const cue = {id: 'contact', src: 'contact.wav', startFrame: 6, durationFrames: 3, trimInFrames: 0, trimOutFrames: 3, gain: .3, fadeInFrames: 0, fadeOutFrames: 0, loop: false};
  const scene = {id: 'scene', title: 'Scene', shots: [{id: 'shot', entry: 'shot.html', startFrame: 0, durationFrames: 30, audio: []}], durationFrames: 30, audio: [cue]};
  const project: StudioProject = {id: 'fixture', title: 'Fixture', video: {width: 64, height: 64, fps: 30}, scenes: [scene]};
  const plan = {quiet: [{startFrame: 15, endFrame: 30, reason: 'Intentional quiet'}]} as Plan;
  try {
    const contact = synthesize('contact', 3, 'press', 101);
    await writeFile(join(root, 'contact.wav'), contact);
    const silent = join(root, 'silent.mp4');
    const image = join(root, 'pixel.png'); await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
    await ffmpeg(['-loop', '1', '-i', image, '-vf', 'scale=64:64', '-r', '30', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silent]);
    expect((await verifyMedia(silent, root, project, {...scene, audio: []}, plan)).audio.present).toBe(false);
    await expect(verifyMedia(silent, root, project, scene, plan)).rejects.toThrow('audio stream missing');
    async function mux(name: string, delay: number, volume: number) {
      const out = join(root, `${name}.mp4`);
      const wav = Buffer.alloc(44 + 48000 * 2); contact.copy(wav, 0, 0, 44); wav.writeUInt32LE(wav.length - 8, 4); wav.writeUInt32LE(wav.length - 44, 40);
      const offset = Math.round(delay * 48);
      for (let i = 0; i < (contact.length - 44) / 2 && offset + i < 48000; i++) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(contact.readInt16LE(44 + i * 2) * volume))), 44 + (offset + i) * 2);
      const audio = join(root, `${name}.wav`); await writeFile(audio, wav);
      await ffmpeg(['-i', silent, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-ac', '2', '-ar', '48000', '-t', '1', out]);
      return out;
    }
    const good = await mux('good', 200, .3), verified = await verifyMedia(good, root, project, scene, plan);
    expect(verified).toMatchObject({decoded: true, video: {frames: 30, fps: 30}, audio: {present: true, codec: 'aac'}});
    expect(verified.audio.cues[0]!.correlation).toBeGreaterThan(.8);
    expect(Math.abs(verified.audio.cues[0]!.offsetFrames)).toBeLessThan(.1);
    await expect(verifyMedia(good, root, project, {...scene, audio: []}, plan)).rejects.toThrow('silent');
    await expect(verifyMedia(await mux('muted', 200, 0), root, project, scene, plan)).rejects.toThrow('silent');
    await expect(verifyMedia(await mux('shifted', 250, .3), root, project, scene, plan)).rejects.toThrow('sync');
    await expect(verifyMedia(await mux('loud', 200, 50), root, project, scene, plan)).rejects.toThrow('clipped');
    await expect(verifyMedia(good, root, {...project, video: {...project.video, width: 128}}, scene, plan)).rejects.toThrow('metadata');
    const truncated = join(root, 'truncated.mp4'); await writeFile(truncated, (await readFile(good)).subarray(0, 200));
    await expect(verifyMedia(truncated, root, project, scene, plan)).rejects.toThrow();
    const a = Float64Array.from({length: 500}, (_, i) => Math.sin(i * 1.17) * Math.exp(-i / 100)), b = new Float64Array(2000); b.set(a, 400);
    expect(correlate(a, b, 400, 100).offsetFrames).toBe(0);
  } finally {await rm(root, {recursive: true, force: true});}
}, 120000);
