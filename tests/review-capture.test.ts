import {expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {sourceDigest, type ReviewManifest} from '../src/review/artifacts';

const repo = resolve(import.meta.dir, '..');
const run = async (args: string[], env = process.env) => {
  const proc = Bun.spawn(args, {cwd: repo, env, stdout: 'pipe', stderr: 'pipe'});
  const [out, err, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return {out, err, exit};
};
const review = (args: string[], env?: NodeJS.ProcessEnv) => run(['bun', 'run', 'review', ...args], env);
const sourceStatus = () => run(['git', 'status', '--porcelain', '--untracked-files=all', '--', 'projects/demo']);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('retains repeatable PNGs and never writes source or replaces review output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-review-test-'));
  const first = join(root, 'first');
  const second = join(root, 'second');
  const sourceBefore = (await sourceStatus()).out;
  const digestBefore = await sourceDigest(join(repo, 'projects/demo'));
  try {
    const args = ['--milestone', 'diagram:70'];
    expect((await review(['--output', first, ...args])).exit).toBe(0);
    const manifestPath = join(first, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ReviewManifest;
    expect(manifest.captures).toHaveLength(17);
    expect(manifest.review.status).toBe('unreviewed');
    for (const capture of manifest.captures) {
      expect(capture.status).toBe('captured');
      if (capture.status !== 'captured') continue;
      const bytes = await readFile(join(first, capture.path));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(digest(bytes)).toBe(capture.sha256);
    }
    expect((await review(['--check', manifestPath])).exit).toBe(0);
    manifest.review.status = 'needs-revision';
    manifest.review.notes = 'Checked image set; follow-up planned';
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    expect((await review(['--check', manifestPath])).exit).not.toBe(0);
    expect((await review(['--summary', manifestPath])).exit).toBe(0);
    expect((await review(['--check', manifestPath])).exit).toBe(0);
    const summaryBefore = await readFile(join(first, 'summary.md'));
    const screenshot = join(first, manifest.captures[0]!.path);
    const screenshotBefore = await readFile(screenshot);
    await writeFile(screenshot, Buffer.from('broken'));
    expect((await review(['--summary', manifestPath])).exit).not.toBe(0);
    expect(await readFile(join(first, 'summary.md'))).toEqual(summaryBefore);
    await writeFile(screenshot, screenshotBefore);
    expect((await review(['--output', first])).exit).not.toBe(0);
    expect((await review(['--output', second, ...args])).exit).toBe(0);
    const replay = JSON.parse(await readFile(join(second, 'manifest.json'), 'utf8')) as ReviewManifest;
    expect(replay.captures.map(item => item.status === 'captured' ? item.sha256 : null))
      .toEqual(manifest.captures.map(item => item.status === 'captured' ? item.sha256 : null));
    for (const flags of [['--output', join(root, 'invalid'), '--milestone', 'diagram:90'],
      ['--output', join(root, 'missing-value'), '--milestone'],
      ['--output', join(root, 'unknown'), '--unknown', 'x'],
      ['--output', join(root, 'duplicate'), '--output', join(root, 'other')]]) {
      expect((await review(flags)).exit).not.toBe(0);
      await expect(stat(flags[1]!)).rejects.toThrow();
    }
    const forbidden = join(repo, 'projects/demo/review-must-not-exist');
    expect((await review(['--output', forbidden])).exit).not.toBe(0);
    await expect(stat(forbidden)).rejects.toThrow();
    const alias = join(root, 'alias');
    await symlink(join(repo, 'projects/demo'), alias);
    expect((await review(['--output', join(alias, 'review-must-not-exist')])).exit).not.toBe(0);
    await expect(stat(forbidden)).rejects.toThrow();
    expect((await sourceStatus()).out).toBe(sourceBefore);
    expect(await sourceDigest(join(repo, 'projects/demo'))).toBe(digestBefore);
  } finally { await rm(root, {recursive: true, force: true}); }
}, 420000);

