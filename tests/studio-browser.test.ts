import {afterAll, beforeAll, expect, test} from 'bun:test';
import {chromium, type Browser, type Page} from 'playwright-core';
import {resolve} from 'node:path';
import {startStudio} from './fixtures/studio-server';

let browser: Browser;
let studio: Awaited<ReturnType<typeof startStudio>>;

beforeAll(async () => {
  studio = await startStudio();
  browser = await chromium.launch({executablePath: process.env.CHROME_BIN || resolve(import.meta.dir, '../node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell')});
}, 120000);

afterAll(async () => {
  await browser?.close();
  await studio?.stop();
});

const url = (path = '/') => `${studio.url}${path}`;

async function open(path: string) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
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
    await page.getByRole('button', {name: /title 60f/}).click();
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

    await page.locator('.shots').getByRole('button', {name: /commit/}).click();
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

test('keyboard shortcuts step from the newest frame and leave focused controls alone', async () => {
  const {page, errors} = await open('/?clip=intro');
  try {
    await ready(page, 0);
    await page.locator('body').click({position: {x: 4, y: 4}});
    await page.keyboard.press('ArrowRight');
    await ready(page, 1);
    await page.keyboard.press('ArrowLeft');
    await ready(page, 0);
    await page.keyboard.press('Space');
    await page.getByRole('button', {name: 'Pause'}).waitFor();
    await page.keyboard.press('Space');
    await page.getByRole('button', {name: 'Play'}).waitFor();
    await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('data-state') === 'ready', undefined, {timeout: 20000});
    const paused = Number(await stage(page).getAttribute('data-frame'));
    await page.waitForTimeout(250);
    expect(Number(await stage(page).getAttribute('data-frame'))).toBe(paused);

    const range = page.getByRole('slider', {name: 'Timeline frame'});
    await range.focus();
    await page.keyboard.press('ArrowRight');
    await ready(page, paused + 1);
    await page.getByRole('button', {name: 'Next frame'}).focus();
    await page.keyboard.press('Space');
    await ready(page, paused + 2);
    await page.locator('body').click({position: {x: 4, y: 4}});
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await ready(page, paused + 5);
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

test('audio follows seek, pause, replay and scene switch', async () => {
  const {page, errors} = await open('/?clip=intro');
  try {
    await ready(page, 0);
    await seek(page, 78);
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLAudioElement>('audio[src*="assets/audio/"]')].filter(a => a.currentTime > 0).length >= 2);
    const before = await page.locator('audio[src*="bed.wav"]').evaluate(node => (node as HTMLAudioElement).currentTime);
    expect(Math.abs(before - 78 / 30)).toBeLessThan(0.35);
    await seek(page, 96);
    await page.waitForFunction(() => {
      const media = document.querySelector<HTMLAudioElement>('audio[src*="hit-b.wav"]');
      return !!media && media.currentTime > 0 && media.currentTime < 0.2;
    }, undefined, {timeout: 10000});
    const loopTime = await page.locator('audio[src*="hit-b.wav"]').evaluate(node => (node as HTMLAudioElement).currentTime);
    expect(loopTime).toBeLessThan(0.2);
    await page.getByRole('button', {name: 'Play'}).click();
    await page.waitForFunction(() => {
      const media = document.querySelector<HTMLAudioElement>('audio[src*="bed.wav"]');
      return !!media && !media.paused;
    });
    await page.getByRole('button', {name: 'Pause'}).click();
    await page.waitForTimeout(300);
    const paused = await page.locator('audio[src*="assets/audio/"]').evaluateAll(nodes => nodes.map(node => (node as HTMLAudioElement).paused));
    expect(paused.length).toBeGreaterThan(0);
    expect(paused.every(Boolean)).toBe(true);
    await seek(page, 329);
    await page.getByRole('button', {name: 'Play'}).click();
    await ready(page, 0);
    await page.waitForFunction(() => {
      const media = document.querySelector<HTMLAudioElement>('audio[src*="bed.wav"]');
      return !!media && media.currentTime < 0.35;
    });
    expect(await page.locator('audio[src*="bed.wav"]').evaluate(node => (node as HTMLAudioElement).currentTime)).toBeLessThan(0.35);
    expect(errors).toEqual([]);
  } finally { await page.close(); }
}, 120000);

