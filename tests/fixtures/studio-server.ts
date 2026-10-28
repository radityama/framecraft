import {resolve} from 'node:path';

export async function startStudio(args: string[] = [], env: Record<string, string> = {}) {
  const proc = Bun.spawn([process.execPath, 'scripts/studio.ts', ...args], {
    cwd: resolve(import.meta.dir, '../..'), env: {...process.env, PORT: '0', ...env}, stdout: 'pipe', stderr: 'pipe',
  });
  const stderr = new Response(proc.stderr).text();
  let timer: ReturnType<typeof setTimeout>;
  try {
    const url = await Promise.race([
      (async () => {
        const reader = proc.stdout.getReader();
        let output = '';
        try {
          for (;;) {
            const {done, value} = await reader.read();
            if (done) throw new Error(`Studio exited before startup: ${output}\n${await stderr}`);
            output += new TextDecoder().decode(value);
            const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
            if (match) return match[0];
          }
        } finally { reader.releaseLock(); }
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Studio startup timed out')), 120000); }),
    ]);
    return {url, stop: async () => { proc.kill(); await proc.exited; return await stderr; }};
  } catch (error) { proc.kill(); await proc.exited; throw error; }
  finally { clearTimeout(timer!); }
}
