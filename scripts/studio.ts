import {bundle} from '@remotion/bundler';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import {mkdtemp, realpath, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {discoverProjects} from '../src/spike/registry';
import {projectRoot, selectScene} from '../src/spike/selection';
import type {StudioProject} from '../src/spike/project';
import type {StudioCatalog} from '../src/studio/catalog';
import {createReviewApi} from '../src/studio/review-api';

const idPattern = /^[a-z0-9][a-z0-9-]*$/;

function inside(base: string, target: string): boolean {
  const path = relative(base, target);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function browserProject(project: StudioProject): StudioProject {
  const asset = (path: string) => `${project.id}/${path}`;
  return {...project, scenes: project.scenes.map(scene => ({...scene,
    shots: scene.shots.map(shot => ({...shot, entry: asset(shot.entry),
      audio: shot.audio.map(cue => ({...cue, src: asset(cue.src)}))})),
    audio: scene.audio.map(cue => ({...cue, src: asset(cue.src)})),
  }))};
}

async function main() {
  if (Bun.argv.slice(2).includes('--help')) {
    console.log('Usage: bun run studio [--project <path>] [--scene <id>] [--workspace <path>] [--review <capture-directory>]...\nDefaults to demo/intro. Feedback lives in output/studio-workspace, outside source and immutable captures.');
    return;
  }
  let projectArg: string | undefined;
  let sceneArg: string | undefined;
  let workspaceArg: string | undefined;
  const reviews: string[] = [];
  for (let index = 0; index < Bun.argv.length - 2; index++) {
    const flag = Bun.argv[index + 2];
    if (!['--project', '--scene', '--workspace', '--review'].includes(flag!)) throw new Error(`Unknown option: ${flag}`);
    const value = Bun.argv[++index + 2];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--project') {
      if (projectArg !== undefined) throw new Error('--project specified twice');
      projectArg = value;
    } else if (flag === '--scene') {
      if (sceneArg !== undefined) throw new Error('--scene specified twice');
      sceneArg = value;
    } else if (flag === '--workspace') {
      if (workspaceArg !== undefined) throw new Error('--workspace specified twice');
      workspaceArg = value;
    } else {
      reviews.push(value);
    }
  }
  const registry = await discoverProjects(resolve(import.meta.dir, '../projects'), projectArg ? await projectRoot(projectArg) : undefined);
  for (const warning of registry.warnings) console.warn(`Studio project skipped: ${warning}`);
  const selectedRoot = await projectRoot(projectArg);
  const selected = [...registry.projects.values()].find(candidate => candidate.root === selectedRoot);
  if (!selected) throw new Error(`Selected project is not authorized: ${selectedRoot}`);
  const selectedScene = sceneArg !== undefined || selected.project.scenes.length
    ? selectScene(selected.project, sceneArg ?? selected.project.scenes[0]?.id) : undefined;
  const catalog: StudioCatalog = {projects: [...registry.projects.values()].map(({project}) => ({
    id: project.id, title: project.title,
    scenes: project.scenes.map(({id, title, durationFrames}) => ({id, title, durationFrames})),
  })), warnings: registry.warnings, selected: {projectId: selected.project.id, sceneId: selectedScene?.id ?? null}};
  const demo = registry.projects.get('demo');
  const reviewApi = await createReviewApi(registry, workspaceArg ?? 'output/studio-workspace', reviews);
  const bundleDir = await mkdtemp(join(tmpdir(), 'framecraft-studio-'));
  try {
  const outDir = join(bundleDir, 'studio');
  const bundled = await bundle({
    entryPoint: resolve(import.meta.dir, '../src/studio/main.tsx'),
    publicDir: null,
    outDir,
    ignoreRegisterRootWarning: true,
  });
  const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be between 0 and 65535');

  const file = async (base: string, pathname: string) => {
    if (pathname.split('/').some(segment => segment === '..' || segment === '.' || segment.includes('\\') || segment.includes('\0')))
      return new Response('Forbidden', {status: 403});
    const target = resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!inside(base, target)) return new Response('Forbidden', {status: 403});
    let actual: string;
    try { actual = await realpath(target); }
    catch { return new Response('Not found', {status: 404}); }
    if (!inside(base, actual)) return new Response('Forbidden', {status: 403});
    if (!(await stat(actual)).isFile()) return new Response('Not found', {status: 404});
    const response = Bun.file(actual);
    return new Response(response);
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.hostname !== '127.0.0.1') return new Response('Forbidden host', {status: 403});
      const reviewResponse = await reviewApi(request, url);
      if (reviewResponse) return reviewResponse;
      let pathname: string;
      try { pathname = decodeURIComponent(url.pathname); }
      catch { return new Response('Bad path', {status: 400}); }
      if (pathname === '/api/projects') {
        return Response.json(catalog, {headers: {'Cache-Control': 'no-store'}});
      }
      if (pathname === '/api/project') {
        const ids = url.searchParams.getAll('id');
        if (ids.length > 1 || (ids.length === 1 && !idPattern.test(ids[0]!))) return Response.json({error: 'Invalid project id'}, {status: 400});
        if (!ids.length) return demo ? Response.json(demo.project) : Response.json({error: 'Demo project unavailable'}, {status: 404});
        const entry = registry.projects.get(ids[0]!);
        return entry ? Response.json(browserProject(entry.project)) : Response.json({error: 'Project not found'}, {status: 404});
      }
      if (pathname.startsWith('/public/')) {
        const [, , name, ...rest] = pathname.split('/');
        if (name === 'assets' || name === 'scenes' || name === 'runtime.js') {
          return demo ? file(demo.root, pathname.slice('/public'.length)) : new Response('Not found', {status: 404});
        }
        if (!idPattern.test(name ?? '') || !rest.length || rest.some(segment => !segment || segment === '.' || segment === '..'))
          return new Response('Forbidden', {status: 403});
        const entry = registry.projects.get(name!);
        return entry ? file(entry.root, `/${rest.join('/')}`) : new Response('Not found', {status: 404});
      }
      return file(bundled, pathname);
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
  } catch (error) {
    await rm(bundleDir, {recursive: true, force: true});
    throw error;
  }
}

main().catch(async error => {
  console.error(error);
  process.exit(1);
});
