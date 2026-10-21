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
