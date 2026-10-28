import {expect, test} from 'bun:test';
import {resolve, relative, sep} from 'node:path';
import {chromium} from 'playwright-core';
import {typingFrames} from '../projects/production-desktop/production/synthesize';

test('desktop contacts, grip geometry, focus, typography and reverse seeks remain causal', async () => {
  const root = resolve('.');
  const server = Bun.serve({port: 0, hostname: '127.0.0.1', fetch(request) {
    const file = resolve(root, `.${decodeURIComponent(new URL(request.url).pathname)}`), rel = relative(root, file);
    if (rel === '..' || rel.startsWith(`..${sep}`)) return new Response('Forbidden', {status: 403});
    return new Response(Bun.file(file));
  }});
  const browser = await chromium.launch({executablePath: process.env.CHROME_BIN || resolve('node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell')});
  try {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}}), errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', e => {if (e.type() === 'error') errors.push(e.text());});
    await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/host.html`);
    await page.evaluate(() => (window as any).mount('/projects/production-desktop/scenes/desk/shots/01-workspace/index.html', {id: 'workspace', fps: 30, durationFrames: 450, width: 1920, height: 1080}));
    const child = page.frameLocator('iframe'), seek = (f: number) => page.evaluate(f => (window as any).seek(f), f);
    await seek(53); expect(await child.locator('#created').isVisible()).toBe(false);
    await seek(54); expect(await child.locator('#new-button').getAttribute('class')).toBe('pressed');
    const contact = await child.locator('body').evaluate(() => {
      const p = document.querySelector<HTMLElement>('#pointer')!, r = document.querySelector('#new-button')!.getBoundingClientRect(), cursor = p.getBoundingClientRect();
      return {x: cursor.left, y: cursor.top, intendedX: Number(p.dataset.x), intendedY: Number(p.dataset.y), left: r.left, right: r.right, top: r.top, bottom: r.bottom};
    });
    expect(contact.x).toBeCloseTo(contact.intendedX, 4); expect(contact.y).toBeCloseTo(contact.intendedY, 4);
    expect(contact.x).toBeGreaterThan(contact.left); expect(contact.x).toBeLessThan(contact.right);
    expect(contact.y).toBeGreaterThan(contact.top); expect(contact.y).toBeLessThan(contact.bottom);
    await seek(57); expect(await child.locator('#new-button').getAttribute('class')).toBe('');
    expect(await child.locator('#rename').getAttribute('class')).toContain('focused selected');
    for (const [i, frame] of typingFrames.entries()) {await seek(96 + frame); expect(await child.locator('#name').textContent()).toBe('Field notes'.slice(0, i + 1));}
    await seek(159); expect(await child.locator('#rename').getAttribute('class')).toBe('');
    for (const f of [212, 214, 220, 240, 260, 286, 288, 290]) {
      await seek(f);
      const grip = await child.locator('body').evaluate(() => {
        const p = document.querySelector<HTMLElement>('#pointer')!, r = document.querySelector('#files')!.getBoundingClientRect(), cursor = p.getBoundingClientRect();
        return {x: cursor.left - r.left, y: cursor.top - r.top, pressed: p.dataset.pressed, front: getComputedStyle(document.querySelector('#files')!).zIndex, rear: getComputedStyle(document.querySelector('.reference')!).zIndex};
      });
      expect(grip.x).toBeCloseTo(550, 4); expect(grip.y).toBeCloseTo(30, 4);
      expect(grip.pressed).toBe(String(f < 288)); expect(Number(grip.front)).toBeGreaterThan(Number(grip.rear));
    }
    const trajectory = await page.evaluate(async () => {
      const frames = [];
      for (let f = 18; f <= 370; f++) {
        await (window as any).seek(f);
        const d = document.querySelector('iframe')!.contentDocument!, p = d.querySelector('#pointer')!.getBoundingClientRect(), w = d.querySelector('#files')!.getBoundingClientRect();
        frames.push({f, x: p.left, y: p.top, wx: w.left, wy: w.top});
      }
      const d = document.querySelector('iframe')!.contentDocument!;
      return {frames, labels: [...d.querySelectorAll('.menu strong,.menu .right')].map(e => {const r = e.getBoundingClientRect(); return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};})};
    });
    const attached = trajectory.frames.filter(p => p.f >= 212 && p.f < 300);
    expect(attached.every(p => Math.abs(p.x - p.wx - 550) < .001 && Math.abs(p.y - p.wy - 30) < .001)).toBe(true);
    const speeds = trajectory.frames.slice(1).map((p, i) => Math.hypot(p.x - trajectory.frames[i]!.x, p.y - trajectory.frames[i]!.y));
    expect(Math.max(...speeds)).toBeLessThan(60);
    for (const f of [49, 53, 58, 205, 211, 219, 287, 289, 299]) expect(speeds[f - 19]).toBeLessThan(.001);
    expect(trajectory.labels.every(r => r.left >= 0 && r.top >= 0 && r.right <= 1920 && r.bottom <= 1080)).toBe(true);
    await seek(370); const stable = await page.locator('iframe').screenshot();
    const contrastFailures = await child.locator('body').evaluate(() => {
      const rgb = (s: string) => s.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const luminance = (s: string) => rgb(s).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i]!, 0);
      return [...document.querySelectorAll<HTMLElement>('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) && e.getBoundingClientRect().width > 0).flatMap(e => {
        const style = getComputedStyle(e); let background: Element = e;
        while (getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)' && background.parentElement) background = background.parentElement;
        const a = luminance(style.color), b = luminance(getComputedStyle(background).backgroundColor), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        const minimum = parseFloat(style.fontSize) >= 24 || (Number(style.fontWeight) >= 700 && parseFloat(style.fontSize) >= 18.66) ? 3 : 4.5;
        return ratio >= minimum ? [] : [{text: e.textContent, ratio, minimum}];
      });
    });
    expect(contrastFailures).toEqual([]);
    await seek(449); expect((await page.locator('iframe').screenshot()).equals(stable)).toBe(true);
    await seek(0); await seek(370); expect((await page.locator('iframe').screenshot()).equals(stable)).toBe(true);
    const fonts = await child.locator('body').evaluate(() => [...document.fonts].map(f => ({family: f.family, status: f.status})));
    expect(fonts).toEqual(expect.arrayContaining([{family: 'IBM Plex Sans', status: 'loaded'}, {family: 'IBM Plex Serif', status: 'loaded'}]));
    expect(errors).toEqual([]);
  } finally {await browser.close(); server.stop();}
}, 120000);
