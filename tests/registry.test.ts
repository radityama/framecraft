import {expect, test} from 'bun:test';
import {mkdtemp, mkdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {discoverProjects} from '../src/spike/registry';

async function project(root: string, id: string) {
  await mkdir(join(root, 'shots'), {recursive: true});
  await writeFile(join(root, 'project.json'), JSON.stringify({schemaVersion: 1, id, title: id,
    video: {width: 100, height: 100, fps: 30}, scenes: [{id: 'intro', path: 'scene.json'}], audio: []}));
  await writeFile(join(root, 'scene.json'), JSON.stringify({id: 'intro', shots: [
    {id: 'first', entry: 'shots/first.html', durationFrames: 5, overlapFrames: 0}], audio: []}));
  await writeFile(join(root, 'shots/first.html'), '<!doctype html><title>First</title>');
}

test('discovery isolates invalid, duplicate, symlinked, and unauthorized projects', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'framecraft-registry-'));
  try {
    const directory = join(temp, 'projects');
    await mkdir(directory);
    await project(join(directory, 'one'), 'one');
    await project(join(directory, 'two'), 'two');
    await project(join(directory, 'duplicate'), 'one');
    await mkdir(join(directory, 'invalid'));
    await writeFile(join(directory, 'invalid/project.json'), '{oops');
    await project(join(temp, 'external'), 'external');
    await symlink(join(temp, 'external'), join(directory, 'outside'));

    const discovered = await discoverProjects(directory);
    expect([...discovered.projects.keys()]).toEqual(['two']);
    expect(discovered.warnings.join('\n')).toContain('duplicate project id one');
    expect(discovered.warnings.join('\n')).toContain('invalid');
    expect(discovered.warnings.join('\n')).toContain('outside');

    const explicit = await discoverProjects(directory, join(temp, 'external'));
    expect([...explicit.projects.keys()]).toEqual(['external', 'two']);
    expect(explicit.warnings.join('\n')).not.toContain(temp);
    await expect(discoverProjects(directory, join(directory, 'one'))).rejects.toThrow('duplicate project id one');
    await expect(discoverProjects(directory, join(temp, 'missing'))).rejects.toThrow();
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
});

test('discovery is ordered by project ID, ignores unrelated directories, and canonicalizes explicit aliases', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'framecraft-registry-'));
  try {
    const directory = join(temp, 'projects');
    await mkdir(directory);
    await project(join(directory, 'a-folder'), 'z-last');
    await project(join(directory, 'z-folder'), 'a-first');
    await mkdir(join(directory, 'notes'));
    await writeFile(join(directory, 'notes/readme.txt'), 'not a project');
    const alias = join(temp, 'alias');
    await symlink(join(directory, 'a-folder'), alias);
    const registry = await discoverProjects(directory, alias);
    expect([...registry.projects.keys()]).toEqual(['a-first', 'z-last']);
    expect(registry.warnings).toEqual([]);
  } finally { await rm(temp, {recursive: true, force: true}); }
});
