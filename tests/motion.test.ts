import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const context: {framecraftMotion?: any} = {};
runInNewContext(readFileSync(new URL('../authoring/motion.js', import.meta.url), 'utf8'), context);
const m = context.framecraftMotion;
test('motion math is explicit, finite and seek independent', () => {
  expect(readFileSync(new URL('../projects/motion/assets/motion.js', import.meta.url), 'utf8')).toBe(readFileSync(new URL('../authoring/motion.js', import.meta.url), 'utf8'));
  for (const ease of Object.values(m.easing) as ((n: number) => number)[]) {expect(ease(0)).toBe(0); expect(ease(1)).toBe(1); expect(ease(.5)).toBeGreaterThan(0);}
  expect(m.cubicBezier(.25, .1, .25, 1)(.5)).toBeGreaterThan(.5);
  expect(() => m.cubicBezier(-1, 0, 1, 1)).toThrow();
  expect(() => m.clamp(NaN)).toThrow(); expect(() => m.progress(0, 2, 2)).toThrow();
  const points = [{frame: 10, value: 0, ease: m.easing.easeIn}, {frame: 20, value: 100}];
  expect(m.keyframes(0, points)).toBe(0); expect(m.keyframes(15, points)).toBe(25); expect(m.keyframes(99, points)).toBe(100);
  for (const p of [[], [{frame: 0, value: 'x'}], [{frame: 2, value: 1}, {frame: 2, value: 2}], [{frame: 2, value: 1}, {frame: 0, value: 2}]]) expect(() => m.keyframes(1, p)).toThrow();
  expect(m.stagger(15, 1, 5, 20)).toBe(.5);
  const config = {from: {x: 0, y: 0}, to: {x: 100, y: 40}, duration: 20, seed: 4, humanize: 5, clickFrame: 20};
  const middle = m.cursor(10, config); m.cursor(0, config); expect(m.cursor(10, config)).toEqual(middle);
  expect(m.cursor(20, config)).toMatchObject({x: 100, y: 40, clicking: true}); expect(m.cursor(23, config).clicking).toBe(false);
  expect(m.camera(10, {from: {x: 50, y: 50, zoom: 1}, to: {x: 100, y: 100, zoom: 2}, duration: 20, viewport: {width: 200, height: 200}})).toEqual({x: -12.5, y: -12.5, scale: 1.5});
  expect(m.framing({x: 10, y: 20, width: 100, height: 50}, {width: 200, height: 200})).toEqual({x: 60, y: 45, zoom: 2});
  const node = {style: {} as Record<string, string>}; m.apply(node, {x: 4, rotation: 90, opacity: 2}); expect(node.style.transform).toBe('translate(4px, 0px) rotate(90deg) scale(1)'); expect(node.style.opacity).toBe('1');
  m.drawSvg(node, .5, 200); expect(node.style.strokeDashoffset).toBe('100'); m.reveal([node], 0); expect(node.style.opacity).toBe('0'); m.reveal([node], 20); expect(node.style.opacity).toBe('1');
});
