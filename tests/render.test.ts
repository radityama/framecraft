import {expect, test} from 'bun:test';
import {bundle} from '@remotion/bundler';
import {selectComposition} from '@remotion/renderer';
import {chromium, type Browser} from 'playwright-core';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, relative, sep} from 'node:path';
import {loadStudioProject} from '../src/spike/project';
import {selectScene} from '../src/spike/selection';

test('Player adapter acknowledges reverse seeks in one browser page', async () => {
  const root = resolve(import.meta.dir, '../projects/demo');
  const project = await loadStudioProject(root);
  const scene = selectScene(project);
  const bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-player-bundles-'));
  let browser: Browser | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const serveUrl = await bundle({entryPoint: resolve(import.meta.dir, '../src/spike/index.tsx'), publicDir: root, outDir: join(bundleDir, 'composition')});
    const diagram = await selectComposition({serveUrl, id:'shot', inputProps: {scene, video: project.video, shotId: 'diagram'}});
    const intro = await selectComposition({serveUrl, id:'scene', inputProps: {scene, video: project.video}});
    expect([diagram.durationInFrames, intro.durationInFrames]).toEqual([90, 330]);
    const playerBundle = await bundle({entryPoint: resolve(import.meta.dir, 'fixtures/player.tsx'), publicDir: root, ignoreRegisterRootWarning: true, outDir: join(bundleDir, 'player')});
    server = Bun.serve({port: 0, hostname:'127.0.0.1', fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const file = resolve(playerBundle, `.${pathname === '/' ? '/index.html' : pathname}`);
      const rel = relative(playerBundle, file);
      if (rel === '..' || rel.startsWith(`..${sep}`)) return new Response('Forbidden', {status:403});
      return new Response(Bun.file(file));
    }});
    browser = await chromium.launch({executablePath: process.env.CHROME_BIN || resolve(import.meta.dir, '../node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell')});
    const page = await browser.newPage({viewport:{width:1920,height:1080}});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
    await page.goto(`http://127.0.0.1:${server.port}/`);
    await page.waitForFunction(() => typeof (window as any).seekPlayer === 'function');
    await page.evaluate(() => (window as any).seekPlayer(70));
    const first = await page.locator('#video-container').screenshot();
    await page.evaluate(() => (window as any).seekPlayer(10));
    const middle = await page.locator('#video-container').screenshot();
    await page.evaluate(() => (window as any).seekPlayer(70));
    const last = await page.locator('#video-container').screenshot();
    expect(first.equals(last)).toBe(true);
    expect(first.equals(middle)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    try { await browser?.close(); }
    finally { server?.stop(); await rm(bundleDir, {recursive: true, force: true}); }
  }
}, 120000);

test('composition metadata uses the selected scene even when shot IDs repeat', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-metadata-project-'));
  const bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-metadata-bundle-'));
  try {
    for (const [id, duration] of [['first', 30], ['second', 45]] as const) {
      await mkdir(join(root, 'scenes', id, 'shots'), {recursive: true});
      await writeFile(join(root, 'scenes', id, 'shots', 'shared.html'), '<!doctype html>');
      await writeFile(join(root, 'scenes', id, 'scene.json'), JSON.stringify({id, shots: [{id: 'shared', entry: 'shots/shared.html', durationFrames: duration, overlapFrames: 0}], audio: []}));
    }
    await writeFile(join(root, 'project.json'), JSON.stringify({schemaVersion: 1, id: 'fixture', video: {width: 640, height: 360, fps: 24}, scenes: ['first', 'second'].map(id => ({id, path: `scenes/${id}/scene.json`})), audio: []}));
    const project = await loadStudioProject(root);
    const scene = selectScene(project, 'second');
    const serveUrl = await bundle({entryPoint: resolve(import.meta.dir, '../src/spike/index.tsx'), publicDir: root, outDir: bundleDir});
    const inputProps = {scene, video: project.video};
    const selected = await selectComposition({serveUrl, id: 'scene', inputProps});
    const shot = await selectComposition({serveUrl, id: 'shot', inputProps: {...inputProps, shotId: 'shared'}});
    expect(selected).toMatchObject({durationInFrames: 45, width: 640, height: 360, fps: 24});
    expect(shot).toMatchObject({durationInFrames: 45, width: 640, height: 360, fps: 24});
  } finally { await rm(root, {recursive: true, force: true}); await rm(bundleDir, {recursive: true, force: true}); }
}, 120000);
