import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {RenderInternals} from '@remotion/renderer';
import {cueGain} from '../spike/audio';
import type {Scene, StudioProject} from '../spike/project';
import type {Plan} from './contracts';

const sampleRate = 48000;
export type MediaVerification = {
  schemaVersion: 1; sha256: string; bytes: number; decoded: true;
  video: {codec: string; pixelFormat: string; width: number; height: number; fps: number; frames: number; durationSeconds: number};
  audio: {present: boolean; codec: string | null; channels: number; sampleRate: number; peak: number; rms: number;
    cues: Array<{id: string; expectedFrame: number; correlation: number; offsetFrames: number}>;
    quiet: Array<{startFrame: number; endFrame: number; rms: number}>};
};
export function binary(type: 'ffmpeg' | 'ffprobe'): string {
  return RenderInternals.getExecutablePath({type, indent: false, logLevel: 'error', binariesDirectory: null});
}
async function command(args: string[]): Promise<Buffer> {
  const proc = Bun.spawn(args, {stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).arrayBuffer(), new Response(proc.stderr).text(), proc.exited]);
  if (exit !== 0) throw new Error(`media command failed (${exit}): ${stderr.slice(-4000)}`);
  return Buffer.from(stdout);
}
async function pcm(path: string): Promise<{mono: Float64Array; energy: Float64Array; peak: number; rms: number}> {
  const wav = await command([binary('ffmpeg'), '-v', 'error', '-xerror', '-i', path, '-vn', '-ac', '2', '-ar', String(sampleRate), '-c:a', 'pcm_s16le', '-f', 'wav', '-']);
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('malformed decoded WAV');
  let bytes: Buffer = Buffer.alloc(0);
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4), start = offset + 8;
    if (wav.toString('ascii', offset, offset + 4) === 'data') {bytes = wav.subarray(start, Math.min(wav.length, start + size)); break;}
    offset = start + size + (size % 2);
  }
  if (!bytes.length || bytes.length % 4) throw new Error('empty or malformed decoded audio');
  const mono = new Float64Array(bytes.length / 4), energy = new Float64Array(mono.length); let peak = 0; let sum = 0;
  for (let i = 0; i < mono.length; i++) {
    const left = bytes.readInt16LE(i * 4) / 32768, right = bytes.readInt16LE(i * 4 + 2) / 32768;
    mono[i] = (left + right) / 2; peak = Math.max(peak, Math.abs(left), Math.abs(right)); energy[i] = (left * left + right * right) / 2; sum += energy[i]!;
  }
  return {mono, energy, peak, rms: Math.sqrt(sum / mono.length)};
}
function rms(samples: Float64Array, start: number, end: number): number {
  const a = Math.max(0, Math.round(start)), b = Math.min(samples.length, Math.round(end)); let sum = 0;
    for (let i = a; i < b; i++) sum += samples[i]!;
  return Math.sqrt(sum / Math.max(1, b - a));
}
export function correlate(reference: Float64Array, actual: Float64Array, expectedSample: number, samplesPerFrame: number): {correlation: number; offsetFrames: number} {
  let best = -1, offset = 0;
  const length = reference.length, stride = Math.max(4, Math.ceil(length / 20000) * 4);
  // Sample the whole cue, with bounded correlation work and sub-millisecond lag steps.
  for (let lag = -Math.round(samplesPerFrame * 2); lag <= samplesPerFrame * 2; lag += 4) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i < length; i += stride) {
      const x = reference[i]!, y = actual[expectedSample + lag + i] ?? 0;
      xy += x * y; xx += x * x; yy += y * y;
    }
    const score = xy / Math.sqrt(Math.max(1e-30, xx * yy));
    if (score > best) { best = score; offset = lag; }
  }
  return {correlation: best, offsetFrames: offset / samplesPerFrame};
}
export async function verifyMedia(path: string, root: string, project: StudioProject, scene: Scene, plan: Plan): Promise<MediaVerification> {
  const size = (await stat(path)).size;
  if (size <= 0) throw new Error('empty export');
  const probe = JSON.parse((await command([binary('ffprobe'), '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', path])).toString());
  const streams: Array<Record<string, string | number>> = probe.streams;
  if (!Array.isArray(streams)) throw new Error('missing media streams');
  const videos = streams.filter(s => s.codec_type === 'video'), audios = streams.filter(s => s.codec_type === 'audio');
  if (videos.length !== 1 || streams.length !== videos.length + audios.length || audios.length > 1) throw new Error('unexpected media stream layout');
  const v = videos[0]!, expected = scene.durationFrames / project.video.fps;
  const [num, den] = String(v.r_frame_rate).split('/').map(Number), fps = num! / den!;
  if (![fps, Number(v.duration), Number(v.start_time)].every(Number.isFinite)) throw new Error('invalid video timing metadata');
  if (v.codec_name !== 'h264' || v.pix_fmt !== 'yuv420p' || v.width !== project.video.width || v.height !== project.video.height || Math.abs(fps - project.video.fps) > 1e-8 || Number(v.nb_read_frames) !== scene.durationFrames || Math.abs(Number(v.duration) - expected) > 0.5 / fps || Math.abs(Number(v.start_time)) > 0.001)
    throw new Error('video metadata/frame count differs from manifest');
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration < expected - 0.5 / fps || duration > expected + 0.1) throw new Error('container duration differs from manifest');
  const needsAudio = scene.audio.length > 0;
  if (audios.length !== Number(needsAudio)) throw new Error(needsAudio ? 'required final audio stream missing' : 'unexpected audio in silent export');
  if (needsAudio) {
    const a = audios[0]!;
    if (![Number(a.duration), Number(a.start_time)].every(Number.isFinite)) throw new Error('invalid audio timing metadata');
    if (a.codec_name !== 'aac' || Number(a.channels) !== 2 || Number(a.sample_rate) !== sampleRate || Math.abs(Number(a.start_time)) > 1 / fps || Number(a.duration) < expected - 2 / fps || Number(a.duration) > expected + 0.1) throw new Error('audio codec/layout/timing differs from production contract');
  }
  await command([binary('ffmpeg'), '-v', 'error', '-xerror', '-i', path, '-c:v', 'rawvideo', '-c:a', 'pcm_s16le', '-f', 'null', '-']);
  const audio: MediaVerification['audio'] = {present: needsAudio, codec: needsAudio ? 'aac' : null, channels: needsAudio ? 2 : 0, sampleRate: needsAudio ? sampleRate : 0, peak: 0, rms: 0, cues: [], quiet: []};
  if (needsAudio) {
    const decoded = await pcm(path); audio.peak = decoded.peak; audio.rms = decoded.rms;
    if (audio.peak >= 0.95 || audio.peak < 0.0001) throw new Error('decoded audio is clipped/over-level or silent');
    const sources = new Map<string, Float64Array>();
    const spf = sampleRate / fps;
    for (const cue of scene.audio) {
      let source = sources.get(cue.src);
      if (!source) { source = (await pcm(join(root, cue.src))).mono; sources.set(cue.src, source); }
      const length = Math.round(cue.durationFrames * spf), trimStart = Math.round(cue.trimInFrames * spf), sourceLength = Math.round((cue.trimOutFrames - cue.trimInFrames) * spf);
      const reference = new Float64Array(length);
      for (let i = 0; i < reference.length; i++) reference[i] = (source[trimStart + (cue.loop ? i % sourceLength : i)] ?? 0) * cueGain(cue, Math.floor(i / spf));
      const match = correlate(reference, decoded.mono, Math.round(cue.startFrame * spf), spf);
      if (match.correlation < 0.45 || Math.abs(match.offsetFrames) > 1) throw new Error(`cue missing or out of sync: ${cue.id} (correlation ${match.correlation.toFixed(3)}, offset ${match.offsetFrames.toFixed(3)} frames)`);
      audio.cues.push({id: cue.id, expectedFrame: cue.startFrame, ...match});
    }
    for (const q of plan.quiet) {
      const level = rms(decoded.energy, q.startFrame * spf, q.endFrame * spf);
      if (level > 0.001) throw new Error(`planned quiet interval is not quiet: ${q.startFrame}-${q.endFrame}`);
      audio.quiet.push({startFrame: q.startFrame, endFrame: q.endFrame, rms: level});
    }
    const allowed = new Uint8Array(decoded.mono.length);
    for (const cue of scene.audio) allowed.fill(1, Math.max(0, Math.floor((cue.startFrame - 2) * spf)), Math.min(allowed.length, Math.ceil((cue.startFrame + cue.durationFrames + 2) * spf)));
    let unexplained = 0, count = 0;
    for (let i = 0; i < allowed.length; i++) if (!allowed[i]) { unexplained += decoded.energy[i]!; count++; }
    if (count && Math.sqrt(unexplained / count) > 0.001) throw new Error('unplanned audio outside cue timeline');
  }
  return {schemaVersion: 1, sha256: createHash('sha256').update(await readFile(path)).digest('hex'), bytes: size, decoded: true,
    video: {codec: 'h264', pixelFormat: 'yuv420p', ...project.video, fps, frames: scene.durationFrames, durationSeconds: Number(v.duration)}, audio};
}
