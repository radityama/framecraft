import {lstat, mkdir, realpath, rename, rm, stat} from 'node:fs/promises';
import {basename, dirname, extname, isAbsolute, join, relative, sep} from 'node:path';

export async function assertOutsideProject(output: string, root: string): Promise<void> {
  let ancestor = dirname(output);
  const suffix = [basename(output)];
  while (true) {
    try { await lstat(ancestor); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(ancestor) === ancestor) throw error;
      suffix.unshift(basename(ancestor));
      ancestor = dirname(ancestor);
    }
  }
  const rel = relative(root, join(await realpath(ancestor), ...suffix));
  if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw new Error('Output cannot be inside project');
}

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
