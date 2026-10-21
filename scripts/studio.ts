import {bundle} from '@remotion/bundler';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import {mkdtemp, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {loadStudioProject} from '../src/spike/project';

const sourceRoot = resolve(import.meta.dir, '../projects/demo');
const bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-studio-'));

async function main() {
  const outDir = join(bundleDir, 'studio');
  const bundled = await bundle({
    entryPoint: resolve(import.meta.dir, '../src/studio/main.tsx'),
    publicDir: sourceRoot,
    outDir,
    ignoreRegisterRootWarning: true,
  });
  const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be between 0 and 65535');

  const file = async (pathname: string) => {
    const target = resolve(bundled, `.${pathname === '/' ? '/index.html' : pathname}`);
    const rel = relative(bundled, target);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return new Response('Forbidden', {status: 403});
    let actual: string;
    try { actual = await realpath(target); }
    catch { return new Response('Not found', {status: 404}); }
    const real = relative(bundled, actual);
    if (real === '..' || real.startsWith(`..${sep}`) || isAbsolute(real)) return new Response('Forbidden', {status: 403});
    const response = Bun.file(actual);
    return await response.exists() ? new Response(response) : new Response('Not found', {status: 404});
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      if (pathname === '/api/project') {
        try {
          return Response.json(await loadStudioProject(sourceRoot));
        } catch (error) {
          return Response.json({error: error instanceof Error ? error.message : String(error)}, {status: 500});
        }
      }
      return file(pathname);
    },
  });

  const shutdown = async () => {
    await server.stop(true);
    await rm(bundleDir, {recursive: true, force: true});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(`Framecraft Studio: http://127.0.0.1:${server.port}/`);
}

main().catch(async error => {
  console.error(error);
  await rm(bundleDir, {recursive: true, force: true});
  process.exit(1);
});
