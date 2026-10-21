import {afterAll, beforeAll, expect, test} from 'bun:test';
import {bundle} from '@remotion/bundler';
import {chromium, type Browser, type Page} from 'playwright-core';
import {mkdtemp, rm, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, isAbsolute, relative, sep} from 'node:path';
import {loadStudioProject} from '../src/spike/project';

const root = resolve(import.meta.dir, '../projects/demo');
let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
let serverRoot: string;
let bundleDir: string;

beforeAll(async () => {
  bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-studio-browser-'));
  serverRoot = join(bundleDir, 'studio');
  await bundle({
    entryPoint: resolve(import.meta.dir, '../src/studio/main.tsx'),
    publicDir: root,
    outDir: serverRoot,
    ignoreRegisterRootWarning: true,
  });
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/api/project') {
        return Response.json(await loadStudioProject(root));
      }
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const target = resolve(serverRoot, `.${pathname}`);
      const rel = relative(serverRoot, target);
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return new Response('Forbidden', {status: 403});
      const real = await realpath(target).catch(() => '');
      const base = await realpath(serverRoot);
      const realRel = relative(base, real);
      if (!real || realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) return new Response('Not found', {status: 404});
      const file = Bun.file(real);
      return await file.exists() ? new Response(file) : new Response('Not found', {status: 404});
    },
  });
  browser = await chromium.launch({executablePath: resolve(import.meta.dir, '../node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell')});
}, 120000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  if (bundleDir) await rm(bundleDir, {recursive: true, force: true});
});

const url = (path = '/') => `http://127.0.0.1:${server.port}${path}`;

async function open(path: string) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url(path));
  return {page, errors};
}

const stage = (page: Page) => page.locator('#stage');

async function ready(page: Page, frame: number) {
  await page.waitForFunction(expected => {
    const element = document.querySelector('#stage');
    return element?.getAttribute('data-state') === 'ready' && element?.getAttribute('data-frame') === String(expected);
  }, frame, {timeout: 30000});
}

async function seek(page: Page, frame: number) {
  await page.locator('input[type=range]').fill(String(frame));
  await ready(page, frame);
}

