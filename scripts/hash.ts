import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {VERSION} from 'remotion/version';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {arch, platform, release, tmpdir} from 'node:os';
import {dirname, extname, join, resolve} from 'node:path';
import {loadStudioProject} from '../src/spike/project';
import {projectRoot, selectScene} from '../src/spike/selection';
import {sourceDigest} from '../src/review/artifacts';
import {assertOutsideProject, atomicOutput} from './atomic-output';

const demoFrames: [string, number][] = [['title', 0], ['title', 30], ['title', 59], ['diagram', 0], ['diagram', 30], ['diagram', 70], ['close', 0], ['close', 59], ['commit', 0], ['commit', 30], ['commit', 75], ['commit', 119]];

function installedFonts() {
  try {
    const result = Bun.spawnSync(['fc-list', '-f', '%{family}|%{file}\n']);
    if (result.exitCode !== 0) return null;
    const requested = ['IBM Plex Serif', 'IBM Plex Sans', 'JetBrains Mono'];
    return Buffer.from(result.stdout).toString().split('\n').flatMap(line => {
      const split = line.indexOf('|');
      if (split < 0) return [];
      const family = line.slice(0, split);
      return family.split(',').some(name => requested.includes(name.trim())) ? [{family, file: line.slice(split + 1)}] : [];
    }).sort((a, b) => a.family.localeCompare(b.family) || a.file.localeCompare(b.file));
  } catch { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: bun run hash [--project <path>] [--scene <id>] [--output <report.json>]\nDemo retains its twelve historical frame keys. Other scenes use first/middle/last per shot. Multi-scene projects require --scene.');
    return;
  }
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]!;
    const value = args[index + 1];
    if (!['--project', '--scene', '--output'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    if (options.has(flag)) throw new Error(`Duplicate ${flag}`);
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    options.set(flag, value);
  }
  const root = await projectRoot(options.get('--project'));
  const project = await loadStudioProject(root);
  const scene = selectScene(project, options.get('--scene'));
  const isDemo = root === await projectRoot() && scene.id === 'intro';
  const frames: [string, number][] = isDemo ? demoFrames : scene.shots.flatMap(shot =>
    [...new Set([0, Math.floor(shot.durationFrames / 2), shot.durationFrames - 1])].map(frame => [shot.id, frame] as [string, number]));
  const reportPath = resolve(options.get('--output') ?? join(import.meta.dir, '../output', isDemo ? 'hashes.json' : `hashes-${project.id}-${scene.id}.json`));
  if (extname(reportPath) !== '.json') throw new Error('Hash output must be .json');
  await assertOutsideProject(reportPath, root);
  const sha256 = await sourceDigest(root);
  for (const [id, frame] of frames) {
    const shot = scene.shots.find(shot => shot.id === id);
    if (!shot || frame >= shot.durationFrames) throw new Error(`Missing frame ${id}:${frame}`);
  }
  const browserExecutable = process.env.CHROME_BIN || (platform() === 'linux' && arch() === 'x64'
    ? resolve(import.meta.dir, '../node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell')
    : undefined);
  if (!browserExecutable) throw new Error('Set CHROME_BIN to the browser executable outside Linux x64');
  const version = Bun.spawnSync([browserExecutable, '--version']);
  if (version.exitCode !== 0) throw new Error(Buffer.from(version.stderr).toString());
  const chromium = Buffer.from(version.stdout).toString().trim();
  await mkdir(dirname(reportPath), {recursive: true});
  const temporary = await mkdtemp(join(dirname(reportPath), '.hash-'));
  const bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-bundle-'));
  let browser;
  try {
    const serveUrl = await bundle({entryPoint: resolve(import.meta.dir, '../src/spike/index.tsx'), publicDir: root, outDir: bundleDir});
    browser = await openBrowser('chrome', {browserExecutable});
    const errors: string[] = [];
    const onBrowserLog = (log: {type: string; text: string}) => { if (log.type === 'error') errors.push(log.text); };
    const hashes: Record<string, string> = {};
    for (const [id, frame] of frames) {
      const inputProps = {scene, video: project.video, shotId: id};
      const composition = await selectComposition({serveUrl, id: 'shot', inputProps, puppeteerInstance: browser, onBrowserLog});
      const shot = scene.shots.find(shot => shot.id === id)!;
      if (composition.durationInFrames !== shot.durationFrames || composition.width !== project.video.width || composition.height !== project.video.height || composition.fps !== project.video.fps) throw new Error(`Composition ${id} differs from validated manifest`);
      const png = join(temporary, `${id}-${frame}.png`);
      await renderStill({serveUrl, composition, inputProps, frame, output: png, imageFormat: 'png', puppeteerInstance: browser, onBrowserLog});
      if (errors.length) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
      hashes[`${id}:${frame}`] = createHash('sha256').update(await readFile(png)).digest('hex');
    }
    if (await sourceDigest(root) !== sha256) throw new Error('Project source changed during hashing');
    await atomicOutput(reportPath, partial => writeFile(partial, JSON.stringify({projectId: project.id, sceneId: scene.id,
      source: {sha256}, environment: {bun: Bun.version, remotion: VERSION, chromium, os: {platform: platform(), release: release(), arch: arch()}, video: project.video, fonts: installedFonts()}, frames: hashes}, null, 2) + '\n'));
    console.log(reportPath);
  } finally {
    try { await browser?.close({silent: true}); }
    finally {
      try {
        await rm(temporary, {recursive: true, force: true});
      } finally { await rm(bundleDir, {recursive: true, force: true}); }
    }
  }
}

main().catch(error => { console.error(error); process.exit(1); });
