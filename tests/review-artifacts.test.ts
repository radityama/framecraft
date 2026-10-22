import {afterEach, expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceDigest, summaryText, verifyReview, type ReviewManifest} from '../src/review/artifacts';
import {captureFrames} from '../src/review/capture';
import {selectReviewFrames} from '../src/review/frames';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true}); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-review-source-'));
  const output = await mkdtemp(join(tmpdir(), 'framecraft-review-artifact-'));
  roots.push(root, output);
  await mkdir(join(root, 'scenes/intro/shots'), {recursive: true});
  await mkdir(join(output, 'screenshots'));
  await writeFile(join(root, 'project.json'), JSON.stringify({schemaVersion: 1, id: 'demo',
    video: {width: 2, height: 2, fps: 30}, scenes: [{id: 'intro', path: 'scenes/intro/scene.json'}], audio: []}));
  await writeFile(join(root, 'scenes/intro/scene.json'), JSON.stringify({id: 'intro', shots: [
    {id: 'only', entry: 'shots/only.html', durationFrames: 1, overlapFrames: 0}], audio: []}));
  await writeFile(join(root, 'scenes/intro/shots/only.html'), '<!doctype html>');
  const frame = selectReviewFrames([{id: 'only', startFrame: 0, durationFrames: 1}], [])[0]!;
  await writeFile(join(output, frame.path), png);
  const manifest: ReviewManifest = {schemaVersion: 1, projectId: 'demo', sceneId: 'intro',
    source: {gitCommit: 'a'.repeat(40), trackedDirty: false, untrackedDirty: false, sha256: await sourceDigest(root)},
    selection: {policy: 'boundaries-midpoints-v1', milestones: []},
    environment: {bun: '1.4.3', remotion: '4.0.537', chromium: 'Chrome',
      os: {platform: 'linux', arch: 'x64', release: 'test'}, video: {width: 2, height: 2, fps: 30}, fonts: null},
    validation: {command: 'bun run validate', exitCode: 0, warnings: [], errors: []},
    captures: [{...frame, status: 'captured', sha256: hash(png)}],
    review: {status: 'unreviewed', reviewer: null, findings: [], notes: ''}};
  const save = async () => {
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await writeFile(join(output, 'summary.md'), summaryText(manifest));
  };
  await save();
  return {root, output, manifest, frame, save};
}

test('checks summary freshness without changing either file', async () => {
  const data = await fixture();
  const path = join(data.output, 'manifest.json');
  await verifyReview(path, data.root);
  data.manifest.review.notes = 'Inspected the only still';
  await writeFile(path, JSON.stringify(data.manifest));
  await expect(verifyReview(path, data.root)).rejects.toThrow('summary');
  await verifyReview(path, data.root, {checkSummary: false});
  expect(await readFile(join(data.output, 'summary.md'), 'utf8')).not.toBe(summaryText(data.manifest));
});

test('rejects invalid review acceptance, frames, status and nested metadata', async () => {
  const data = await fixture();
  const path = join(data.output, 'manifest.json');
  data.manifest.review.status = 'accepted';
  await data.save();
  await expect(verifyReview(path, data.root)).rejects.toThrow('reviewer');
  data.manifest.review.reviewer = {kind: 'agent', name: 'Reviewer'};
  await data.save();
  await expect(verifyReview(path, data.root)).rejects.toThrow('notes');
  data.manifest.review.notes = 'Inspected only local frame 0';
  await data.save();
  await verifyReview(path, data.root);
  data.manifest.captures[0]!.globalFrame = 1;
  await data.save();
  await expect(verifyReview(path, data.root)).rejects.toThrow('frame');
  data.manifest.captures[0]!.globalFrame = 0;
  (data.manifest.captures[0] as {status: string}).status = 'unknown';
  await writeFile(path, JSON.stringify(data.manifest));
  await expect(verifyReview(path, data.root)).rejects.toThrow('status');
  (data.manifest.captures[0] as {status: string}).status = 'captured';
  (data.manifest.environment.video as {fps: unknown}).fps = '30';
  await data.save();
  await expect(verifyReview(path, data.root)).rejects.toThrow('fps');
});

