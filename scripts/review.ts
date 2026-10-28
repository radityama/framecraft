import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {VERSION} from 'remotion/version';
import {lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {arch, platform, release, tmpdir} from 'node:os';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {sourceDigest, summaryText, verifyReview, type ReviewManifest} from '../src/review/artifacts';
import {captureFrames} from '../src/review/capture';
import {SELECTION_POLICY, selectReviewFrames} from '../src/review/frames';
import {loadStudioProject} from '../src/spike/project';
import {projectRoot, selectScene} from '../src/spike/selection';
import {assertOutsideProject} from './atomic-output';

const repo = resolve(import.meta.dir, '..');

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

async function checkOutput(output: string, root: string) {
  try { await lstat(output); throw new Error(`Review output already exists: ${output}`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await assertOutsideProject(output, root);
}

async function main() {
  if (process.argv.slice(2).includes('--help')) {
    console.log('Usage: bun run review [--project <path>] [--scene <id>] [--output <new-directory>] [--milestone <shot:frame>]\n       bun run review [--project <path>] [--scene <id>] --check|--summary <manifest.json>\nCapture is unreviewed. --check is read-only; --summary regenerates the summary after integrity checks.');
    return;
  }
  let mode: '--output' | '--check' | '--summary' | undefined;
  let value: string | undefined;
  let selectedProject: string | undefined;
  let sceneId: string | undefined;
  const milestones: string[] = [];
  const flags = process.argv.slice(2);
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const next = flags[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--milestone') milestones.push(next);
    else if (flag === '--project') {
      if (selectedProject !== undefined) throw new Error('Duplicate --project');
      selectedProject = next;
    } else if (flag === '--scene') {
      if (sceneId !== undefined) throw new Error('Duplicate --scene');
      sceneId = next;
    }
    else if (flag === '--output' || flag === '--check' || flag === '--summary') {
      if (mode) throw new Error(`Cannot combine ${mode} and ${flag}`);
      mode = flag;
      value = next;
    } else throw new Error(`Unknown flag: ${flag}`);
  }
  const root = await projectRoot(selectedProject);
  if (mode === '--check' || mode === '--summary') {
    if (milestones.length) throw new Error('Milestones require capture mode');
    const path = resolve(value!);
    await verifyReview(path, root, {checkSummary: mode === '--check', sceneId});
    if (mode === '--summary') {
      const directory = await realpath(dirname(path));
      if (within(root, directory)) throw new Error('Review artifacts cannot be inside selected project');
      const summary = join(directory, 'summary.md');
      try {
        if ((await lstat(summary)).isSymbolicLink()) throw new Error('Summary cannot be a symlink');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const manifest = JSON.parse(await readFile(path, 'utf8')) as ReviewManifest;
      await writeFile(summary, summaryText(manifest));
      await verifyReview(path, root, {sceneId});
    }
    console.log(path);
    return;
  }

  const project = await loadStudioProject(root);
  const scene = selectScene(project, sceneId);
  const frames = selectReviewFrames(scene.shots, milestones);
  const output = resolve(value ?? join(repo, 'output/reviews', `${project.id}-${scene.id}-${new Date().toISOString().replace(/\D/g, '')}-${process.pid}`));
  await checkOutput(output, root);

  const validationResult = await command(['bun', 'run', 'validate', '--project', root, '--scene', scene.id]);
  const lines = validationResult.stderr.split(/\r?\n/).filter(line => line && !line.startsWith('$ bun '));
  const validation: ReviewManifest['validation'] = {command: 'bun run validate', exitCode: validationResult.exitCode,
    warnings: lines.filter(line => line.startsWith('warning ')), errors: lines.filter(line => !line.startsWith('warning '))};
  if (validation.exitCode !== 0) throw new Error(`Validation failed:\n${validationResult.stderr || validationResult.stdout}`);
  const sha256 = await sourceDigest(root);
  const revision = await command(['git', 'rev-parse', 'HEAD']);
  const status = within(repo, root)
    ? await command(['git', 'status', '--porcelain', '--untracked-files=all', '--', relative(repo, root)])
    : {stdout: '?? external project\n', stderr: '', exitCode: 0};
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
    try { serveUrl = await bundle({entryPoint: join(repo, 'src/spike/index.tsx'), publicDir: root, outDir: bundleDir}); }
    catch (error) { setupFailure = `bundle failed: ${String(error)}`; }
    if (!setupFailure) {
      try { browser = await openBrowser('chrome', {browserExecutable}); }
      catch (error) { setupFailure = `browser failed to launch: ${String(error)}`; }
    }
    const errors: string[] = [];
    const onBrowserLog = (log: {type: string; text: string}) => { if (log.type === 'error') errors.push(log.text); };
    const compositions = new Map<string, Awaited<ReturnType<typeof selectComposition>>>();
    if (!setupFailure) {
      for (const shot of scene.shots) {
        errors.length = 0;
        const inputProps = {scene, video: project.video, shotId: shot.id};
        const composition = await selectComposition({serveUrl: serveUrl!, id: 'shot', inputProps, puppeteerInstance: browser, onBrowserLog});
        if (composition.durationInFrames !== shot.durationFrames || composition.width !== project.video.width ||
          composition.height !== project.video.height || composition.fps !== project.video.fps)
          throw new Error(`Composition ${shot.id} differs from validated manifest`);
        if (errors.length) throw new Error(`Browser console errors during composition ${shot.id}:\n${errors.join('\n')}`);
        compositions.set(shot.id, composition);
      }
    }

    await checkOutput(output, root);
    await mkdir(dirname(output), {recursive: true});
    await mkdir(output);
    const manifest: ReviewManifest = {schemaVersion: 1, projectId: project.id, sceneId: scene.id,
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
            inputProps: {scene, video: project.video, shotId: frame.shotId}, output: partial, imageFormat: 'png', puppeteerInstance: browser, onBrowserLog});
          if (errors.length) throw new Error(`Browser console errors:\n${errors.join('\n')}`);
        });
      } catch (error) {
        manifest.captures = frames.map(frame => ({...frame, status: 'failed', error: `capture interrupted: ${String(error)}`}));
      }
    }
    try {
      if (await sourceDigest(root) !== sha256) validation.errors.push('Project source digest changed during capture');
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
