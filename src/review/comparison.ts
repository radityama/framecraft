import type {RevisionSummary} from './revisions';

export function matchedFrames(a: RevisionSummary, b: RevisionSummary) {
  if (a.projectId !== b.projectId || a.sceneId !== b.sceneId || a.layout !== b.layout || a.video.width !== b.video.width || a.video.height !== b.video.height || a.video.fps !== b.video.fps) return [];
  return a.frames.filter(f => b.frames.some(g => f.shotId === g.shotId && f.localFrame === g.localFrame && f.globalFrame === g.globalFrame));
}
