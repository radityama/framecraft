import {expect, test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = import.meta.dir;
test('film manifests and independent entries preserve the approved timing', async () => {
  const project = await Bun.file(resolve(root, 'project.json')).json();
  const scene = await Bun.file(resolve(root, 'scenes/film/scene.json')).json();
  expect(project.video).toMatchObject({width:1920,height:1080,fps:30});
  expect(scene.shots.map((s: {durationFrames:number}) => s.durationFrames)).toEqual([360,450,450,390]);
  let offset = 0;
  for (const shot of scene.shots) {
    expect(shot.overlapFrames).toBe(0);
    const html = await readFile(resolve(root, 'scenes/film', shot.entry), 'utf8');
    expect(html).toContain(`data-offset="${offset}"`);
    expect(html).not.toMatch(/https?:\/\//);
    offset += shot.durationFrames;
  }
  expect(offset).toBe(1650);
  expect(project.audio).toEqual([]);
  expect(scene.audio).toEqual([]);
});

test('uses unchanged public runtime and motion helper with local licensed fonts', async () => {
  expect(await Bun.file(resolve(root, 'runtime.js')).text()).toBe(await Bun.file(resolve(root, '../motion/runtime.js')).text());
  expect(await Bun.file(resolve(root, 'assets/motion.js')).text()).toBe(await Bun.file(resolve(root, '../../authoring/motion.js')).text());
  const script = await Bun.file(resolve(root, 'assets/film.js')).text();
  expect(script.match(/window\.framecraft\.shot\(/g)).toHaveLength(1);
  expect(script).not.toMatch(/Date\.now|Math\.random|setTimeout|setInterval|requestAnimationFrame|fetch\(/);
  for (const name of ['ibm-plex-sans', 'ibm-plex-serif', 'jetbrains-mono']) {
    expect(await Bun.file(resolve(root, `assets/fonts/${name}-OFL.txt`)).exists()).toBe(true);
  }
});
