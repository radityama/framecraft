import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {VERSION} from 'remotion/version';
import {lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {arch, platform, release, tmpdir} from 'node:os';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {sourceDigest, summaryText, verifyReview, type ReviewManifest} from '../src/review/artifacts';
import {captureFrames} from '../src/review/capture';
import {SELECTION_POLICY, selectReviewFrames} from '../src/review/frames';
import {loadProject} from '../src/spike/project';

const repo = resolve(import.meta.dir, '..');
const demoRoot = join(repo, 'projects/demo');

function installedFonts(): ReviewManifest['environment']['fonts'] {
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

async function command(args: string[], cwd = repo) {
  const process = Bun.spawn(args, {cwd, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
  ]);
  return {stdout, stderr, exitCode};
}

function within(base: string, target: string) {
  const rel = relative(base, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function checkOutput(output: string) {
  try { await lstat(output); throw new Error(`Review output already exists: ${output}`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  let ancestor = dirname(output);
  const suffix: string[] = [];
  while (true) {
    try { await lstat(ancestor); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      suffix.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
  const destination = join(await realpath(ancestor), ...suffix, basename(output));
  if (within(await realpath(demoRoot), destination)) throw new Error('Review output cannot be inside projects/demo');
}

async function main() {
  let mode: '--output' | '--check' | '--summary' | undefined;
  let value: string | undefined;
  const milestones: string[] = [];
  const flags = process.argv.slice(2);
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const next = flags[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--milestone') milestones.push(next);
    else if (flag === '--output' || flag === '--check' || flag === '--summary') {
      if (mode) throw new Error(`Cannot combine ${mode} and ${flag}`);
      mode = flag;
      value = next;
    } else throw new Error(`Unknown flag: ${flag}`);
  }
  if (mode === '--check' || mode === '--summary') {
    if (milestones.length) throw new Error('Milestones require capture mode');
    const path = resolve(value!);
    await verifyReview(path, demoRoot, {checkSummary: mode === '--check'});
    if (mode === '--summary') {
      const directory = await realpath(dirname(path));
      if (within(await realpath(demoRoot), directory)) throw new Error('Review artifacts cannot be inside projects/demo');
      const summary = join(directory, 'summary.md');
      try {
        if ((await lstat(summary)).isSymbolicLink()) throw new Error('Summary cannot be a symlink');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const manifest = JSON.parse(await readFile(path, 'utf8')) as ReviewManifest;
      await writeFile(summary, summaryText(manifest));
      await verifyReview(path, demoRoot);
    }
    console.log(path);
    return;
  }

  const project = await loadProject(demoRoot);
  const config = JSON.parse(await readFile(join(demoRoot, 'project.json'), 'utf8')) as {
    id: string; scenes: Array<{id: string}>;
  };
  if (config.id !== 'demo' || config.scenes.length !== 1 || config.scenes[0]?.id !== 'intro')
    throw new Error('Only the demo intro composition is exportable');
  const sceneId = config.scenes[0].id;
  const frames = selectReviewFrames(project.shots, milestones);
  const output = resolve(value ?? join(repo, 'output/reviews', `${config.id}-${sceneId}-${new Date().toISOString().replace(/\D/g, '')}-${process.pid}`));
  await checkOutput(output);

  const validationResult = await command(['bun', 'run', 'validate']);
  const lines = validationResult.stderr.split(/\r?\n/).filter(line => line && !line.startsWith('$ bun '));
  const validation: ReviewManifest['validation'] = {command: 'bun run validate', exitCode: validationResult.exitCode,
    warnings: lines.filter(line => line.startsWith('warning ')), errors: lines.filter(line => !line.startsWith('warning '))};
  if (validation.exitCode !== 0) throw new Error(`Validation failed:\n${validationResult.stderr || validationResult.stdout}`);
  const sha256 = await sourceDigest(demoRoot);
  const revision = await command(['git', 'rev-parse', 'HEAD']);
  const status = await command(['git', 'status', '--porcelain', '--untracked-files=all', '--', 'projects/demo']);
  if (revision.exitCode || status.exitCode) throw new Error(`Cannot inspect project revision: ${revision.stderr || status.stderr}`);
  const browserExecutable = process.env.CHROME_BIN || (platform() === 'linux' && arch() === 'x64'
    ? join(repo, 'node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell')
    : undefined);
  if (!browserExecutable) throw new Error('Set CHROME_BIN to the browser executable outside Linux x64');
  const version = await command([browserExecutable, '--version']);
  if (version.exitCode) throw new Error(version.stderr || `Browser version query failed: ${browserExecutable}`);

  const bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-bundle-'));
  let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
  try {
    let serveUrl: string | undefined;
    let setupFailure: string | undefined;
    try { serveUrl = await bundle({entryPoint: join(repo, 'src/spike/index.tsx'), publicDir: demoRoot, outDir: bundleDir}); }
    catch (error) { setupFailure = `bundle failed: ${String(error)}`; }
    if (!setupFailure) {
      try { browser = await openBrowser('chrome', {browserExecutable}); }
      catch (error) { setupFailure = `browser failed to launch: ${String(error)}`; }
    }
    const errors: string[] = [];
    const onBrowserLog = (log: {type: string; text: string}) => { if (log.type === 'error') errors.push(log.text); };
    const compositions = new Map<string, Awaited<ReturnType<typeof selectComposition>>>();
    if (!setupFailure) {
      for (const shot of project.shots) {
        errors.length = 0;
        const composition = await selectComposition({serveUrl: serveUrl!, id: shot.id, puppeteerInstance: browser, onBrowserLog});
        if (composition.durationInFrames !== shot.durationFrames || composition.width !== project.video.width ||
          composition.height !== project.video.height || composition.fps !== project.video.fps)
          throw new Error(`Composition ${shot.id} differs from validated manifest`);
        if (errors.length) throw new Error(`Browser console errors during composition ${shot.id}:\n${errors.join('\n')}`);
        compositions.set(shot.id, composition);
      }
    }

    await checkOutput(output);
    await mkdir(dirname(output), {recursive: true});
    await mkdir(output);
    const manifest: ReviewManifest = {schemaVersion: 1, projectId: config.id, sceneId,
      source: {gitCommit: revision.stdout.trim(), trackedDirty: status.stdout.split(/\r?\n/).some(line => !!line && !line.startsWith('??')),
        untrackedDirty: status.stdout.split(/\r?\n/).some(line => line.startsWith('??')), sha256},
      selection: {policy: SELECTION_POLICY, milestones},
      environment: {bun: Bun.version, remotion: VERSION, chromium: version.stdout.trim(),
        os: {platform: platform(), arch: arch(), release: release()}, video: project.video, fonts: installedFonts()},
      validation, captures: [], review: {status: 'unreviewed', reviewer: null, findings: [], notes: ''}};
    if (setupFailure) {
      manifest.captures = frames.map((frame, index) => ({...frame, status: 'failed',
        error: index === 0 ? setupFailure : 'skipped after prior setup failure'}));
    } else {
      try {
        manifest.captures = await captureFrames(frames, output, async (frame, partial) => {
          errors.length = 0;
          await renderStill({serveUrl: serveUrl!, composition: compositions.get(frame.shotId)!, frame: frame.localFrame,
            output: partial, imageFormat: 'png', puppeteerInstance: browser, onBrowserLog});
          if (errors.length) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
        });
      } catch (error) {
        manifest.captures = frames.map(frame => ({...frame, status: 'failed', error: `capture interrupted: ${String(error)}`}));
      }
    }
    try {
      if (await sourceDigest(demoRoot) !== sha256) validation.errors.push('Project source digest changed during capture');
    } catch (error) { validation.errors.push(`Project source digest check failed: ${String(error)}`); }
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(output, 'summary.md'), summaryText(manifest));
    console.log(output);
    if (manifest.captures.some(capture => capture.status === 'failed') || validation.errors.length) process.exitCode = 1;
  } finally {
    try { await browser?.close({silent: true}); }
    finally { await rm(bundleDir, {recursive: true, force: true}); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
