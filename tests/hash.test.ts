import {expect, test} from 'bun:test';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

test('hash records twelve rendered frames, font metadata, and renderer environment', async () => {
  const root = resolve(import.meta.dir, '..');
  const temp = await mkdtemp(join(tmpdir(), 'framecraft-hash-test-'));
  const bundles = async () => (await readdir(temp)).filter(name => /^(remotion-webpack-bundle-|framecraft-bundle-)/.test(name));
  const run = async (chromeBin?: string) => {
    const command = Bun.spawn([process.execPath, 'run', 'hash'], {cwd: root, env: {...process.env, TMPDIR: temp, ...(chromeBin ? {CHROME_BIN: chromeBin} : {})}, stdout: 'pipe', stderr: 'pipe'});
    const [exitCode, stdout, stderr] = await Promise.all([command.exited, new Response(command.stdout).text(), new Response(command.stderr).text()]);
    return {exitCode, output: stdout + stderr};
  };
  try {
    const success = await run();
    expect(success.output).toContain('output/hashes.json');
    expect(success.exitCode).toBe(0);
    expect(await bundles()).toEqual([]);
    const reportFile = resolve(root, 'output/hashes.json');
    const original = await readFile(reportFile);
    const report = JSON.parse(original.toString());
    expect(report.environment.bun).toBe(Bun.version);
    expect(report.environment.remotion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(report.environment.chromium).toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(report.environment.os).toEqual({platform: process.platform, release: expect.any(String), arch: process.arch});
    expect(report.environment.fonts === null || Array.isArray(report.environment.fonts)).toBe(true);
    for (const font of report.environment.fonts || []) expect(font).toEqual({family: expect.any(String), file: expect.any(String)});
    expect(Object.keys(report.frames)).toEqual(['title:0', 'title:30', 'title:59', 'diagram:0', 'diagram:30', 'diagram:70', 'close:0', 'close:59', 'commit:0', 'commit:30', 'commit:75', 'commit:119']);
    for (const hash of Object.values(report.frames)) expect(hash).toMatch(/^[a-f0-9]{64}$/);
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await run()).exitCode).toBe(0);
      expect(JSON.parse(await readFile(reportFile, 'utf8')).frames).toEqual(report.frames);
    }
    const failed = await run(join(temp, 'missing-chrome'));
    expect(failed.exitCode).not.toBe(0);
    expect(await bundles()).toEqual([]);
    expect(await readFile(reportFile)).toEqual(original);
  } finally { await rm(temp, {recursive: true, force: true}); }
}, 180_000);
