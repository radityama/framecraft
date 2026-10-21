import {expect, test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

test('hash records six rendered frames and renderer environment', async () => {
  const root = resolve(import.meta.dir, '..');
  const command = Bun.spawn([process.execPath, 'run', 'hash'], {cwd: root, stdout: 'pipe', stderr: 'pipe'});
  const [exitCode, stdout, stderr] = await Promise.all([command.exited, new Response(command.stdout).text(), new Response(command.stderr).text()]);
  expect(`${stdout}\n${stderr}`).toContain('output/hashes.json');
  expect(exitCode).toBe(0);
  const report = JSON.parse(await readFile(resolve(root, 'output/hashes.json'), 'utf8'));
  expect(report.environment.bun).toBe(Bun.version);
  expect(report.environment.remotion).toMatch(/^\d+\.\d+\.\d+$/);
  expect(report.environment.chromium).toMatch(/\d+\.\d+\.\d+\.\d+/);
  expect(report.environment.os).toEqual({platform: process.platform, release: expect.any(String), arch: process.arch});
  expect(Object.keys(report.frames)).toEqual(['title:0', 'title:30', 'diagram:0', 'diagram:30', 'diagram:70', 'close:59']);
  for (const hash of Object.values(report.frames)) expect(hash).toMatch(/^[a-f0-9]{64}$/);
}, 180_000);
