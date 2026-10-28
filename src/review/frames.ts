import type {Shot} from '../spike/project';
import {shotFrameToSceneFrame} from '../timeline';

export const SELECTION_POLICY = 'boundaries-midpoints-v1' as const;
type ReviewShot = Pick<Shot, 'id' | 'startFrame' | 'durationFrames'>;
export type ReviewFrame = {shotId: string; localFrame: number; globalFrame: number; path: string};

export function selectReviewFrames(shots: ReviewShot[], milestones: string[]): ReviewFrame[] {
  const byId = new Map(shots.map(shot => [shot.id, shot]));
  if (byId.size !== shots.length) throw new Error('duplicate shot id');
  const selected = new Map(shots.map(shot => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(shot.id) || !Number.isSafeInteger(shot.startFrame) || shot.startFrame < 0 ||
      !Number.isSafeInteger(shot.durationFrames) || shot.durationFrames <= 0 ||
      !Number.isSafeInteger(shot.startFrame + shot.durationFrames))
      throw new Error(`invalid shot frame range: ${shot.id}`);
    const last = shot.durationFrames - 1;
    return [shot.id, new Set([0, Math.floor(last / 2), last,
      ...(shot.durationFrames >= 90 ? [Math.floor(last / 4), Math.floor(3 * last / 4)] : [])])] as const;
  }));
  for (const value of milestones) {
    const match = /^([a-z0-9][a-z0-9-]*):(0|[1-9]\d*)$/.exec(value);
    if (!match) throw new Error(`invalid milestone: ${value}`);
    const shot = byId.get(match[1]!);
    const localFrame = Number(match[2]);
    if (!shot || !Number.isSafeInteger(localFrame) || localFrame >= shot.durationFrames)
      throw new Error(`milestone out of range: ${value}`);
    selected.get(shot.id)!.add(localFrame);
  }
  return shots.flatMap(shot =>
    [...selected.get(shot.id)!].map(localFrame => {
      const globalFrame = shotFrameToSceneFrame(shot.id, localFrame, {shots});
      return {shotId: shot.id, localFrame, globalFrame,
        path: `screenshots/${shot.id}-local-${String(localFrame).padStart(4, '0')}-global-${String(globalFrame).padStart(4, '0')}.png`};
    })).sort((a, b) => a.globalFrame - b.globalFrame || a.shotId.localeCompare(b.shotId));
}
