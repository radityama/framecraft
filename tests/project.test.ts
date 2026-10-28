import {afterEach, expect, test} from 'bun:test';
import {mkdtemp, mkdir, writeFile, symlink, rm, rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadProject, loadStudioProject} from '../src/spike/project';
import {selectScene} from '../src/spike/selection';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true});
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-test-'));
  roots.push(root);
  await mkdir(join(root, 'scenes/intro/shots'), {recursive: true});
  const project = {schemaVersion: 1, id: 'demo', title: 'Renderer trial', video: {width: 1920, height: 1080, fps: 30, background: '#101820'}, scenes: [{id: 'intro', path: 'scenes/intro/scene.json'}], audio: []};
  const shots = [
    {id: 'title', entry: 'shots/title.html', durationFrames: 60, overlapFrames: 0},
    {id: 'diagram', entry: 'shots/diagram.html', durationFrames: 90, overlapFrames: 0},
    {id: 'close', entry: 'shots/close.html', durationFrames: 60, overlapFrames: 0},
  ];
  for (const shot of shots) await writeFile(join(root, 'scenes/intro', shot.entry), '<!doctype html>');
  const save = async () => {
    await writeFile(join(root, 'project.json'), JSON.stringify(project));
    await writeFile(join(root, 'scenes/intro/scene.json'), JSON.stringify({id: 'intro', title: 'Renderer trial', shots, audio: []}));
  };
  await save();
  return {root, project, shots, save};
}

test('loads independent shots and computes hard-cut offsets', async () => {
  const {root} = await fixture();
  const result = await loadProject(root);
  expect(result.shots.map(({startFrame}) => startFrame)).toEqual([0, 60, 150]);
  expect(result.durationFrames).toBe(210);
  expect(result.shots[1].entry).toBe('scenes/intro/shots/diagram.html');
});

test('loads validated scenes in order without changing the single-scene export guard', async () => {
  const data = await fixture();
  data.project.scenes.push({id: 'second', path: 'scenes/second/scene.json'});
  await mkdir(join(data.root, 'scenes/second/shots'), {recursive: true});
  await writeFile(join(data.root, 'scenes/second/shots/title.html'), '<!doctype html>');
  await writeFile(join(data.root, 'scenes/second/scene.json'), JSON.stringify({id: 'second', title: 'Second', shots: [{id: 'title', entry: 'shots/title.html', durationFrames: 30, overlapFrames: 0}], audio: []}));
  await data.save();
  const studio = await loadStudioProject(data.root);
  expect(studio).toEqual({
    id: 'demo', title: 'Renderer trial', video: {width: 1920, height: 1080, fps: 30},
    scenes: [
      {id: 'intro', title: 'Renderer trial', shots: [
        {id: 'title', entry: 'scenes/intro/shots/title.html', durationFrames: 60, startFrame: 0, audio: []},
        {id: 'diagram', entry: 'scenes/intro/shots/diagram.html', durationFrames: 90, startFrame: 60, audio: []},
        {id: 'close', entry: 'scenes/intro/shots/close.html', durationFrames: 60, startFrame: 150, audio: []},
      ], durationFrames: 210, audio: []},
      {id: 'second', title: 'Second', shots: [{id: 'title', entry: 'scenes/second/shots/title.html', durationFrames: 30, startFrame: 0, audio: []}], durationFrames: 30, audio: []},
    ],
  });
  expect(() => selectScene(studio)).toThrow('scene');
  expect(selectScene(studio, 'intro').shots[0]?.entry).toBe('scenes/intro/shots/title.html');
  expect(selectScene(studio, 'second').shots[0]?.entry).toBe('scenes/second/shots/title.html');
  expect(loadProject(data.root)).rejects.toThrow('exactly one scene');
});

test('allows an empty Studio project but not an empty export project', async () => {
  const data = await fixture();
  data.project.scenes.length = 0;
  await data.save();
  expect(await loadStudioProject(data.root)).toEqual({id: 'demo', title: 'Renderer trial', video: {width: 1920, height: 1080, fps: 30}, scenes: []});
  expect(loadProject(data.root)).rejects.toThrow('exactly one scene');
});

test('rejects duplicate scene references and invalid scene paths', async () => {
  const data = await fixture();
  data.project.scenes.push({id: 'intro', path: 'scenes/intro/scene.json'});
  await data.save();
  expect(loadStudioProject(data.root)).rejects.toThrow('duplicate scene id');
  data.project.scenes[1] = {id: 'second', path: '../outside.json'};
  await data.save();
  expect(loadStudioProject(data.root)).rejects.toThrow('path escapes project');
});

test('rejects malformed scenes and scene references outside the canonical root', async () => {
  const data = await fixture();
  await writeFile(join(data.root, 'scenes/intro/scene.json'), JSON.stringify({id: 'intro', shots: {}}));
  await expect(loadStudioProject(data.root)).rejects.toThrow('scene.shots must be nonempty');

  const outside = await mkdtemp(join(tmpdir(), 'framecraft-outside-'));
  roots.push(outside);
  await writeFile(join(outside, 'scene.json'), JSON.stringify({id: 'intro', shots: data.shots, audio: []}));
  await symlink(join(outside, 'scene.json'), join(data.root, 'scenes/intro/outside.json'));
  data.project.scenes[0]!.path = 'scenes/intro/outside.json';
  await data.save();
  await expect(loadStudioProject(data.root)).rejects.toThrow('not a project file');
});

