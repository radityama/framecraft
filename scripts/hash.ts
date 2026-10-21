import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {VERSION} from 'remotion/version';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {arch, platform, release} from 'node:os';
import {join, resolve} from 'node:path';
import {loadProject} from '../src/spike/project';

const frames: [string, number][] = [['title', 0], ['title', 30], ['diagram', 0], ['diagram', 30], ['diagram', 70], ['close', 59]];

async function main() {
  const root = resolve(import.meta.dir, '../projects/demo');
  const output = resolve(import.meta.dir, '../output');
  const project = await loadProject(root);
  for (const [id, frame] of frames) {
    const shot = project.shots.find(shot => shot.id === id);
    if (!shot || frame >= shot.durationFrames) throw new Error(`Missing frame ${id}:${frame}`);
  }
  const browserExecutable = process.env.CHROME_BIN || (platform() === 'linux' && arch() === 'x64'
    ? resolve(import.meta.dir, '../node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell')
    : undefined);
  if (!browserExecutable) throw new Error('Set CHROME_BIN to the browser executable outside Linux x64');
  const version = Bun.spawnSync([browserExecutable, '--version']);
  if (version.exitCode !== 0) throw new Error(Buffer.from(version.stderr).toString());
  const chromium = Buffer.from(version.stdout).toString().trim();
  await mkdir(output, {recursive: true});
  const temporary = await mkdtemp(join(output, '.hash-'));
  const reportPath = join(output, 'hashes.json');
  const partial = `${reportPath}.partial-${process.pid}`;
  let browser;
  try {
    const serveUrl = await bundle({entryPoint: resolve(import.meta.dir, '../src/spike/index.tsx'), publicDir: root});
    browser = await openBrowser('chrome', {browserExecutable});
    const errors: string[] = [];
    const onBrowserLog = (log: {type: string; text: string}) => { if (log.type === 'error') errors.push(log.text); };
    const hashes: Record<string, string> = {};
    for (const [id, frame] of frames) {
      const composition = await selectComposition({serveUrl, id, puppeteerInstance: browser, onBrowserLog});
      const shot = project.shots.find(shot => shot.id === id)!;
      if (composition.durationInFrames !== shot.durationFrames || composition.width !== project.video.width || composition.height !== project.video.height || composition.fps !== project.video.fps) throw new Error(`Composition ${id} differs from validated manifest`);
      const png = join(temporary, `${id}-${frame}.png`);
      await renderStill({serveUrl, composition, frame, output: png, imageFormat: 'png', puppeteerInstance: browser, onBrowserLog});
      if (errors.length) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
      hashes[`${id}:${frame}`] = createHash('sha256').update(await readFile(png)).digest('hex');
    }
    await writeFile(partial, JSON.stringify({environment: {bun: Bun.version, remotion: VERSION, chromium, os: {platform: platform(), release: release(), arch: arch()}}, frames: hashes}, null, 2) + '\n');
    await rename(partial, reportPath);
    console.log(reportPath);
  } finally {
    try { await browser?.close({silent: true}); }
    finally {
      await rm(temporary, {recursive: true, force: true});
      await rm(partial, {force: true});
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
