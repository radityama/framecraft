import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {mkdir, mkdtemp, rename, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join, extname} from 'node:path';
import {loadProject} from '../src/spike/project';

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  if (!['still', 'render'].includes(command || '')) throw new Error('Expected still or render');
  let shotId: string | undefined;
  let frame: number | undefined;
  for (let index = 0; index < flags.length; index += 2) {
    const value = flags[index + 1];
    if (flags[index] === '--shot' && value) shotId = value;
    else if (flags[index] === '--frame' && value !== undefined && /^\d+$/.test(value)) frame = Number(value);
    else throw new Error(`Invalid argument: ${flags[index]} ${value ?? ''}`);
  }
  if (command === 'render' && frame !== undefined) throw new Error('--frame is only supported for stills');
  if (command === 'still' && frame === undefined) throw new Error('still requires --frame');
  const root = resolve(import.meta.dir, '../projects/demo');
  const project = await loadProject(root);
  const shot = shotId === undefined ? undefined : project.shots.find(s => s.id === shotId);
  if (shotId && !shot) throw new Error(`Unknown shot: ${shotId}`);
  const duration = shot?.durationFrames ?? project.durationFrames;
  if (frame !== undefined && (!Number.isSafeInteger(frame) || frame >= duration)) throw new Error(`Frame must be between 0 and ${duration - 1}`);
  const id = shotId ?? 'intro';
  const output = join(resolve(import.meta.dir, '../output'), command === 'still' ? `snaps/${id}-${frame}.png` : `${id}.mp4`);
  const temporary = `${output}.partial-${process.pid}${extname(output)}`;
  const start = performance.now();
  const bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-bundle-'));
  try {
    const serveUrl = await bundle({entryPoint: resolve(import.meta.dir, '../src/spike/index.tsx'), publicDir: root, outDir: bundleDir});
    const errors: string[] = [];
    const onBrowserLog = (log: {type: string; text: string}) => { if (log.type === 'error') errors.push(log.text); };
    const browserExecutable = process.env.CHROME_BIN || undefined;
    const composition = await selectComposition({serveUrl, id, browserExecutable, onBrowserLog});
    if (composition.durationInFrames !== duration || composition.width !== project.video.width || composition.height !== project.video.height || composition.fps !== project.video.fps) throw new Error(`Composition ${id} differs from validated manifest`);
    await mkdir(resolve(output, '..'), {recursive: true});
    if (command === 'still') await renderStill({serveUrl, composition, frame: frame!, output: temporary, imageFormat: 'png', browserExecutable, onBrowserLog});
    else await renderMedia({serveUrl, composition, codec: 'h264', pixelFormat: 'yuv420p', outputLocation: temporary, browserExecutable, onBrowserLog, concurrency: 2});
    if (errors.length) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
    const {size} = await stat(temporary);
    await rename(temporary, output);
    console.log(`${id} ${command}: ${duration} frames at ${composition.width}x${composition.height}/${composition.fps}fps, ${size} bytes, ${((performance.now() - start) / 1000).toFixed(2)}s`);
    console.log(output);
  } finally {
    try { await rm(temporary, {force: true}); }
    finally { await rm(bundleDir, {recursive: true, force: true}); }
  }
}

main().catch(error => { console.error(error); process.exit(1); });
