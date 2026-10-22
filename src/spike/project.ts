import {readFile, realpath, stat} from 'node:fs/promises';
import {isAbsolute, join, relative, sep} from 'node:path';
import {resolveAudioTimeline, type AudioCue} from './audio';
import {probeAudioFrames} from './audio-assets';

export type Shot = {id: string; entry: string; durationFrames: number; startFrame: number; audio?: AudioCue[]};
export type Project = {video: {width: number; height: number; fps: number}; shots: Shot[]; durationFrames: number; audio: AudioCue[]};
export type Scene = {id: string; title: string; shots: Shot[]; durationFrames: number; audio: AudioCue[]};
export type StudioProject = {id: string; title: string; video: Project['video']; scenes: Scene[]};

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

function title(value: unknown, fallback: string, field: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a nonempty string`);
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

async function loadValidatedProject(root: string, singleScene: boolean): Promise<StudioProject> {
  const base = await realpath(root);
  const project = object(JSON.parse(await readFile(join(base, 'project.json'), 'utf8')), 'project');
  if (project.schemaVersion !== 1) throw new Error('project.schemaVersion must be 1');
  const projectId = id(project.id, 'project.id');
  const video = object(project.video, 'project.video');
  const resultVideo = {width: positive(video.width, 'video.width'), height: positive(video.height, 'video.height'), fps: positive(video.fps, 'video.fps')};
  if (!Array.isArray(project.scenes)) throw new Error(singleScene ? 'project.scenes must contain exactly one scene in the spike' : 'project.scenes must be an array');
  if (singleScene && project.scenes.length !== 1) throw new Error('project.scenes must contain exactly one scene in the spike');
  if (!Array.isArray(project.audio) || project.audio.length) throw new Error('project.audio is reserved; use scene.audio');
  const scenes: Scene[] = [];
  const sceneIds = new Set<string>();
  for (const [sceneIndex, rawRef] of project.scenes.entries()) {
    const ref = object(rawRef, `project.scenes[${sceneIndex}]`);
    const sceneId = id(ref.id, `project.scenes[${sceneIndex}].id`);
    if (sceneIds.has(sceneId)) throw new Error(`duplicate scene id: ${sceneId}`);
    sceneIds.add(sceneId);
    const scenePath = await entry(base, ref.path, `project.scenes[${sceneIndex}].path`);
    const scene = object(JSON.parse(await readFile(join(base, scenePath), 'utf8')), 'scene');
    if (scene.id !== sceneId) throw new Error(`scene.id must match project.scenes[${sceneIndex}].id`);
    if (!Array.isArray(scene.shots) || !scene.shots.length) throw new Error('scene.shots must be nonempty');
    const sceneDir = join(base, scenePath, '..');
    const ids = new Set<string>();
    let durationFrames = 0;
    const shots: Shot[] = [];
    const audioInputs: Array<{id: string; startFrame: number; durationFrames: number; audio?: unknown}> = [];
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
      shots.push({id: shotId, entry: shotEntry, durationFrames: duration, startFrame: durationFrames, audio: []});
      audioInputs.push({id: shotId, startFrame: durationFrames, durationFrames: duration, audio: shot.audio});
      durationFrames += duration;
      if (!Number.isSafeInteger(durationFrames)) throw new Error('scene durationFrames overflow');
    }
    const resolved = resolveAudioTimeline(scene.audio, audioInputs, durationFrames);
    const media = new Map<string, {src: string; frames: number}>();
    for (const cue of [...resolved.cues, ...Object.values(resolved.shotCues).flat()]) {
      let source = media.get(cue.src);
      if (!source) {
        let canonical: string;
        let frames: number;
        try {
          canonical = await entry(base, cue.src, `audio cue ${cue.id}.src`);
          frames = await probeAudioFrames(join(base, canonical), resultVideo.fps);
        } catch (error) { throw new Error(`audio cue ${cue.id}: ${String(error)}`); }
        source = {src: canonical, frames};
        media.set(cue.src, source);
      }
      if (cue.trimOutFrames > source.frames) throw new Error(`audio cue ${cue.id}: trimOutFrames ${cue.trimOutFrames} exceeds ${source.frames} source frames in ${cue.src}`);
      cue.src = source.src;
    }
    for (const shot of shots) shot.audio = resolved.shotCues[shot.id]!;
    scenes.push({id: sceneId, title: title(scene.title, sceneId, 'scene.title'), shots, durationFrames, audio: resolved.cues});
  }
  return {id: projectId, title: title(project.title, projectId, 'project.title'), video: resultVideo, scenes};
}

export async function loadStudioProject(root: string): Promise<StudioProject> {
  return loadValidatedProject(root, false);
}

export async function loadProject(root: string): Promise<Project> {
  const project = await loadValidatedProject(root, true);
  const {shots, durationFrames, audio} = project.scenes[0]!;
  return {video: project.video, shots, durationFrames, audio};
}
