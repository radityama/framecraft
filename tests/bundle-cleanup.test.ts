import {afterAll, expect, test} from 'bun:test';
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const repo = resolve(import.meta.dir, '..');
const roots: string[] = [];
afterAll(async () => { for (const root of roots) await rm(root, {recursive: true, force: true}); });

test('snap removes only its own bundle after success and post-bundle failure', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'framecraft-bundle-test-'));
  roots.push(temp);
  const run = async (chromeBin?: string) => {
    const command = Bun.spawn([process.execPath, 'run', 'snap', '--shot', 'title', '--frame', '0'], {
      cwd: repo, env: {...process.env, TMPDIR: temp, ...(chromeBin ? {CHROME_BIN: chromeBin} : {})}, stdout: 'pipe', stderr: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([command.exited, new Response(command.stdout).text(), new Response(command.stderr).text()]);
    return {exitCode, output: stdout + stderr};
  };
  const bundles = async () => (await readdir(temp)).filter(name => /^(remotion-webpack-bundle-|framecraft-bundle-)/.test(name));
  const before = await bundles();
  const success = await run();
  expect(success.exitCode).toBe(0);
  expect(await bundles()).toEqual(before);
  const still = resolve(repo, 'output/snaps/title-0.png');
  const previous = await readFile(still);
  const failed = await run(join(temp, 'missing-chrome'));
  expect(failed.exitCode).not.toBe(0);
  expect(await bundles()).toEqual(before);
  expect(await readFile(still)).toEqual(previous);
}, 120_000);
