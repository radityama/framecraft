import {afterAll, beforeAll, expect, test} from 'bun:test';
import {resolve, relative, sep} from 'node:path';
import {chromium, type Browser, type Page} from 'playwright-core';

const root = resolve(import.meta.dir, '..');
let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
let page: Page;
let fontRequested: () => void;
let fontRequest: Promise<void> | undefined;
let releaseFont: (() => void) | undefined;

beforeAll(async () => {
  const executablePath = process.env.CHROME_BIN || resolve(root, 'node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell');
  browser = await chromium.launch({executablePath, headless: true});
  server = Bun.serve({port: 0, hostname: '127.0.0.1', async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname === '/tests/fixtures/late-font.woff2') {
      fontRequested?.();
      await fontRequest;
      return new Response(Bun.file(resolve(root, 'projects/demo/assets/fonts/ibm-plex-serif-latin-400.woff2')), {headers: {'Content-Type': 'font/woff2'}});
    }
    const file = resolve(root, `.${pathname}`);
    const rel = relative(root, file);
    if (rel.startsWith(`..${sep}`) || rel === '..') return new Response('Forbidden', {status: 403});
    return new Response(Bun.file(file));
  }});
  page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
  await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/host.html`);
});

afterAll(async () => { await page?.close(); await browser?.close(); server?.stop(); });

test('minimal shot registers once, runs optional hooks, and renders a requested frame without returning a value', async () => {
  await page.evaluate(() => (window as any).mount('/tests/fixtures/minimal-shot.html', {id:'minimal',fps:30,durationFrames:3,width:1920,height:1080}));
  const child = page.frameLocator('iframe');
  expect(await child.locator('body').getAttribute('data-prepared')).toBe('1');
  await page.evaluate(() => (window as any).seek(2));
  expect(await child.locator('#label').innerText()).toBe('2');
  await page.evaluate(() => (window as any).seek(0));
  expect(await child.locator('#label').innerText()).toBe('0');
  expect(await child.locator('body').getAttribute('data-prepared')).toBe('1');
  await child.locator('body').evaluate(() => dispatchEvent(new Event('pagehide')));
  expect(await child.locator('body').getAttribute('data-disposed')).toBe('yes');
});

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

test('commit cursor renders the same pixels when frame 30 is revisited', async () => {
  await page.evaluate(() => (window as any).mount('/projects/demo/scenes/intro/shots/04-commit/index.html', {id:'commit',fps:30,durationFrames:120,width:1920,height:1080}));
  await page.evaluate(() => (window as any).seek(0));
  expect(await page.frameLocator('iframe').locator('.command').evaluate(command => ({
    family: getComputedStyle(command).fontFamily,
    loaded: document.fonts.check('400 56px "JetBrains Mono"', 'git commit'),
    face: Array.from(document.fonts).find(face => face.family === 'JetBrains Mono')?.status,
  }))).toEqual({family: '"JetBrains Mono", monospace', loaded: true, face: 'loaded'});
  const opacity = () => page.frameLocator('iframe').locator('.cursor').evaluate(cursor => getComputedStyle(cursor).opacity);
  const read = async () => {
    await page.evaluate(() => (window as any).seek(30));
    return page.locator('iframe').screenshot();
  };
  await page.evaluate(() => (window as any).seek(0));
  expect(await opacity()).toBe('1');
  const first = await read();
  expect(await opacity()).toBe('1');
  await page.evaluate(() => (window as any).seek(15));
  expect(await opacity()).toBe('0');
  await page.evaluate(() => (window as any).seek(0));
  expect((await read()).equals(first)).toBe(true);
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

test('registered and legacy timelines seek to the same local time', async () => {
  await page.evaluate(() => (window as any).mount('/tests/fixtures/timelines.html', {id:'timeline',fps:30,durationFrames:90,width:1920,height:1080}));
  const read = async (frame: number) => {
    await page.evaluate(frame => (window as any).seek(frame), frame);
    return page.frameLocator('iframe').locator('body').evaluate(body => ({registered: body.dataset.registered, legacy: body.dataset.legacy}));
  };
  expect(await read(70)).toEqual({registered: String(70 / 30), legacy: String(70 / 30)});
  expect(await read(10)).toEqual({registered: String(10 / 30), legacy: String(10 / 30)});
  expect(await read(70)).toEqual({registered: String(70 / 30), legacy: String(70 / 30)});
});

test('render acknowledgement waits for fonts, image decode and two native animation frames', async () => {
  await page.evaluate(() => (window as any).mount('/tests/fixtures/settling.html', {id:'settling',fps:30,durationFrames:3,width:1920,height:1080}));
  await page.evaluate(() => {
    (window as any).completed = false;
    (window as any).pending = (window as any).seek(0).then(() => {(window as any).completed = true;});
  });
  const child = page.frameLocator('iframe');
  const completed = () => page.evaluate(() => (window as any).completed);
  await child.locator('body[data-frame="0"]').waitFor();
  expect(await completed()).toBe(false);
  await child.locator('body').evaluate(() => (window as any).releaseFonts());
  expect(await completed()).toBe(false);
  await child.locator('body').evaluate(() => (window as any).releaseImage());
  await page.waitForFunction(() => (document.querySelector('iframe')?.contentWindow as any)?.queuedFrames() === 1);
  expect(await completed()).toBe(false);
  await child.locator('body').evaluate(() => (window as any).stepFrame());
  await page.waitForFunction(() => (document.querySelector('iframe')?.contentWindow as any)?.queuedFrames() === 1);
  expect(await completed()).toBe(false);
  await child.locator('body').evaluate(() => (window as any).stepFrame());
  await page.evaluate(() => (window as any).pending);
  expect(await completed()).toBe(true);
  await expect(page.evaluate(() => (window as any).seek(2))).rejects.toThrow('Injected decode failure');
});

test('first frame waits for a real, late local font before acknowledging', async () => {
  const requested = new Promise<void>(resolve => { fontRequested = resolve; });
  fontRequest = new Promise<void>(resolve => { releaseFont = resolve; });
  try {
    await page.evaluate(() => (window as any).mount('/tests/fixtures/late-font.html', {id:'late',fps:30,durationFrames:3,width:1920,height:1080}));
    await page.evaluate(() => {
      (window as any).completed = false;
      (window as any).pending = (window as any).seek(0).then(() => { (window as any).completed = true; });
    });
    await requested;
    await page.frameLocator('iframe').locator('body').evaluate(() => (window as any).afterTwoFrames);
    expect(await page.evaluate(() => (window as any).completed)).toBe(false);
    releaseFont?.();
    await page.evaluate(() => (window as any).pending);
    const first = await page.locator('iframe').screenshot();
    expect(await page.frameLocator('iframe').locator('body').evaluate(() => ({
      check: document.fonts.check('400 80px "Delayed Plex"', 'Framecraft'),
      status: Array.from(document.fonts).find(font => font.family === 'Delayed Plex')?.status,
    }))).toEqual({check: true, status: 'loaded'});
    await page.evaluate(() => (window as any).seek(0));
    expect((await page.locator('iframe').screenshot()).equals(first)).toBe(true);
  } finally { releaseFont?.(); fontRequest = undefined; }
});

test('overlapping seeks apply only the last frame and never acknowledge a stale seek', async () => {
  await page.evaluate(() => (window as any).mount('/tests/fixtures/overlap.html', {id:'overlap',fps:30,durationFrames:3,width:1920,height:1080}));
  await page.evaluate(() => {
    (window as any).seekEvents = [];
    addEventListener('message', ({source, origin, data}) => {
      if (source === document.querySelector('iframe')?.contentWindow && origin === location.origin && data?.v === 1 && ['rendered', 'error'].includes(data.type)) (window as any).seekEvents.push(data);
    });
    document.querySelector('iframe')!.contentWindow!.postMessage({v: 1, type: 'seek', frame: 1}, location.origin);
  });
  const child = page.frameLocator('iframe');
  await child.locator('body[data-waiting="true"]').waitFor({state: 'attached'});
  await page.evaluate(() => document.querySelector('iframe')!.contentWindow!.postMessage({v: 1, type: 'seek', frame: 2}, location.origin));
  await child.locator('body').evaluate(() => (window as any).releaseFirst());
  await child.locator('body').evaluate(() => (window as any).firstFinished);
  await page.waitForFunction(() => (window as any).seekEvents.some(({frame}: {frame: number}) => frame === 2));
  await child.locator('body').evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => (window as any).seekEvents.map(({type, frame}: {type: string; frame: number}) => ({type, frame})))).toEqual([{type: 'rendered', frame: 2}]);
  expect(await child.locator('body').getAttribute('data-frame')).toBe('2');
  expect(await child.locator('body').innerText()).toBe('2');
});
