import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Scene, StudioProject} from '../spike/project';
import {validatePng} from '../review/artifacts';
import type {ReviewFrame} from '../review/frames';
import {fileIdentity, reserve, seal, type Run} from './lifecycle';

// This is an adapter to the same generic shot composition used by the review CLI.
export async function captureProduction(repo: string, root: string, project: StudioProject, scene: Scene, frames: ReviewFrame[], run: Run) {
  const bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-bundle-'));
  let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
  try {
    const serveUrl = await bundle({entryPoint: join(repo, 'src/spike/index.tsx'), publicDir: root, outDir: bundleDir});
    browser = await openBrowser('chrome', {browserExecutable: process.env.CHROME_BIN || undefined});
    const errors: string[] = [];
    const onBrowserLog = (log: {type: string; text: string}) => { if (log.type === 'error') errors.push(log.text); };
    const captured = [];
    for (const shot of scene.shots) {
      const inputProps = {scene, video: project.video, shotId: shot.id};
      const composition = await selectComposition({serveUrl, id: 'shot', inputProps, puppeteerInstance: browser, onBrowserLog});
      if (composition.durationInFrames !== shot.durationFrames || composition.width !== project.video.width || composition.height !== project.video.height || composition.fps !== project.video.fps) throw new Error('capture composition differs from manifest');
      for (const frame of frames.filter(f => f.shotId === shot.id)) {
        const output = await reserve(repo, run, frame.path, 'preview');
        await renderStill({serveUrl, composition, inputProps, frame: frame.localFrame, output, imageFormat: 'png', puppeteerInstance: browser, onBrowserLog});
        if (errors.length) throw new Error(`capture browser error: ${errors.join('\n')}`);
        await validatePng(output, Buffer.from(await Bun.file(output).arrayBuffer()));
        await seal(repo, run, frame.path);
        captured.push({...frame, ...(await fileIdentity(output))});
      }
    }
    return captured.sort((a, b) => a.globalFrame - b.globalFrame);
  } finally {
    try { await browser?.close({silent: true}); }
    finally { await rm(bundleDir, {recursive: true, force: true}); }
  }
}
