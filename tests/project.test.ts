import {afterEach, expect, test} from 'bun:test';
import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {loadProject} from '../src/spike/project';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true});
});

async function fixture() {
  const root = await mkdtemp('/tmp/opencode/framecraft-test-');
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
  const outside = await mkdtemp('/tmp/opencode/framecraft-outside-');
  roots.push(outside);
  await writeFile(join(outside, 'outside.html'), '<!doctype html>');
  await symlink(join(outside, 'outside.html'), join(data.root, 'scenes/intro/shots/link.html'));
  data.shots[1]!.entry = 'shots/link.html';
  await data.save();
  expect(loadProject(data.root)).rejects.toThrow('entry');
});
