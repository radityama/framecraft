import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const rate = 48000, fps = 30;
const definitions = [
  ['open-press', 3, 'press', 101], ['open-release', 3, 'release', 211],
  ['typing', 52, 'key', 307], ['confirm', 4, 'key', 419],
  ['grip-press', 2, 'press', 521], ['grab', 5, 'grab', 631],
  ['drag', 67, 'drag', 743], ['grip-release', 2, 'release', 857],
  ['drop', 8, 'drop', 967], ['camera-paper', 12, 'transition', 1087],
] as const;
export const typingFrames = [0, 4, 9, 14, 20, 24, 29, 34, 38, 44, 49];
function random(seed: number) {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296 * 2 - 1; };
}
function contact(length: number, seed: number, body: number, brightness: number): Float64Array {
  const result = new Float64Array(length), noise = random(seed); let low = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate, n = noise(); low += brightness * (n - low);
    const attack = 1 - Math.exp(-t / 0.0007);
    const grain = (n - low * 0.7) * Math.exp(-t / 0.010) * 0.28;
    const mass = (Math.sin(t * body * Math.PI * 2) + 0.3 * Math.sin(t * body * 2.71 * Math.PI * 2)) * Math.exp(-t / 0.022) * 0.19;
    result[i] = attack * (grain + mass);
  }
  return result;
}
export function synthesize(name: string, frames: number, category: string, seed: number): Buffer {
  const samples = new Float64Array(Math.round(frames * rate / fps));
  if (category === 'drag' || category === 'transition') {
    const noise = random(seed); let low = 0, slower = 0;
    for (let i = 0; i < samples.length; i++) {
      const p = i / (samples.length - 1), t = i / rate, n = noise(); low += 0.18 * (n - low); slower += 0.03 * (low - slower);
      const velocity = Math.sin(Math.PI * p) ** (category === 'drag' ? 0.7 : 1.4);
      samples[i] = (low - slower) * velocity * (category === 'drag' ? 0.20 : 0.45) * (0.8 + 0.2 * Math.sin(t * 47 + Math.sin(t * 13)));
    }
  } else if (name === 'typing') {
    typingFrames.forEach((frame, index) => {
      const click = contact(Math.round(rate * 0.085), seed + index * 37, 180 + (index * 43) % 170, 0.2 + index % 3 * 0.08);
      const offset = frame * rate / fps;
      for (let i = 0; i < click.length && offset + i < samples.length; i++) samples[offset + i] += click[i]! * (0.65 + (index % 4) * 0.06);
    });
  } else {
    const body = category === 'drop' ? 125 : category === 'grab' ? 155 : category === 'release' ? 390 : name === 'confirm' ? 175 : 230 + seed % 60;
    samples.set(contact(samples.length, seed, body, category === 'release' ? 0.55 : 0.23));
    if (category === 'drop') {
      const secondary = contact(Math.round(rate * 0.04), seed + 11, 190, 0.15), offset = Math.round(rate * 0.045);
      for (let i = 0; i < secondary.length; i++) samples[offset + i] += secondary[i]! * 0.22;
    }
  }
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const edge = Math.min(1, i / 32, (samples.length - 1 - i) / 240);
    samples[i] *= edge; peak = Math.max(peak, Math.abs(samples[i]!));
  }
  assert(peak > 0.001 && peak < 0.8, `invalid synthesis level: ${name}`);
  assert(samples[0] === 0 && samples[samples.length - 1] === 0);
  // One silent sample keeps FFprobe's decimal duration rounding above the frame boundary.
  const wav = Buffer.alloc(44 + (samples.length + 1) * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE((samples.length + 1) * 2, 40);
  for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i]! * 32767), 44 + i * 2);
  return wav;
}
async function main() {
  const flags = Bun.argv.slice(2);
  if (flags.length && (flags.length !== 2 || flags[0] !== '--output' || !flags[1])) throw new Error('Usage: bun production/synthesize.ts [--output <directory>]');
  const output = flags[1] ? resolve(flags[1]) : resolve(import.meta.dir, '../assets/audio');
  await mkdir(output, {recursive: true});
  const assets = [];
  for (const [name, frames, category, seed] of definitions) {
    const wav = synthesize(name, frames, category, seed);
    await writeFile(join(output, `${name}.wav`), wav);
    assets.push({src: `assets/audio/${name}.wav`, category, sha256: createHash('sha256').update(wav).digest('hex'),
      provenance: {kind: 'original-synthesis', author: 'Framecraft acceptance exercise', license: 'CC0-1.0, original generated PCM released for reuse', recipe: 'production/synthesize.ts'}});
  }
  await writeFile(join(output, 'asset-index.json'), JSON.stringify(assets, null, 2) + '\n');
  console.log(`Generated ${assets.length} original, seeded contact/friction sounds at ${output}`);
}
if (import.meta.main) await main();
