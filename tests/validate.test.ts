import {afterEach, expect, test} from 'bun:test';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const repo = resolve(import.meta.dir, '..');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true}); });

function validate(...args: string[]) {
  const result = Bun.spawnSync([process.execPath, ...args], {cwd: repo});
  return {exitCode: result.exitCode, output: Buffer.from(result.stdout).toString() + Buffer.from(result.stderr).toString()};
}

test('validate reports durations and nonfatal warnings for risky shot source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-validate-'));
  roots.push(root);
  await mkdir(join(root, 'scenes/intro/shots'), {recursive: true});
  await writeFile(join(root, 'project.json'), JSON.stringify({schemaVersion: 1, id: 'fixture', video: {width: 1920, height: 1080, fps: 30}, scenes: [{id: 'intro', path: 'scenes/intro/scene.json'}], audio: []}));
  await writeFile(join(root, 'scenes/intro/scene.json'), JSON.stringify({id: 'intro', shots: [{id: 'risky', entry: 'shots/risky.html', durationFrames: 60, overlapFrames: 0}], audio: []}));
  await writeFile(join(root, 'scenes/intro/shots/risky.html'), '<script>setInterval(fn, 100); requestAnimationFrame(loop); fetch("https://example.org"); Math.random();</script>');

  const result = validate('scripts/validate.ts', root);
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain('risky: 60 frames (2 seconds)');
  for (const warning of ['setInterval', 'requestAnimationFrame', 'fetch(', 'http:// or https://', 'Math.random']) {
    expect(result.output).toContain(`warning [risky]: ${warning}`);
  }
});

test('validate reports all demo shots with no warnings', () => {
  const result = validate('run', 'validate');
  expect(result.exitCode).toBe(0);
  for (const shot of ['title: 60 frames (2 seconds)', 'diagram: 90 frames (3 seconds)', 'close: 60 frames (2 seconds)', 'commit: 120 frames (4 seconds)']) {
    expect(result.output).toContain(shot);
  }
  expect(result.output).not.toContain('warning [');
});
