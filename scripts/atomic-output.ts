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
