import {createHash} from 'node:crypto';
import {link, mkdir, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import type {ReviewFrame} from './frames';
import {validatePng, type ReviewCapture} from './artifacts';

export async function captureFrames(frames: ReviewFrame[], output: string,
  render: (frame: ReviewFrame, partialPath: string) => Promise<void>): Promise<ReviewCapture[]> {
  await mkdir(join(output, 'screenshots'), {recursive: true});
  const captures: ReviewCapture[] = [];
  let failed = false;
  for (const frame of frames) {
    if (failed) {
      captures.push({...frame, status: 'failed', error: 'skipped after prior capture failure'});
      continue;
    }
    const destination = join(output, frame.path);
    const partial = `${destination}.partial-${process.pid}.png`;
    try {
      await render(frame, partial);
      const bytes = await readFile(partial);
      await validatePng(partial, bytes);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await link(partial, destination);
      captures.push({...frame, status: 'captured', sha256});
    } catch (error) {
      failed = true;
      captures.push({...frame, status: 'failed', error: String(error)});
    } finally { await rm(partial, {force: true}); }
  }
  return captures;
}