test('rejects project.json symlinks escaping the canonical root', async () => {
  const data = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'framecraft-outside-'));
  roots.push(outside);
  await writeFile(join(outside, 'project.json'), JSON.stringify(data.project));
  await rm(join(data.root, 'project.json'));
  await symlink(join(outside, 'project.json'), join(data.root, 'project.json'));
  await expect(loadStudioProject(data.root)).rejects.toThrow('project.json');
  await expect(loadProject(data.root)).rejects.toThrow('project.json');
});

test('accepts internal manifest and scene aliases and returns canonical shot paths', async () => {
  const data = await fixture();
  await rename(join(data.root, 'project.json'), join(data.root, 'original-project.json'));
  await symlink('original-project.json', join(data.root, 'project.json'));
  await symlink('scene.json', join(data.root, 'scenes/intro/alias.json'));
  data.project.scenes[0]!.path = 'scenes/intro/alias.json';
  await writeFile(join(data.root, 'original-project.json'), JSON.stringify(data.project));
  const loaded = await loadStudioProject(data.root);
  expect(loaded.scenes[0]?.shots[0]?.entry).toBe('scenes/intro/shots/title.html');
});

test('validates each referenced scene and rejects symlinks outside the project', async () => {
  const data = await fixture();
  data.project.scenes.push({id: 'second', path: 'scenes/second/scene.json'});
  await mkdir(join(data.root, 'scenes/second/shots'), {recursive: true});
  await writeFile(join(data.root, 'scenes/second/scene.json'), JSON.stringify({id: 'second', shots: [{id: 'next', entry: 'shots/missing.html', durationFrames: 30, overlapFrames: 0}], audio: []}));
  await data.save();
  expect(loadStudioProject(data.root)).rejects.toThrow('missing.html');
  const outside = await mkdtemp(join(tmpdir(), 'framecraft-outside-'));
  roots.push(outside);
  await writeFile(join(outside, 'next.html'), '<!doctype html>');
  await symlink(join(outside, 'next.html'), join(data.root, 'scenes/second/shots/next.html'));
  await writeFile(join(data.root, 'scenes/second/scene.json'), JSON.stringify({id: 'second', shots: [{id: 'next', entry: 'shots/next.html', durationFrames: 30, overlapFrames: 0}], audio: []}));
  expect(loadStudioProject(data.root)).rejects.toThrow('entry');
});

test('falls back to validated ids for missing titles and rejects empty-shot scenes', async () => {
  const data = await fixture();
  await writeFile(join(data.root, 'project.json'), JSON.stringify({...data.project, title: undefined}));
  await writeFile(join(data.root, 'scenes/intro/scene.json'), JSON.stringify({id: 'intro', shots: data.shots, audio: []}));
  expect((await loadStudioProject(data.root)).title).toBe('demo');
  expect((await loadStudioProject(data.root)).scenes[0]?.title).toBe('intro');
  await writeFile(join(data.root, 'scenes/intro/scene.json'), JSON.stringify({id: 'intro', shots: [], audio: []}));
  expect(loadStudioProject(data.root)).rejects.toThrow('scene.shots must be nonempty');
});

test('rejects duplicate IDs and invalid durations', async () => {
  const data = await fixture();
  data.shots[1]!.id = 'title';
  await data.save();
  expect(loadProject(data.root)).rejects.toThrow('duplicate shot id');
  data.shots[1]!.id = 'diagram';
  data.shots[1]!.durationFrames = 0;
  await data.save();
  expect(loadProject(data.root)).rejects.toThrow('durationFrames');
});

test('rejects overlaps and missing entries', async () => {
  const data = await fixture();
  data.shots[1]!.overlapFrames = 1;
  await data.save();
  expect(loadProject(data.root)).rejects.toThrow('overlapFrames');
  data.shots[1]!.overlapFrames = 0;
  data.shots[1]!.entry = 'shots/not-found.html';
  await data.save();
  expect(loadProject(data.root)).rejects.toThrow('not-found.html');
});

test('rejects traversal and symlink escapes', async () => {
  const data = await fixture();
  data.shots[1]!.entry = '../../../../outside.html';
  await data.save();
  expect(loadProject(data.root)).rejects.toThrow('entry');
  const outside = await mkdtemp(join(tmpdir(), 'framecraft-outside-'));
  roots.push(outside);
  await writeFile(join(outside, 'outside.html'), '<!doctype html>');
  await symlink(join(outside, 'outside.html'), join(data.root, 'scenes/intro/shots/link.html'));
  data.shots[1]!.entry = 'shots/link.html';
  await data.save();
  expect(loadProject(data.root)).rejects.toThrow('entry');
});

test('rejects raw absolute, URL, backslash and NUL entry paths before joining', async () => {
  const data = await fixture();
  for (const path of ['/shots/title.html', 'https://example.org/title.html', 'shots\\title.html', 'shots/title.html\0']) {
    data.shots[0]!.entry = path;
    await data.save();
    await expect(loadStudioProject(data.root)).rejects.toThrow('invalid path');
  }
});