test('real catalog project/scene/shot navigation survives refresh and history without stale media', async () => {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url('/?clip=intro'));
    await ready(page, 0);
    expect(await page.getByLabel('Project', {exact: true}).inputValue()).toBe('demo');
    expect(await page.getByLabel('Scene', {exact: true}).inputValue()).toBe('intro');

    await seek(page, 78);
    expect(await page.locator('audio[src*="assets/audio/"]').count()).toBeGreaterThanOrEqual(2);
    await page.getByLabel('Project', {exact: true}).selectOption('showcase');
    await ready(page, 0);
    expect(await stage(page).getAttribute('data-project')).toBe('showcase');
    expect(await page.frameLocator('iframe').locator('h1').evaluate(node => Number(getComputedStyle(node).opacity))).toBeGreaterThanOrEqual(0.6);
    expect(await page.locator('audio[src*="/demo/"]').count()).toBe(0);
    await page.getByLabel('Scene', {exact: true}).selectOption('signal');
    await ready(page, 0);
    expect(await stage(page).getAttribute('data-scene')).toBe('signal');
    await page.locator('.shots').getByRole('button', {name: /receive/}).click();
    await ready(page, 48);
    expect(new URL(page.url()).search).toBe('?project=showcase&scene=signal&shot=receive');
    expect(await page.frameLocator('iframe').locator('h1').evaluate(node => Number(getComputedStyle(node).opacity))).toBeGreaterThanOrEqual(0.6);
    expect(await page.locator('iframe').count()).toBe(1);
    expect(await page.locator('#stage').getAttribute('data-frame')).toBe('48');

    await page.reload();
    await ready(page, 48);
    expect(await page.getByLabel('Scene', {exact: true}).inputValue()).toBe('signal');
    expect(await page.locator('iframe').count()).toBe(1);
    await page.goBack();
    await ready(page, 0);
    expect(await stage(page).getAttribute('data-shot')).toBe('carrier');
    await page.goBack();
    await ready(page, 0);
    expect(await stage(page).getAttribute('data-scene')).toBe('pulse');
    await page.goForward();
    await ready(page, 0);
    expect(await stage(page).getAttribute('data-scene')).toBe('signal');
    expect(errors).toEqual([]);

    await page.goto(url('/?clip=nope'));
    await page.getByRole('heading', {name: /Unknown scene "nope"/}).waitFor({timeout: 10000});
    await page.getByRole('button', {name: 'Open intro'}).click();
    await ready(page, 0);
    expect(new URL(page.url()).search).toBe('?project=demo&scene=intro&shot=title');
  } finally {
    await page.close();
  }
}, 150000);

test('CLI-selected noninitial scene initializes UI and explicit URL IDs take precedence', async () => {
  const selected = await startStudio(['--project', 'projects/showcase', '--scene', 'signal']);
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(selected.url);
    await ready(page, 0);
    expect(await stage(page).getAttribute('data-project')).toBe('showcase');
    expect(await page.getByLabel('Scene', {exact: true}).inputValue()).toBe('signal');
    expect(new URL(page.url()).search).toBe('?project=showcase&scene=signal&shot=carrier');
    await page.reload();
    await ready(page, 0);
    await page.goto(`${selected.url}/?project=demo&scene=intro&shot=diagram`);
    await ready(page, 60);
    expect(await stage(page).getAttribute('data-project')).toBe('demo');
    await page.goto(`${selected.url}/?project=showcase&clip=signal&shot=receive`);
    await ready(page, 48);
    expect(new URL(page.url()).search).toBe('?project=showcase&scene=signal&shot=receive');
    expect(errors).toEqual([]);
  } finally { await page.close(); await selected.stop(); }
}, 180000);

test('invalid and conflicting URL selectors show a recoverable error, never a fallback preview', async () => {
  const page = await browser.newPage();
  try {
    for (const query of ['project=unknown', 'project=..%2Fdemo', 'project=demo&project=showcase', 'scene=intro&clip=signal', 'project=showcase&scene=signal&shot=missing']) {
      await page.goto(url(`/?${query}`));
      await page.getByRole('alert').waitFor();
      expect(await page.locator('iframe').count()).toBe(0);
      await page.getByRole('button', {name: /^Open /}).first().click();
      await ready(page, 0);
    }
  } finally { await page.close(); }
}, 180000);

test('an aborted old project response cannot overwrite the newer selection', async () => {
  const page = await browser.newPage();
  let release!: () => void;
  let intercepted!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { intercepted = resolve; });
  await page.route('**/api/project?id=demo', async route => {
    intercepted();
    await held;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto(url(), {waitUntil: 'domcontentloaded'});
    await started;
    await page.getByLabel('Project', {exact: true}).selectOption('showcase');
    await ready(page, 0);
    release();
    await seek(page, 24);
    expect(await stage(page).getAttribute('data-project')).toBe('showcase');
    expect(await page.getByLabel('Project', {exact: true}).inputValue()).toBe('showcase');
    expect(await page.locator('audio[src*="/demo/"]').count()).toBe(0);
  } finally { release(); await page.close(); }
}, 90000);

