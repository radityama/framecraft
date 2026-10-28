import {expect, test} from 'bun:test';
import {mkdtemp, mkdir, readFile, readdir, rm, symlink, unlink, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {cleanupRun, createRun, fileIdentity, loadRun, paths, publishFile, reserve, safePath, saveRun, seal, withRunLock, writeRecord, type Run} from '../src/production/lifecycle';

async function fixture(action: (repo: string, run: Run) => Promise<void>) {
  const repo = await mkdtemp('/tmp/opencode/production-cleanup-');
  try {await action(repo, await createRun(repo, 'fixture', 'scene', 'a'.repeat(64)));}
  finally {await rm(repo, {recursive: true, force: true});}
}
async function owned(repo: string, run: Run, path = 'candidate.mp4', content = 'fixture media') {
  const file = await reserve(repo, run, path, path.endsWith('.mp4') ? 'draft-video' : 'preview');
  await writeFile(file, content); await seal(repo, run, path); return file;
}
async function published(repo: string, run: Run) {
  const file = await owned(repo, run); run.status = 'prepared'; await saveRun(repo, run);
  await publishFile(repo, run, await fileIdentity(file)); run.status = 'published'; await saveRun(repo, run);
}
test('cleanup removes only sealed current-run media, preserves everything else and is idempotent', async () => {
  await fixture(async (repo, run) => {
    const preview = await owned(repo, run, 'previews/first.png', 'pixels');
    const old = await createRun(repo, 'fixture', 'scene', 'b'.repeat(64)); const oldFile = await owned(repo, old, 'old.png', 'old evidence');
    await mkdir(join(repo, 'projects/fixture'), {recursive: true});
    await writeFile(join(repo, 'projects/fixture/source.html'), 'source');
    await writeRecord(repo, run, 'findings.md', 'permanent review');
    const unknown = join(repo, paths(run).work, 'user.png'); await writeFile(unknown, 'user pixels');
    const note = join(repo, paths(run).work, 'notes.md'); await writeFile(note, 'do not delete');
    await published(repo, run);
    const final = join(repo, paths(run).final), expected = (await fileIdentity(preview)).bytes + (await fileIdentity(final)).bytes;
    expect(await cleanupRun(repo, run)).toMatchObject({filesRemoved: 2, bytesReclaimed: expected, failures: []});
    for (const [file, content] of [[unknown, 'user pixels'], [note, 'do not delete'], [oldFile, 'old evidence'], [join(repo, 'projects/fixture/source.html'), 'source'], [join(repo, paths(run).records, 'findings.md'), 'permanent review']]) expect(await readFile(file!, 'utf8')).toBe(content!);
    expect(await readdir(join(repo, 'output/fixture/final'))).toEqual([paths(run).final.split('/').at(-1)!]);
    expect(await cleanupRun(repo, run)).toMatchObject({filesRemoved: 0, bytesReclaimed: 0});
    expect((await loadRun(repo, 'fixture', 'scene', run.runId)).cleanup.filesRemoved).toBe(2);
    expect(await Bun.file(final).exists()).toBe(true);
  });
});
test('failed/prepared runs retain diagnostics and an altered final blocks all cleanup', async () => {
  await fixture(async (repo, run) => {
    const preview = await owned(repo, run, 'diagnostic.png');
    for (const state of ['preparing', 'failed', 'prepared'] as const) {run.status = state; await expect(cleanupRun(repo, run)).rejects.toThrow('publication');}
    run.status = 'preparing'; await published(repo, run);
    await writeFile(join(repo, paths(run).final), 'tampered');
    await expect(cleanupRun(repo, run)).rejects.toThrow('changed');
    expect(await Bun.file(preview).exists()).toBe(true);
  });
});
test('unsafe roots, traversal, symlinks, protected kinds and preexisting files are refused', async () => {
  await fixture(async (repo, run) => {
    for (const path of ['../escape.png', '/tmp/escape.png', 'x/../../escape.png', 'x\\escape.png', 'x//escape.png']) await expect(reserve(repo, run, path, 'preview')).rejects.toThrow();
    await expect(reserve(repo, run, 'notes.md', 'preview')).rejects.toThrow('protected');
    const p = paths(run), existing = join(repo, p.work, 'existing.png'); await writeFile(existing, 'user');
    await expect(reserve(repo, run, 'existing.png', 'preview')).rejects.toThrow('existing');
    await symlink('/tmp', join(repo, p.work, 'alias'));
    await expect(reserve(repo, run, 'alias/escape.png', 'preview')).rejects.toThrow('symlink');
    await expect(safePath(repo, 'docs/../output')).rejects.toThrow('unsafe');
    await expect(loadRun(repo, 'fixture', 'scene', '../')).rejects.toThrow('UUID');
    const second = await mkdtemp('/tmp/opencode/production-root-');
    try {await symlink(second, join(repo, 'output/other')); await expect(createRun(repo, 'other', 'scene', 'a'.repeat(64))).rejects.toThrow('symlink');}
    finally {await rm(second, {recursive: true, force: true});}
  });
});
test('changed/unsealed/symlink-swapped files survive; no guessed extension ownership', async () => {
  await fixture(async (repo, run) => {
    const changed = await owned(repo, run, 'changed.png'); await writeFile(changed, 'new user data');
    const unsealed = await reserve(repo, run, 'unsealed.png', 'preview'); await writeFile(unsealed, 'interrupted capture');
    const swapped = await owned(repo, run, 'swapped.png'); await unlink(swapped); await symlink(changed, swapped);
    await published(repo, run);
    const result = await cleanupRun(repo, run);
    expect(result.filesRemoved).toBe(1); expect(result.failures).toHaveLength(1); expect(result.preserved).toHaveLength(2);
    expect(await readFile(changed, 'utf8')).toBe('new user data'); expect(await readFile(unsealed, 'utf8')).toBe('interrupted capture');
  });
});
test('publication cannot overwrite a final and locks prevent concurrent operations', async () => {
  await fixture(async (repo, run) => {
    await published(repo, run); run.status = 'prepared';
    await expect(publishFile(repo, run, await fileIdentity(join(repo, paths(run).final)))).rejects.toThrow();
    await withRunLock(repo, run, async () => {await expect(withRunLock(repo, run, async () => {})).rejects.toThrow();});
    await withRunLock(repo, run, async () => {});
  });
});
