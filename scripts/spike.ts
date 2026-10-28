import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join, extname} from 'node:path';
import {loadStudioProject} from '../src/spike/project';
import {projectRoot, selectScene} from '../src/spike/selection';
import {assertOutsideProject, atomicOutput} from './atomic-output';

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  if (command === '--help' || flags.includes('--help')) {
    console.log('Usage: bun run snap --frame <n> [--project <path>] [--scene <id>] [--shot <id>] [--output <file.png>]\n       bun run render [--project <path>] [--scene <id>] [--shot <id>] [--output <file.mp4>]\nDemo/intro is the default. Multi-scene exports require --scene. Frames are scene-local, or shot-local with --shot.');
    return;
  }
  if (!['still', 'render'].includes(command || '')) throw new Error('Expected still or render');
  let shotId: string | undefined;
  let projectFlag: string | undefined;
  let sceneId: string | undefined;
  let frame: number | undefined;
  let outputFlag: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index]!;
    const value = flags[index + 1];
    if (seen.has(flag)) throw new Error(`Duplicate ${flag}`);
    seen.add(flag);
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flags[index] === '--shot' && value) shotId = value;
    else if (flags[index] === '--project' && value) projectFlag = value;
    else if (flags[index] === '--scene' && value) sceneId = value;
    else if (flags[index] === '--frame' && value !== undefined && /^\d+$/.test(value)) frame = Number(value);
    else if (flags[index] === '--output' && value) outputFlag = value;
    else throw new Error(`Invalid argument: ${flags[index]} ${value ?? ''}`);
  }
  if (command === 'render' && frame !== undefined) throw new Error('--frame is only supported for stills');
  if (command === 'still' && frame === undefined) throw new Error('still requires --frame');
  const root = await projectRoot(projectFlag);
  const project = await loadStudioProject(root);
  const scene = selectScene(project, sceneId);
  const shot = shotId === undefined ? undefined : scene.shots.find(s => s.id === shotId);
  if (shotId && !shot) throw new Error(`Unknown shot: ${shotId}`);
  const duration = shot?.durationFrames ?? scene.durationFrames;
  if (frame !== undefined && (!Number.isSafeInteger(frame) || frame >= duration)) throw new Error(`Frame must be between 0 and ${duration - 1}`);
  const id = shot ? 'shot' : 'scene';
  const inputProps = {scene, video: project.video, ...(shotId === undefined ? {} : {shotId})};
  const name = project.id === 'demo' && scene.id === 'intro' ? shotId ?? 'intro' : `${project.id}-${scene.id}${shotId ? `-${shotId}` : ''}`;
  const output = outputFlag ? resolve(outputFlag) : join(resolve(import.meta.dir, '../output'), command === 'still' ? `snaps/${name}-${frame}.png` : `${name}.mp4`);
  if (extname(output) !== (command === 'still' ? '.png' : '.mp4')) throw new Error('Output extension must match the command');
  await assertOutsideProject(output, root);
  const start = performance.now();
  const bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-bundle-'));
  try {
    const serveUrl = await bundle({entryPoint: resolve(import.meta.dir, '../src/spike/index.tsx'), publicDir: root, outDir: bundleDir});
    const errors: string[] = [];
    const onBrowserLog = (log: {type: string; text: string}) => { if (log.type === 'error') errors.push(log.text); };
    const browserExecutable = process.env.CHROME_BIN || undefined;
    const composition = await selectComposition({serveUrl, id, inputProps, browserExecutable, onBrowserLog});
    if (composition.durationInFrames !== duration || composition.width !== project.video.width || composition.height !== project.video.height || composition.fps !== project.video.fps) throw new Error(`Composition ${id} differs from validated manifest`);
    const size = await atomicOutput(output, async temporary => {
      if (command === 'still') await renderStill({serveUrl, composition, inputProps, frame: frame!, output: temporary, imageFormat: 'png', browserExecutable, onBrowserLog});
      else await renderMedia({serveUrl, composition, inputProps, codec: 'h264', pixelFormat: 'yuv420p', outputLocation: temporary, browserExecutable, onBrowserLog, concurrency: 2});
      if (errors.length) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
    });
    console.log(`${name} ${command}: ${duration} frames at ${composition.width}x${composition.height}/${composition.fps}fps, ${size} bytes, ${((performance.now() - start) / 1000).toFixed(2)}s`);
    console.log(output);
  } finally { await rm(bundleDir, {recursive: true, force: true}); }
}

main().catch(error => { console.error(error); process.exit(1); });