test('shows loading, empty, error, and runtime failure states', async () => {
  const {page} = await open('/?clip=intro');
  try {
    await page.route('**/api/project?*', route => route.fulfill({json: {id: 'demo', title: 'Renderer trial', video: {width: 1920, height: 1080, fps: 30}, scenes: []}}));
    await page.goto(url('/'));
    await page.getByText('This project has no scenes.').waitFor({timeout: 10000});

    await page.route('**/api/project?*', route => route.fulfill({status: 500, json: {error: 'Manifest is broken'}}));
    await page.goto(url('/'));
    await page.getByText('Could not load the project: Manifest is broken').waitFor({timeout: 10000});
    await page.unroute('**/api/project?*');
    await page.getByRole('button', {name: 'Retry loading'}).click();
    await ready(page, 0);

    await page.route('**/public/demo/scenes/intro/shots/02-diagram/index.html', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><script src="/public/runtime.js"></script><script>framecraft.shot({renderFrame() { throw new Error("Shot exploded"); }});</script>',
    }));
    await page.locator('input[type=range]').fill('60');
    await page.getByRole('alert').getByText(/Shot exploded/).waitFor({timeout: 30000});
    expect(await stage(page).getAttribute('data-state')).toBe('error');
    await page.unroute('**/public/demo/scenes/intro/shots/02-diagram/index.html');
    await page.getByRole('button', {name: 'Retry frame'}).click();
    await ready(page, 60);
    expect(await stage(page).getAttribute('data-shot')).toBe('diagram');
  } finally {
    await page.close();
  }
}, 120000);

test('catalog errors, empty state and skipped-project disclosure are keyboard recoverable', async () => {
  const page = await browser.newPage();
  try {
    await page.route('**/api/projects', route => route.fulfill({status: 500, json: {error: 'Catalog unavailable'}}));
    await page.goto(url());
    await page.getByRole('alert').getByText(/Catalog unavailable/).waitFor();
    await page.unroute('**/api/projects');
    await page.getByRole('button', {name: 'Retry loading'}).click();
    await ready(page, 0);
    await page.route('**/api/projects', route => route.fulfill({json: {projects: [], warnings: [], selected: {projectId: 'demo', sceneId: 'intro'}}}));
    await page.goto(url());
    await page.getByText(/No projects available/).waitFor();
    await page.unroute('**/api/projects');
    await page.getByRole('button', {name: 'Retry loading'}).click();
    await ready(page, 0);
    await page.route('**/api/projects', async route => {
      const response = await route.fetch();
      await route.fulfill({json: {...await response.json(), warnings: ['invalid-fixture: invalid project (run validate for details)']}});
    });
    await page.goto(url());
    await ready(page, 0);
    const disclosure = page.getByText('Some projects were skipped (1)');
    await disclosure.focus();
    await page.keyboard.press('Enter');
    await page.getByText(/invalid-fixture:/).waitFor({state: 'visible'});
    expect(await page.locator('details.fault').getAttribute('open')).not.toBeNull();
    const fonts = await page.evaluate(() => Array.from(document.fonts).filter(font => font.status === 'loaded').map(font => font.family));
    expect(fonts).toContain('IBM Plex Sans');
    expect(fonts).toContain('JetBrains Mono');
  } finally { await page.close(); }
}, 90000);

test('reports a missing image asset instead of displaying an acknowledged frame', async () => {
  const {page} = await open('/?clip=intro');
  try {
    await ready(page, 0);
    await page.route('**/public/demo/scenes/intro/shots/02-diagram/index.html', route => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><img src="/public/missing-preview-image.png"><script src="/public/runtime.js"></script><script>framecraft.shot({renderFrame() {}});</script>',
    }));
    await page.getByRole('slider', {name: 'Timeline frame'}).fill('60');
    await page.getByRole('alert').getByText(/image|decode|missing/i).waitFor({timeout: 30000});
    expect(await stage(page).getAttribute('data-state')).toBe('error');
    expect(await page.locator('iframe').count()).toBe(1);
  } finally {
    await page.close();
  }
}, 120000);

test('keeps the active shot and controls in view on a phone', async () => {
  const {page} = await open('/?clip=intro');
  try {
    await page.setViewportSize({width: 390, height: 844});
    await ready(page, 0);
    await seek(page, 285);
    const active = await page.locator('.shots button[data-active="true"]').boundingBox();
    expect(active).not.toBeNull();
    expect(active!.x + active!.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(await page.getByRole('button', {name: 'Play'}).isVisible()).toBe(true);
  } finally {
    await page.close();
  }
}, 120000);
