import {writeFile} from 'node:fs/promises';

const rate = 24000;

async function wave(name: string, seconds: number, sample: (time: number) => number) {
  const count = Math.round(rate * seconds);
  const data = Buffer.alloc(44 + count * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(count * 2, 40);
  for (let index = 0; index < count; index++) {
    data.writeInt16LE(Math.round(32767 * sample(index / rate)), 44 + index * 2);
  }
  await writeFile(new URL(name, import.meta.url), data);
}

await wave('hum.wav', 1, time => 0.12 * (Math.sin(2 * Math.PI * 120 * time) + 0.5 * Math.sin(2 * Math.PI * 180 * time)));
await wave('tap.wav', 0.4, time => 0.4 * Math.exp(-18 * time) * Math.sin(2 * Math.PI * 420 * time));
