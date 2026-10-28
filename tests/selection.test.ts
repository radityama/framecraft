import {expect, test} from 'bun:test';
import {mkdtemp, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {loadStudioProject} from '../src/spike/project';
import {projectRoot, selectScene} from '../src/spike/selection';

test('demo defaults to intro and rejects malformed selectors', async () => {
  const project = await loadStudioProject(await projectRoot());
  expect(selectScene(project).id).toBe('intro');
  for (const value of ['../intro', 'Intro', '', 'missing']) {
    expect(() => selectScene(project, value)).toThrow('scene');
  }
  expect(await projectRoot('projects/demo')).toBe(resolve('projects/demo'));
});

test('omitted scene requires exactly one, including for empty projects', () => {
  const empty = {id: 'empty', title: 'Empty', video: {width: 1, height: 1, fps: 1}, scenes: []};
  expect(() => selectScene(empty)).toThrow('scene');
  expect(() => selectScene(empty, 'intro')).toThrow('scene');
});

test('explicit project roots resolve symlinks canonically', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'framecraft-selection-'));
  try {
    const alias = join(parent, 'alias');
    await symlink(resolve('projects/demo'), alias);
    expect(await projectRoot(alias)).toBe(resolve('projects/demo'));
    await expect(projectRoot(join(parent, 'missing'))).rejects.toThrow();
  } finally {
    await rm(parent, {recursive: true, force: true});
  }
});
