import {createHash} from 'node:crypto';
import {readFile, realpath} from 'node:fs/promises';
import {join, relative, isAbsolute} from 'node:path';
import {parseManifest, summaryText, validatePng, type ReviewManifest} from './artifacts';
import {selectReviewFrames} from './frames';
import type {Shot} from '../spike/project';

export type Revision = {id: string; manifest: ReviewManifest; directory: string};
export type RevisionSummary = {id: string; projectId: string; sceneId: string; sourceSha256: string; video: {width: number; height: number; fps: number}; layout: string; frames: {shotId: string; localFrame: number; globalFrame: number; path: string}[]};
export function revisionSummary(revision: Revision): RevisionSummary {
  const {manifest: m} = revision;
  const shots = revisionShots(m);
  return {id: revision.id, projectId: m.projectId, sceneId: m.sceneId, sourceSha256: m.source.sha256, video: m.environment.video,
    layout: JSON.stringify(shots.map(s => [s.id, s.startFrame, s.durationFrames])), frames: m.captures.filter(c => c.status === 'captured').map(({shotId, localFrame, globalFrame, path}) => ({shotId, localFrame, globalFrame, path}))};
}
function revisionShots(m: ReviewManifest): Shot[] {
  const shots = new Map<string, Shot>();
  for (const c of m.captures) {
    const startFrame = c.globalFrame - c.localFrame;
    if (startFrame < 0 || (shots.has(c.shotId) && shots.get(c.shotId)!.startFrame !== startFrame)) throw new Error('Revision shot offset mismatch');
    const shot = shots.get(c.shotId) ?? {id: c.shotId, startFrame, durationFrames: 0, entry: '', audio: []};
    shot.durationFrames = Math.max(shot.durationFrames, c.localFrame + 1); shots.set(c.shotId, shot);
  }
  let end = 0;
  for (const shot of shots.values()) {if (shot.startFrame !== end) throw new Error('Revision shot layout is not contiguous'); end += shot.durationFrames;}
  return [...shots.values()];
}
export async function revisionImage(revision: Revision, path: string): Promise<Buffer> {
  const capture = revision.manifest.captures.find(c => c.path === path && c.status === 'captured');
  if (!capture || capture.status !== 'captured') throw new Error('Unknown capture');
  const file = await realpath(join(revision.directory, path));
  const rel = relative(revision.directory, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Capture escapes revision');
  const bytes = await readFile(file);
  if (createHash('sha256').update(bytes).digest('hex') !== capture.sha256) throw new Error('Capture hash mismatch');
  return bytes;
}
export async function readRevision(directory: string): Promise<Revision> {
  directory = await realpath(directory);
  const bytes = await readFile(join(directory, 'manifest.json'));
  const manifest = parseManifest(JSON.parse(bytes.toString()));
  const expected = selectReviewFrames(revisionShots(manifest), manifest.selection.milestones);
  if (!expected.length || expected.length !== manifest.captures.length || expected.some((f, i) => ['shotId', 'localFrame', 'globalFrame', 'path'].some(k => f[k as keyof typeof f] !== manifest.captures[i]![k as keyof typeof f]))) throw new Error('Revision frame policy mismatch');
  if (manifest.validation.exitCode || manifest.validation.errors.length) throw new Error('Revision validation failed');
  if (await readFile(join(directory, 'summary.md'), 'utf8') !== summaryText(manifest)) throw new Error('Revision summary is stale');
  const revision = {id: createHash('sha256').update(bytes).digest('hex'), manifest, directory};
  for (const c of manifest.captures) await validatePng(c.path, await revisionImage(revision, c.path));
  return revision;
}
export {matchedFrames} from './comparison';
