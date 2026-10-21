import {expect, test} from 'bun:test';
import {bundle} from '@remotion/bundler';
import {selectComposition} from '@remotion/renderer';
import {chromium, type Browser} from 'playwright-core';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, relative, sep} from 'node:path';
import {loadProject} from '../src/spike/project';

test('Player adapter acknowledges reverse seeks in one browser page', async () => {
  const root = resolve(import.meta.dir, '../projects/demo');
  const project = await loadProject(root);
  const bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-player-bundles-'));
  let browser: Browser | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const serveUrl = await bundle({entryPoint: resolve(import.meta.dir, '../src/spike/index.tsx'), publicDir: root, outDir: join(bundleDir, 'composition')});
    const diagram = await selectComposition({serveUrl, id:'diagram'});
    const intro = await selectComposition({serveUrl, id:'intro'});
    expect([diagram.durationInFrames, intro.durationInFrames]).toEqual([90, project.durationFrames]);
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
