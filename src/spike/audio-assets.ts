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
  if (info.streams?.length !== 1 || codecs?.length !== 1 || !(extension === '.wav' ? codecs[0]?.startsWith('pcm_') : codecs[0] === 'mp3')) {
    throw new Error(`unsupported audio codec in ${path}`);
  }
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
