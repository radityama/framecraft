import {expect, test} from 'bun:test';
import {cp, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {startStudio} from './fixtures/studio-server';
import type {StudioCatalog} from '../src/studio/catalog';
import type {StudioProject} from '../src/spike/project';

test('Studio server serves the validated manifest and bundle, then cleans up', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'framecraft-studio-test-'));
  const studio = await startStudio([], {TMPDIR: temp});
  let leftovers: string[] = [];
  try {
    const {url} = studio;

    const manifest = await fetch(`${url}/api/project`);
    expect(manifest.status).toBe(200);
    const project = await manifest.json() as StudioProject;
    expect(project.id).toBe('demo');
    expect(project.scenes.map(scene => [scene.id, scene.durationFrames])).toEqual([['intro', 330]]);
    const listing = await (await fetch(`${url}/api/projects`)).json() as StudioCatalog;
    expect(listing.projects.map(item => item.id)).toEqual(['demo', 'showcase']);
    expect(listing.selected).toEqual({projectId: 'demo', sceneId: 'intro'});
    const named = await (await fetch(`${url}/api/project?id=demo`)).json() as StudioProject;
    expect(named.scenes[0]!.shots[0]!.entry).toMatch(/^demo\/scenes\//);
    expect(named.scenes[0]!.audio[0]!.src).toMatch(/^demo\/assets\//);
    expect((await fetch(`${url}/public/${named.scenes[0]!.shots[0]!.entry}`)).status).toBe(200);

    expect((await fetch(`${url}/index.html`)).status).toBe(200);
    const shot = await fetch(`${url}/public/scenes/intro/shots/02-diagram/index.html`);
    expect(shot.status).toBe(200);
    expect(await shot.text()).toContain('framecraft.shot');
    expect((await fetch(`${url}/public/assets/fonts/fonts.css`)).status).toBe(200);

    expect((await fetch(`${url}/..%2f..%2fproject.json`)).status).toBe(403);
    expect((await fetch(`${url}/api/project?id=../demo`)).status).toBe(400);
    expect((await fetch(`${url}/api/project?id=demo&id=demo`)).status).toBe(400);
    expect((await fetch(`${url}/api/project?id=missing`)).status).toBe(404);
    expect((await fetch(`${url}/public/missing/scenes/intro/scene.json`)).status).toBe(404);
    expect((await fetch(`${url}/public/demo/..%2f..%2fproject.json`)).status).toBe(403);
    expect((await fetch(`${url}/public/demo/%2e%2e%2fproject.json`)).status).toBe(403);
    expect((await fetch(`${url}/public/demo/assets/%5c..%5cproject.json`)).status).toBe(403);
    expect((await fetch(`${url}/public/demo/assets/%00`)).status).toBe(403);
    expect((await fetch(`${url}/public/demo/%ZZ`)).status).toBe(400);
    expect((await fetch(`${url}/public/demo/assets/missing.svg`)).status).toBe(404);
    expect((await fetch(`${url}/public/demo/assets`)).status).toBe(404);
    expect((await fetch(`${url}/nope.txt`)).status).toBe(404);
  } finally {
    await studio.stop();
    leftovers = (await readdir(temp)).filter(name => name.startsWith('framecraft-studio-'));
    await rm(temp, {recursive: true, force: true});
  }
  expect(leftovers).toEqual([]);
}, 180000);

test('CLI authorizes only the explicit external root and selects its noninitial scene', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'framecraft-studio-external-'));
  const root = join(temp, 'selected');
  await cp(resolve(import.meta.dir, '../projects/showcase'), root, {recursive: true});
  const path = join(root, 'project.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.id = 'external';
  await writeFile(path, JSON.stringify(manifest));
  await writeFile(join(temp, 'private.txt'), 'never serve');
  await symlink(join(temp, 'private.txt'), join(root, 'assets/outside.txt'));
  await symlink(root, join(temp, 'alias'));
  const studio = await startStudio(['--project', join(temp, 'alias'), '--scene', 'signal'], {TMPDIR: temp});
  try {
    const catalog = await (await fetch(`${studio.url}/api/projects`)).json() as StudioCatalog;
    expect(catalog.selected).toEqual({projectId: 'external', sceneId: 'signal'});
    expect(JSON.stringify(catalog)).not.toContain(temp);
    expect(catalog.projects.map(project => project.id)).toEqual(['demo', 'external', 'showcase']);
    const project = await (await fetch(`${studio.url}/api/project?id=external`)).json() as StudioProject;
    expect(project.scenes.map(scene => [scene.id, scene.durationFrames])).toEqual([['pulse', 96], ['signal', 96]]);
    for (const asset of ['runtime.js', 'assets/antenna.svg', 'assets/fonts/fonts.css', 'assets/audio/hum.wav', 'scenes/signal/shots/01-carrier/index.html']) {
      expect((await fetch(`${studio.url}/public/external/${asset}`)).status).toBe(200);
    }
    expect((await fetch(`${studio.url}/public/external/assets/outside.txt`)).status).toBe(403);
    expect((await fetch(`${studio.url}/public/selected/project.json`)).status).toBe(404);
    expect((await fetch(`${studio.url}/api/project?id=${encodeURIComponent(root)}`)).status).toBe(400);
    expect((await fetch(`${studio.url}/api/project?id=not-authorized`)).status).toBe(404);
    expect((await fetch(`${studio.url}/private.txt`)).status).toBe(404);
  } finally { await studio.stop(); await rm(temp, {recursive: true, force: true}); }
}, 180000);
