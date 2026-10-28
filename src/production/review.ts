import {array, choice, hash, integer, object, text, type Brief} from './contracts';
import type {ReviewFrame} from '../review/frames';
import type {Scene} from '../spike/project';

export type EvidenceFrame = ReviewFrame & {sha256: string};
export type CreativeReview = {
  schemaVersion: 1; sourceSha256: string; candidateSha256: string;
  reviewer: {kind: 'agent' | 'human'; name: string}; decision: 'accepted' | 'needs-revision';
  frames: Array<{shotId: string; localFrame: number; sha256: string; observation: string}>;
  motion: {status: 'reviewed' | 'pending'; method: string; notes: string};
  sound: {status: 'measured' | 'listened' | 'pending'; notes: string};
  human: {status: 'pending' | 'approved' | 'not-required'; name: string | null; notes: string};
  findings: Array<{id: string; severity: 'blocking' | 'major' | 'minor' | 'info'; sceneId: string; shotId: string; frame: number;
    status: 'open' | 'resolved' | 'wont-fix'; description: string; correction: string; limits: string}>;
};
export function validateCreativeReview(value: unknown, brief: Brief, scene: Scene, frames: EvidenceFrame[], sourceSha256: string, candidateSha256: string) {
  const o = object(value, ['schemaVersion', 'sourceSha256', 'candidateSha256', 'reviewer', 'decision', 'frames', 'motion', 'sound', 'human', 'findings'], 'creative review');
  if (o.schemaVersion !== 1 || o.sourceSha256 !== sourceSha256 || o.candidateSha256 !== candidateSha256) throw new Error('stale or invalid creative review');
  hash(o.sourceSha256); hash(o.candidateSha256);
  const reviewer = object(o.reviewer, ['kind', 'name'], 'reviewer'); choice(reviewer.kind, ['agent', 'human']); text(reviewer.name);
  choice(o.decision, ['accepted', 'needs-revision']);
  const observations = array(o.frames);
  if (observations.length !== frames.length) throw new Error('every captured frame needs an observation');
  for (const [index, raw] of observations.entries()) {
    const f = object(raw, ['shotId', 'localFrame', 'sha256', 'observation'], 'frame observation');
    const expected = frames[index]!;
    if (f.shotId !== expected.shotId || f.localFrame !== expected.localFrame || f.sha256 !== expected.sha256) throw new Error('review frame identity/hash mismatch');
    text(f.observation);
  }
  const motion = object(o.motion, ['status', 'method', 'notes'], 'motion'); choice(motion.status, ['reviewed', 'pending']); text(motion.method); text(motion.notes);
  const sound = object(o.sound, ['status', 'notes'], 'sound'); choice(sound.status, ['measured', 'listened', 'pending']); text(sound.notes);
  const human = object(o.human, ['status', 'name', 'notes'], 'human'); choice(human.status, ['pending', 'approved', 'not-required']); text(human.notes);
  if (human.name !== null) text(human.name);
  if (human.status === 'approved' && (reviewer.kind !== 'human' || human.name !== reviewer.name)) throw new Error('agent cannot supply human approval');
  if (brief.review.humanApprovalRequired && human.status !== 'approved') throw new Error('required human editorial approval pending');
  if (brief.review.humanApprovalRequired && human.status === 'not-required') throw new Error('human approval cannot be waived by a review');
  const ids = new Set<string>();
  for (const raw of array(o.findings)) {
    const f = object(raw, ['id', 'severity', 'sceneId', 'shotId', 'frame', 'status', 'description', 'correction', 'limits'], 'finding');
    text(f.id); choice(f.severity, ['blocking', 'major', 'minor', 'info']); choice(f.status, ['open', 'resolved', 'wont-fix']); integer(f.frame);
    const shot = scene.shots.find(s => s.id === f.shotId);
    if (ids.has(f.id as string) || f.sceneId !== scene.id || !shot || (f.frame as number) >= shot.durationFrames) throw new Error('invalid finding identity/frame');
    ids.add(f.id as string);
    for (const key of ['description', 'correction', 'limits']) text(f[key]);
    if (['blocking', 'major'].includes(f.severity as string) && f.status !== 'resolved') throw new Error('unresolved blocking/major finding prevents publication');
  }
  if (o.decision !== 'accepted' || motion.status !== 'reviewed' || (scene.audio.length && sound.status === 'pending')) throw new Error('creative review not ready for technical delivery');
  const listeningComplete = !scene.audio.length || sound.status === 'listened';
  return {review: o as CreativeReview, gates: {technical: 'passed' as const,
    creative: listeningComplete ? 'passed' : 'partial-listening-pending',
    editorial: human.status as string,
    label: listeningComplete ? human.status === 'approved' ? 'human-approved' : reviewer.kind === 'agent' ? 'agent-reviewed' : 'human-reviewed' : 'technically-verified'}};
}