test('rejects escaped, missing, corrupt and tampered PNG files', async () => {
  const data = await fixture();
  const path = join(data.output, 'manifest.json');
  data.manifest.captures[0]!.path = '../outside.png';
  await data.save();
  await expect(verifyReview(path, data.root)).rejects.toThrow('path');
  data.manifest.captures[0]!.path = data.frame.path;
  await data.save();
  await rm(join(data.output, data.frame.path));
  await expect(verifyReview(path, data.root)).rejects.toThrow();
  await writeFile(join(data.output, data.frame.path), Buffer.alloc(png.length));
  await expect(verifyReview(path, data.root)).rejects.toThrow('PNG');
  await writeFile(join(data.output, data.frame.path), Buffer.concat([png, Buffer.from('tampered')]));
  await expect(verifyReview(path, data.root)).rejects.toThrow('hash');
  await rm(join(data.output, data.frame.path));
  const outside = join(data.root, 'outside.png');
  await writeFile(outside, png);
  await symlink(outside, join(data.output, data.frame.path));
  await expect(verifyReview(path, data.root)).rejects.toThrow('path');
});

test('rejects changed source and failed validation or captures even with summary bypass', async () => {
  const data = await fixture();
  const path = join(data.output, 'manifest.json');
  data.manifest.validation.exitCode = 1;
  await data.save();
  await expect(verifyReview(path, data.root, {checkSummary: false})).rejects.toThrow('validation');
  data.manifest.validation.exitCode = 0;
  data.manifest.captures = [{...data.frame, status: 'failed', error: 'browser failed'}];
  await data.save();
  await expect(verifyReview(path, data.root, {checkSummary: false})).rejects.toThrow('failed');
  data.manifest.captures = [{...data.frame, status: 'captured', sha256: hash(png)}];
  await data.save();
  await writeFile(join(data.root, 'scenes/intro/shots/only.html'), '<h1>changed</h1>');
  await expect(verifyReview(path, data.root, {checkSummary: false})).rejects.toThrow('source');
});

test('source digest includes sorted project files and link text, never external bytes', async () => {
  const data = await fixture();
  const first = await sourceDigest(data.root);
  expect(await sourceDigest(data.root)).toBe(first);
  const outside = join(data.output, 'outside.txt');
  await writeFile(outside, 'first');
  await symlink(outside, join(data.root, 'external-link'));
  const linked = await sourceDigest(data.root);
  expect(linked).not.toBe(first);
  await writeFile(outside, 'second');
  expect(await sourceDigest(data.root)).toBe(linked);
  const other = join(data.output, 'other.txt');
  await writeFile(other, 'second');
  await rm(join(data.root, 'external-link'));
  await symlink(other, join(data.root, 'external-link'));
  expect(await sourceDigest(data.root)).not.toBe(linked);
  const afterRetarget = await sourceDigest(data.root);
  await symlink(data.output, join(data.root, 'external-directory'));
  const directoryLink = await sourceDigest(data.root);
  expect(directoryLink).not.toBe(afterRetarget);
  await writeFile(join(data.output, 'new-external-file'), 'should not be included');
  expect(await sourceDigest(data.root)).toBe(directoryLink);
  await writeFile(join(data.root, 'scenes/intro/shots/only.html'), '<h1>changed</h1>');
  expect(await sourceDigest(data.root)).not.toBe(directoryLink);
});

test('capture records partial failure, skips remaining frames and cleans partial PNG', async () => {
  const data = await fixture();
  const frames = selectReviewFrames([{id: 'many', startFrame: 0, durationFrames: 4}], []);
  let calls = 0;
  const captures = await captureFrames(frames, data.output, async (_, path) => {
    calls++;
    await writeFile(path, calls === 1 ? png : Buffer.from('partial'));
    if (calls === 2) throw new Error('browser seek failed');
  });
  expect(captures.map(item => item.status)).toEqual(['captured', 'failed', 'failed']);
  expect(captures[0]).toMatchObject({sha256: hash(png)});
  expect(captures[1]).toMatchObject({error: expect.stringContaining('browser seek failed')});
  expect(captures[2]).toMatchObject({error: expect.stringContaining('skipped')});
  expect(await readdir(join(data.output, 'screenshots'))).toEqual([
    'many-local-0000-global-0000.png', 'only-local-0000-global-0000.png',
  ]);
});

test('invalid rendered PNG is never published', async () => {
  const data = await fixture();
  const frame = selectReviewFrames([{id: 'bad', startFrame: 0, durationFrames: 1}], [])[0]!;
  const captures = await captureFrames([frame], data.output, async (_, path) => { await writeFile(path, Buffer.from('not png')); });
  expect(captures[0]).toMatchObject({status: 'failed', error: expect.stringContaining('PNG')});
  expect(await readdir(join(data.output, 'screenshots'))).toEqual(['only-local-0000-global-0000.png']);
});
