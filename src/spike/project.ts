import {readFile, realpath, stat} from 'node:fs/promises';
import {isAbsolute, join, relative, sep} from 'node:path';

export type Shot = {id: string; entry: string; durationFrames: number; startFrame: number};
export type Project = {video: {width: number; height: number; fps: number}; shots: Shot[]; durationFrames: number};

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function positive(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
}

function id(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value)) throw new Error(`${field} must be a kebab-case id`);
  return value;
}

function inside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function entry(base: string, path: unknown, field: string): Promise<string> {
  if (typeof path !== 'string' || !path || isAbsolute(path)) throw new Error(`${field}: invalid path`);
  const resolved = join(base, path);
  if (!inside(base, resolved)) throw new Error(`${field}: path escapes project: ${path}`);
  let actual: string;
  try { actual = await realpath(resolved); }
  catch { throw new Error(`${field}: not found: ${path}`); }
  if (!inside(base, actual) || !(await stat(actual)).isFile()) throw new Error(`${field}: not a project file: ${path}`);
  return relative(base, actual).split(sep).join('/');
}

export async function loadProject(root: string): Promise<Project> {
  const base = await realpath(root);
  const project = object(JSON.parse(await readFile(join(base, 'project.json'), 'utf8')), 'project');
  if (project.schemaVersion !== 1) throw new Error('project.schemaVersion must be 1');
  id(project.id, 'project.id');
  const video = object(project.video, 'project.video');
  const resultVideo = {width: positive(video.width, 'video.width'), height: positive(video.height, 'video.height'), fps: positive(video.fps, 'video.fps')};
  if (!Array.isArray(project.scenes) || project.scenes.length !== 1) throw new Error('project.scenes must contain exactly one scene in the spike');
  if (!Array.isArray(project.audio) || project.audio.length) throw new Error('project.audio must be empty in Phase 0');
  const ref = object(project.scenes[0], 'project.scenes[0]');
  const sceneId = id(ref.id, 'project.scenes[0].id');
  const scenePath = await entry(base, ref.path, 'project.scenes[0].path');
  const scene = object(JSON.parse(await readFile(join(base, scenePath), 'utf8')), 'scene');
  if (scene.id !== sceneId) throw new Error('scene.id must match project.scenes[0].id');
  if (!Array.isArray(scene.audio) || scene.audio.length) throw new Error('scene.audio must be empty in Phase 0');
  if (!Array.isArray(scene.shots) || !scene.shots.length) throw new Error('scene.shots must be nonempty');
  const sceneDir = join(base, scenePath, '..');
  const ids = new Set<string>();
  let durationFrames = 0;
  const shots: Shot[] = [];
  for (const [index, raw] of scene.shots.entries()) {
    const shot = object(raw, `scene.shots[${index}]`);
    const shotId = id(shot.id, `scene.shots[${index}].id`);
    if (ids.has(shotId)) throw new Error(`duplicate shot id: ${shotId}`);
    ids.add(shotId);
    const duration = positive(shot.durationFrames, `shot ${shotId}.durationFrames`);
    if (shot.overlapFrames !== 0) throw new Error(`shot ${shotId}.overlapFrames must be 0`);
    if (typeof shot.entry !== 'string' || !shot.entry) throw new Error(`shot ${shotId}.entry: invalid path`);
    const shotEntry = await entry(base, join(relative(base, sceneDir), shot.entry), `shot ${shotId}.entry`);
    if (!shotEntry.endsWith('.html')) throw new Error(`shot ${shotId}.entry must be HTML`);
    shots.push({id: shotId, entry: shotEntry, durationFrames: duration, startFrame: durationFrames});
    durationFrames += duration;
    if (!Number.isSafeInteger(durationFrames)) throw new Error('scene durationFrames overflow');
  }
  return {video: resultVideo, shots, durationFrames};
}
