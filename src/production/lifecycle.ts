import {createHash, randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {link, lstat, mkdir, open, readFile, readdir, realpath, rename, unlink} from 'node:fs/promises';
import {dirname, extname, join} from 'node:path';
import {hash, id, integer, object, text} from './contracts';

type Kind = 'preview' | 'draft-video' | 'intermediate-audio' | 'test-capture';
type Owned = {path: string; kind: Kind; bytes: number | null; sha256: string | null; removed: boolean};
export type Cleanup = {filesRemoved: number; bytesReclaimed: number; preserved: Array<{path: string; reason: string}>; failures: string[]};
export type Run = {schemaVersion: 1; projectId: string; sceneId: string; runId: string; sourceSha256: string;
  status: 'preparing' | 'prepared' | 'published' | 'failed'; owned: Owned[];
  published: null | {path: string; sha256: string; bytes: number}; cleanup: Cleanup; failure: string | null};

function segments(path: string): string[] {
  if (!path || /[\\\0:?#]|^\//.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`unsafe relative path: ${path}`);
  return path.split('/');
}
export function runId(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new Error('invalid production run UUID');
}
function disposable(path: string, kind: Kind): void {
  segments(path);
  const allowed: Record<Kind, string[]> = {'preview': ['.png', '.jpg'], 'test-capture': ['.png', '.jpg'], 'draft-video': ['.mp4'], 'intermediate-audio': ['.wav', '.mp3']};
  if (!allowed[kind]?.includes(extname(path))) throw new Error('ownership requires a disposable media kind and matching suffix; documentation/source is protected');
}
// Every appended component is checked; realpath containment alone would accept internal aliases.
export async function safePath(base: string, path: string, createDirectories = false): Promise<string> {
  let current = await realpath(base);
  const parts = segments(path);
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]!);
    let entry;
    try { entry = await lstat(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (i < parts.length - 1) {
        if (!createDirectories) throw new Error(`missing parent: ${current}`);
        try { await mkdir(current, {mode: 0o700}); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        entry = await lstat(current);
      } else return current;
    }
    if (entry?.isSymbolicLink() || (i < parts.length - 1 ? !entry?.isDirectory() : !entry?.isFile() && !entry?.isDirectory())) throw new Error(`symlink or special file refused: ${current}`);
  }
  return current;
}
export function paths(run: Pick<Run, 'projectId' | 'sceneId' | 'runId'>) {
  id(run.projectId); id(run.sceneId); runId(run.runId);
  return {work: `output/${run.projectId}/.work/${run.runId}`, records: `docs/production-runs/${run.projectId}/${run.runId}`, final: `output/${run.projectId}/final/${run.sceneId}-${run.runId}.mp4`};
}
export async function writeRecord(repo: string, run: Run, name: string, value: unknown): Promise<void> {
  if (!/^[a-z][a-z0-9-]*\.(json|md|log)$/.test(name)) throw new Error('invalid permanent record name');
  const target = await safePath(repo, `${paths(run).records}/${name}`, true);
  const temporary = await safePath(repo, `${paths(run).records}/${name}.partial-${randomUUID()}`);
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); await file.sync(); }
  finally { await file.close(); }
  await safePath(repo, `${paths(run).records}/${name}`);
  await rename(temporary, target);
}
export async function saveRun(repo: string, run: Run): Promise<void> { await writeRecord(repo, run, 'run.json', run); }
export async function createRun(repo: string, projectId: string, sceneId: string, sourceSha256: string): Promise<Run> {
  id(projectId); id(sceneId); hash(sourceSha256);
  const run: Run = {schemaVersion: 1, projectId, sceneId, runId: randomUUID(), sourceSha256, status: 'preparing', owned: [], published: null,
    cleanup: {filesRemoved: 0, bytesReclaimed: 0, preserved: [], failures: []}, failure: null};
  const p = paths(run);
  const work = await safePath(repo, p.work, true); await mkdir(work, {mode: 0o700});
  const records = await safePath(repo, p.records, true); await mkdir(records, {mode: 0o700});
  await saveRun(repo, run); return run;
}
export async function loadRun(repo: string, projectId: string, sceneId: string, value: string): Promise<Run> {
  const p = paths({projectId, sceneId, runId: value});
  const raw = JSON.parse(await readFile(await safePath(repo, `${p.records}/run.json`), 'utf8'));
  const o = object(raw, ['schemaVersion', 'projectId', 'sceneId', 'runId', 'sourceSha256', 'status', 'owned', 'published', 'cleanup', 'failure'], 'run');
  if (o.schemaVersion !== 1 || o.projectId !== projectId || o.sceneId !== sceneId || o.runId !== value || !['preparing', 'prepared', 'published', 'failed'].includes(o.status as string)) throw new Error('run identity/state mismatch');
  hash(o.sourceSha256);
  if (!Array.isArray(o.owned) || o.owned.length > 10000) throw new Error('invalid ownership ledger');
  const seen = new Set<string>();
  for (const raw of o.owned) {
    const e = object(raw, ['path', 'kind', 'bytes', 'sha256', 'removed'], 'owned');
    text(e.path); disposable(e.path, e.kind as Kind);
    if (seen.has(e.path)) throw new Error('duplicate ownership entry'); seen.add(e.path);
    if (e.bytes !== null) integer(e.bytes, 1);
    if (e.sha256 !== null) hash(e.sha256);
    if ((e.bytes === null) !== (e.sha256 === null) || typeof e.removed !== 'boolean') throw new Error('invalid ownership seal');
  }
  if (o.published !== null) {
    const final = object(o.published, ['path', 'sha256', 'bytes'], 'published');
    if (final.path !== p.final) throw new Error('published path mismatch');
    hash(final.sha256); integer(final.bytes, 1);
  }
  const cleanup = object(o.cleanup, ['filesRemoved', 'bytesReclaimed', 'preserved', 'failures'], 'cleanup');
  integer(cleanup.filesRemoved); integer(cleanup.bytesReclaimed);
  if (!Array.isArray(cleanup.preserved) || !Array.isArray(cleanup.failures)) throw new Error('invalid cleanup results');
  if (o.failure !== null) text(o.failure);
  return o as Run;
}
export async function reserve(repo: string, run: Run, path: string, kind: Kind): Promise<string> {
  disposable(path, kind);
  if (run.status !== 'preparing' || run.owned.some(e => e.path === path)) throw new Error('ownership reservation requires a new preparing-run path');
  const target = await safePath(repo, `${paths(run).work}/${path}`, true);
  try { await lstat(target); throw new Error('refusing ownership of an existing file'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  run.owned.push({path, kind, bytes: null, sha256: null, removed: false});
  await saveRun(repo, run); return target;
}
export async function fileIdentity(path: string): Promise<{sha256: string; bytes: number}> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || !info.size) throw new Error('expected nonempty regular file');
    return {sha256: createHash('sha256').update(await file.readFile()).digest('hex'), bytes: info.size};
  } finally { await file.close(); }
}
export async function seal(repo: string, run: Run, path: string): Promise<void> {
  const owned = run.owned.find(e => e.path === path);
  if (!owned || owned.sha256 !== null) throw new Error('missing or already sealed ownership reservation');
  Object.assign(owned, await fileIdentity(await safePath(repo, `${paths(run).work}/${path}`)));
  await saveRun(repo, run);
}
export async function publishFile(repo: string, run: Run, verified: {sha256: string; bytes: number}): Promise<void> {
  if (run.status !== 'prepared') throw new Error('publication requires prepared state');
  const p = paths(run), draft = await safePath(repo, `${p.work}/candidate.mp4`), final = await safePath(repo, p.final, true);
  const actual = await fileIdentity(draft);
  if (actual.sha256 !== verified.sha256 || actual.bytes !== verified.bytes) throw new Error('candidate changed after verification');
  const file = await open(draft, 'r'); try { await file.sync(); } finally { await file.close(); }
  // link is atomic and refuses an existing destination, unlike rename's overwrite behavior.
  await link(draft, final);
  const directory = await open(dirname(final), 'r'); try { await directory.sync(); } finally { await directory.close(); }
  run.published = {path: p.final, ...actual};
  await saveRun(repo, run);
}
export async function cleanupRun(repo: string, run: Run): Promise<Cleanup> {
  if (run.status !== 'published' || !run.published) throw new Error('cleanup requires successful verified publication');
  const p = paths(run);
  if (run.published.path !== p.final) throw new Error('published path mismatch');
  const final = await fileIdentity(await safePath(repo, p.final));
  if (final.sha256 !== run.published.sha256 || final.bytes !== run.published.bytes) throw new Error('published deliverable changed; diagnostics retained');
  const result: Cleanup = {filesRemoved: 0, bytesReclaimed: 0, preserved: [], failures: []};
  for (const owned of run.owned) {
    disposable(owned.path, owned.kind);
    if (owned.removed) continue;
    try {
      const target = await safePath(repo, `${p.work}/${owned.path}`);
      let info;
      try { info = await fileIdentity(target); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { result.preserved.push({path: owned.path, reason: 'registered file missing; no deletion credited'}); continue; } throw error; }
      if (owned.sha256 === null || info.sha256 !== owned.sha256 || info.bytes !== owned.bytes) {
        result.preserved.push({path: owned.path, reason: 'unsealed or changed since creation'}); continue;
      }
      await unlink(target); owned.removed = true;
      result.filesRemoved++; result.bytesReclaimed += info.bytes;
      run.cleanup.filesRemoved++; run.cleanup.bytesReclaimed += info.bytes;
      await saveRun(repo, run);
    } catch (error) { result.failures.push(`${owned.path}: ${String(error)}`); }
  }
  const work = await safePath(repo, p.work);
  async function visit(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) await visit(await safePath(repo, `${p.work}/${path}`), `${path}/`);
      else if (!result.preserved.some(e => e.path === path) && !result.failures.some(e => e.startsWith(`${path}:`))) result.preserved.push({path, reason: 'unknown/unowned file or link; preserved'});
    }
  }
  await visit(work, '');
  run.cleanup.preserved = result.preserved; run.cleanup.failures = result.failures;
  await saveRun(repo, run); return result;
}
export async function withRunLock<T>(repo: string, run: Run, action: () => Promise<T>): Promise<T> {
  const path = await safePath(repo, `${paths(run).records}/operation.lock`);
  const lock = await open(path, 'wx', 0o600);
  try { return await action(); }
  finally { await lock.close(); await unlink(path); }
}