test('seeks across shot boundaries and matches the renderer at repeated frames', async () => {
  const {page, errors} = await open('/?clip=intro');
  try {
    await ready(page, 0);
    expect(await stage(page).getAttribute('data-shot')).toBe('title');

    await seek(page, 59);
    expect(await stage(page).getAttribute('data-shot')).toBe('title');
    await seek(page, 60);
    expect(await stage(page).getAttribute('data-shot')).toBe('diagram');
    await seek(page, 149);
    expect(await stage(page).getAttribute('data-shot')).toBe('diagram');
    await seek(page, 150);
    expect(await stage(page).getAttribute('data-shot')).toBe('close');
    await seek(page, 210);
    expect(await stage(page).getAttribute('data-shot')).toBe('commit');

    const first = await stage(page).screenshot();
    await seek(page, 70);
    const middle = await stage(page).screenshot();
    await seek(page, 10);
    await seek(page, 70);
    const again = await stage(page).screenshot();
    expect(Buffer.compare(first, middle)).not.toBe(0);
    expect(Buffer.compare(middle, again)).toBe(0);

    await page.getByRole('button', {name: /commit/}).click();
    await ready(page, 210);
    expect(await stage(page).getAttribute('data-shot')).toBe('commit');
    expect(await page.locator('.shots button[data-active="true"]').innerText()).toMatch(/commit/);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 120000);

test('rapid seeks settle on the newest frame only', async () => {
  const {page, errors} = await open('/?clip=intro');
  try {
    await ready(page, 0);
    const range = page.locator('input[type=range]');
    for (const frame of [200, 10, 300, 61]) await range.fill(String(frame));
    await ready(page, 61);
    expect(await stage(page).getAttribute('data-frame')).toBe('61');
    expect(await stage(page).getAttribute('data-shot')).toBe('diagram');
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 120000);

test('plays, pauses without drift, and stops at the last frame', async () => {
  const {page, errors} = await open('/?clip=intro');
  try {
    await ready(page, 0);
    await page.getByRole('button', {name: 'Play'}).click();
    await page.waitForFunction(() => Number(document.querySelector('#stage')?.getAttribute('data-frame')) > 5, undefined, {timeout: 20000});
    expect(await page.getByRole('button', {name: 'Pause'}).count()).toBe(1);
    await page.getByRole('button', {name: 'Pause'}).click();
    await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('data-state') === 'ready', undefined, {timeout: 20000});
    const paused = Number(await stage(page).getAttribute('data-frame'));
    await page.waitForTimeout(400);
    expect(Number(await stage(page).getAttribute('data-frame'))).toBe(paused);

    await seek(page, 328);
    expect(await stage(page).getAttribute('data-shot')).toBe('commit');
    await page.getByRole('button', {name: 'Play'}).click();
    await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('data-state') === 'ready' && document.querySelector('#stage')?.getAttribute('data-frame') === '329' && document.querySelector('button[aria-label="Play"]'), undefined, {timeout: 20000});
    await page.waitForTimeout(500);
    expect(await stage(page).getAttribute('data-frame')).toBe('329');
    expect(await page.getByRole('button', {name: 'Play'}).count()).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 120000);

test('keeps the scene in the URL, recovers from an invalid clip, and switches scene cleanly', async () => {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const second = {
    id: 'second',
    title: 'Second scene',
    shots: [{id: 'title', entry: 'scenes/intro/shots/01-title/index.html', durationFrames: 30, startFrame: 0}],
    durationFrames: 30,
  };
  const manifest = await (await fetch(url('/api/project'))).json() as {scenes: unknown[]};
  await page.route('**/api/project', route => route.fulfill({json: {...manifest, scenes: [...manifest.scenes, second]}}));
  try {
    await page.goto(url('/?clip=intro'));
    await ready(page, 0);
    expect(await page.locator('select').inputValue()).toBe('intro');

    await page.locator('select').selectOption('second');
    await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('data-scene') === 'second' && document.querySelector('#stage')?.getAttribute('data-state') === 'ready', undefined, {timeout: 30000});
    expect(new URL(page.url()).search).toBe('?clip=second');
    expect(await page.locator('iframe').count()).toBe(1);
    expect(await page.locator('#stage').getAttribute('data-frame')).toBe('0');

    await page.reload();
    await ready(page, 0);
    expect(await page.locator('select').inputValue()).toBe('second');
    expect(await page.locator('iframe').count()).toBe(1);
    expect(errors).toEqual([]);

    await page.goto(url('/?clip=nope'));
    await page.getByRole('heading', {name: /Unknown scene "nope"/}).waitFor({timeout: 10000});
    await page.getByRole('button', {name: 'Open intro'}).click();
    await ready(page, 0);
    expect(new URL(page.url()).search).toBe('?clip=intro');
  } finally {
    await page.close();
  }
}, 150000);

test('shows loading, empty, error, and runtime failure states', async () => {
  const {page} = await open('/?clip=intro');
  try {
    await page.route('**/api/project', route => route.fulfill({json: {id: 'demo', title: 'Renderer trial', video: {width: 1920, height: 1080, fps: 30}, scenes: []}}));
    await page.goto(url('/'));
    await page.getByText('This project has no scenes.').waitFor({timeout: 10000});

    await page.route('**/api/project', route => route.fulfill({status: 500, json: {error: 'Manifest is broken'}}));
    await page.goto(url('/'));
    await page.getByText('Could not load the project: Manifest is broken').waitFor({timeout: 10000});
    await page.unroute('**/api/project');
    await page.getByRole('button', {name: 'Retry loading'}).click();
    await ready(page, 0);

    await page.route('**/public/scenes/intro/shots/02-diagram/index.html', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><script src="/public/runtime.js"></script><script>framecraft.shot({renderFrame() { throw new Error("Shot exploded"); }});</script>',
    }));
    await page.locator('input[type=range]').fill('60');
    await page.getByRole('alert').getByText(/Shot exploded/).waitFor({timeout: 30000});
    expect(await stage(page).getAttribute('data-state')).toBe('error');
  } finally {
    await page.close();
  }
}, 120000);
