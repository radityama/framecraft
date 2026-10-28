import {expect, test} from 'bun:test';
import {mkdtemp, readdir, rm, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const cwd = resolve(import.meta.dir, '..');
async function run(script: string, args: string[]) {
  const proc = Bun.spawn([process.execPath, 'scripts/' + script + '.ts', ...args], {cwd, stdout: 'pipe', stderr: 'pipe'});
  const [exit, out, err] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return {exit, output: out + err};
}

test('CLI help is side-effect free and invalid selection/arguments preserve existing outputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-cli-'));
  try {
    for (const script of ['spike', 'hash', 'review', 'studio', 'validate']) {
      const result = await run(script, ['--help']);
      expect(result.exit).toBe(0);
      expect(result.output).toContain('Usage:');
    }
    const output = join(root, 'prior.png');
    await writeFile(output, 'prior-good');
    for (const args of [
      ['--project', '--frame', '0'], ['--scene', 'intro', '--scene', 'intro', '--frame', '0'],
      ['--project', 'projects/showcase', '--frame', '0'], ['--scene', 'missing', '--frame', '0'],
      ['--project', join(root, 'missing'), '--frame', '0'], ['--shot', '../title', '--frame', '0'],
    ]) {
      expect((await run('spike', ['still', ...args, '--output', output])).exit).not.toBe(0);
      expect(await readFile(output, 'utf8')).toBe('prior-good');
    }
    expect(await readdir(root)).toEqual(['prior.png']);
  } finally { await rm(root, {recursive: true, force: true}); }
}, 30000);