test('browser launch failure retains failed review without leaving a bundle; invalid milestones stay artifact-free', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-review-failed-browser-'));
  const browser = join(root, 'fake-chrome');
  const output = join(root, 'failed');
  const invalid = join(root, 'invalid');
  const env = {...process.env, CHROME_BIN: browser, TMPDIR: root};
  const sourceBefore = await sourceDigest(join(repo, 'projects/demo'));
  const statusBefore = (await sourceStatus()).out;
  try {
    await writeFile(browser, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Chromium 157.0.8080.0"; else exit 1; fi\n');
    await chmod(browser, 0o755);
    const result = await review(['--output', output], env);
    expect(result.exit).not.toBe(0);
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) as ReviewManifest;
    expect(manifest.captures).toHaveLength(16);
    expect(manifest.captures.every(capture => capture.status === 'failed')).toBe(true);
    expect(manifest.captures[0]).toMatchObject({status: 'failed', error: expect.stringContaining('browser')});
    expect(manifest.captures.slice(1).every(capture => capture.status === 'failed' && capture.error.includes('skipped'))).toBe(true);
    expect(await readFile(join(output, 'summary.md'), 'utf8')).toContain('Review: unreviewed');
    expect((await review(['--check', join(output, 'manifest.json')])).exit).not.toBe(0);
    expect((await readdir(root)).filter(name => name.startsWith('framecraft-bundle-'))).toEqual([]);
    expect((await review(['--output', invalid, '--milestone', 'diagram:90'], env)).exit).not.toBe(0);
    await expect(stat(invalid)).rejects.toThrow();
    expect((await sourceStatus()).out).toBe(statusBefore);
    expect(await sourceDigest(join(repo, 'projects/demo'))).toBe(sourceBefore);
  } finally { await rm(root, {recursive: true, force: true}); }
}, 120000);

test('rejects output through a symlink into a selected external project', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'framecraft-review-external-'));
  const project = join(workspace, 'project');
  const alias = join(workspace, 'alias');
  try {
    await mkdir(join(project, 'scenes/second/shots'), {recursive: true});
    await writeFile(join(project, 'project.json'), JSON.stringify({schemaVersion: 1, id: 'external',
      video: {width: 2, height: 2, fps: 30}, scenes: [{id: 'second', path: 'scenes/second/scene.json'}], audio: []}));
    await writeFile(join(project, 'scenes/second/scene.json'), JSON.stringify({id: 'second', shots: [
      {id: 'only', entry: 'shots/only.html', durationFrames: 1, overlapFrames: 0}], audio: []}));
    await writeFile(join(project, 'scenes/second/shots/only.html'), '<!doctype html>');
    await symlink(project, alias);
    const output = join(alias, 'reviews', 'capture');
    const result = await review(['--project', project, '--scene', 'second', '--output', output]);
    expect(result.exit).not.toBe(0);
    expect(result.err).toContain('Output cannot be inside project');
    await expect(stat(join(project, 'reviews'))).rejects.toThrow();
  } finally { await rm(workspace, {recursive: true, force: true}); }
});

test('real noninitial-scene review rejects wrong selection, missing/corrupt PNGs and changed source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-review-showcase-'));
  const project = join(root, 'project');
  const output = join(root, 'review');
  await cp(join(repo, 'projects/showcase'), project, {recursive: true});
  const args = ['--project', project, '--scene', 'signal'];
  try {
    const before = await sourceDigest(project);
    expect((await review([...args, '--output', output, '--milestone', 'receive:24'])).exit).toBe(0);
    const path = join(output, 'manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8')) as ReviewManifest;
    expect(manifest.projectId).toBe('showcase');
    expect(manifest.sceneId).toBe('signal');
    expect(manifest.captures).toHaveLength(7);
    expect(manifest.captures.find(capture => capture.shotId === 'receive' && capture.localFrame === 0)?.globalFrame).toBe(48);
    expect(manifest.review.status).toBe('unreviewed');
    expect(manifest.source.sha256).toBe(before);
    expect((await review([...args, '--check', path])).exit).toBe(0);
    expect((await review(['--project', project, '--scene', 'pulse', '--check', path])).exit).not.toBe(0);
    const screenshot = join(output, manifest.captures[0]!.path);
    const bytes = await readFile(screenshot);
    await rm(screenshot);
    expect((await review([...args, '--check', path])).exit).not.toBe(0);
    await writeFile(screenshot, 'corrupt PNG');
    expect((await review([...args, '--check', path])).exit).not.toBe(0);
    await writeFile(screenshot, bytes);
    expect((await review([...args, '--check', path])).exit).toBe(0);
    expect(await sourceDigest(project)).toBe(before);
    const brief = join(project, 'scenes/signal/brief.md');
    await writeFile(brief, `${await readFile(brief, 'utf8')}\nChanged after capture\n`);
    expect((await review([...args, '--check', path])).exit).not.toBe(0);
  } finally { await rm(root, {recursive: true, force: true}); }
}, 180000);
