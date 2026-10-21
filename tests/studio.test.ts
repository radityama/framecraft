import {expect, test} from 'bun:test';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

test('Studio server serves the validated manifest and bundle, then cleans up', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'framecraft-studio-test-'));
  const proc = Bun.spawn(['bun', 'scripts/studio.ts'], {
    cwd: resolve(import.meta.dir, '..'),
    env: {...process.env, PORT: '0', TMPDIR: temp},
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let leftovers: string[] = [];
  try {
    const url = await new Promise<string>((resolveUrl, reject) => {
      const timer = setTimeout(() => reject(new Error('Studio server did not print a URL')), 120000);
      (async () => {
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          for (;;) {
            const {value, done} = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, {stream: true});
            const match = buffer.match(/http:\/\/127\.0\.0\.1:\d+/);
            if (match) { clearTimeout(timer); resolveUrl(match[0]); return; }
          }
        } finally { reader.releaseLock(); }
        clearTimeout(timer);
        reject(new Error(`Studio server exited before printing a URL:\n${buffer}\n${await new Response(proc.stderr).text()}`));
      })();
    });

    const manifest = await fetch(`${url}/api/project`);
    expect(manifest.status).toBe(200);
    const project = await manifest.json() as any;
    expect(project.id).toBe('demo');
    expect(project.scenes.map((scene: any) => [scene.id, scene.durationFrames])).toEqual([['intro', 330]]);

    expect((await fetch(`${url}/index.html`)).status).toBe(200);
    const shot = await fetch(`${url}/public/scenes/intro/shots/02-diagram/index.html`);
    expect(shot.status).toBe(200);
    expect(await shot.text()).toContain('framecraft.shot');
    expect((await fetch(`${url}/public/assets/fonts/fonts.css`)).status).toBe(200);

    expect((await fetch(`${url}/..%2f..%2fproject.json`)).status).toBe(403);
    expect((await fetch(`${url}/nope.txt`)).status).toBe(404);
  } finally {
    proc.kill();
    await proc.exited;
    leftovers = (await readdir(temp)).filter(name => name.startsWith('framecraft-studio-'));
    await rm(temp, {recursive: true, force: true});
  }
  expect(leftovers).toEqual([]);
}, 180000);
