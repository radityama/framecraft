import {afterAll, beforeAll, expect, test} from 'bun:test';
import {resolve, relative, sep} from 'node:path';
import {chromium, type Browser, type Page} from 'playwright-core';

const root = resolve(import.meta.dir, '..');
let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
let page: Page;

beforeAll(async () => {
  const executablePath = process.env.CHROME_BIN || resolve(root, 'node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell');
  browser = await chromium.launch({executablePath, headless: true});
  server = Bun.serve({port: 0, hostname: '127.0.0.1', fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = resolve(root, `.${pathname}`);
    const rel = relative(root, file);
    if (rel.startsWith(`..${sep}`) || rel === '..') return new Response('Forbidden', {status: 403});
    return new Response(Bun.file(file));
  }});
  page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
  await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/host.html`);
});

afterAll(async () => { await page?.close(); await browser?.close(); server?.stop(); });

test('diagram reverse seek 70,10,70 preserves identical pixels', async () => {
  await page.evaluate(() => (window as any).mount('/projects/demo/scenes/intro/shots/02-diagram/index.html', {id:'diagram',fps:30,durationFrames:90,width:1920,height:1080}));
  await page.evaluate(() => (window as any).seek(70));
  const first = await page.locator('iframe').screenshot();
  await page.evaluate(() => (window as any).seek(10));
  const middle = await page.locator('iframe').screenshot();
  await page.evaluate(() => (window as any).seek(70));
  const last = await page.locator('iframe').screenshot();
  expect(first.equals(last)).toBe(true);
  expect(first.equals(middle)).toBe(false);
});

test('shot exception rejects a seek', async () => {
  await page.evaluate(() => (window as any).mount('/tests/fixtures/failing.html', {id:'bad',fps:30,durationFrames:90,width:1920,height:1080}));
  await expect(page.evaluate(() => (window as any).seek(10))).rejects.toThrow('Injected shot failure');
});

test('missing acknowledgement times out', async () => {
  await page.evaluate(() => (window as any).mount('/tests/fixtures/silent.html', {id:'silent',fps:30,durationFrames:90,width:1920,height:1080}));
  await expect(page.evaluate(() => (window as any).seek(10))).rejects.toThrow('Timeout waiting for rendered 10');
});

test('shot clocks and random calls repeat on reverse seek', async () => {
  await page.evaluate(() => (window as any).mount('/tests/fixtures/deterministic.html', {id:'clock',fps:30,durationFrames:90,width:1920,height:1080}));
  const read = async (frame: number) => {
    await page.evaluate(frame => (window as any).seek(frame), frame);
    return JSON.parse(await page.frameLocator('iframe').locator('body').innerText());
  };
  const first = await read(70);
  const middle = await read(10);
  const last = await read(70);
  expect(first).toEqual(last);
  expect(first.date).toBe(1700000000000 + 70 / 30 * 1000);
  expect(first.performance).toBe(70 / 30 * 1000);
  expect(first.timestamp).toBe(70 / 30 * 1000);
  expect(first.random).not.toBe(middle.random);
  expect(first.contextRandom).not.toBe(middle.contextRandom);
});

test('progress includes first, midpoint and final frames including a single-frame shot', async () => {
  const mount = (durationFrames: number) => page.evaluate(durationFrames => (window as any).mount('/tests/fixtures/deterministic.html', {id:'progress',fps:30,durationFrames,width:1920,height:1080}), durationFrames);
  const progress = async (frame: number) => {
    await page.evaluate(frame => (window as any).seek(frame), frame);
    return JSON.parse(await page.frameLocator('iframe').locator('body').innerText()).progress;
  };
  await mount(3);
  expect(await progress(0)).toBe(0);
  expect(await progress(1)).toBe(0.5);
  expect(await progress(2)).toBe(1);
  await mount(1);
  expect(await progress(0)).toBe(1);
});
