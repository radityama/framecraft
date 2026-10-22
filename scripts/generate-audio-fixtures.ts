import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {RenderInternals} from '@remotion/renderer';

const root = resolve(import.meta.dir, '../projects/demo/assets/audio');
const rate = 48000;

async function wave(name: string, samples: number, frequencies: number[], amplitude: number) {
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + samples * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    const sample = frequencies.reduce((sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * index / rate), 0) / frequencies.length;
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
