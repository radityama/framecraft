import type {Shot} from './spike/project';

function integer(value: number, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
}
export function frameToSeconds(frame: number, fps: number): number {
  return integer(frame, 'frame') / integer(fps, 'fps', 1);
}
export function secondsToFrame(seconds: number, fps: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('seconds must be finite and nonnegative');
  return integer(Math.round(seconds * integer(fps, 'fps', 1)), 'frame');
}
export function clampFrame(frame: number, totalFrames: number): number {
  integer(totalFrames, 'totalFrames', 1);
  if (!Number.isFinite(frame)) throw new Error('frame must be finite');
  return Math.min(totalFrames - 1, Math.max(0, Math.round(frame)));
}
export function activeShot(shots: Shot[], frame: number): Shot | undefined {
  integer(frame, 'frame');
  return shots.find(shot => frame >= shot.startFrame && frame < shot.startFrame + shot.durationFrames);
}
export function sceneFrameToShot(frame: number, scene: {shots: Shot[]; durationFrames: number}) {
  integer(frame, 'frame');
  const shot = frame < scene.durationFrames ? activeShot(scene.shots, frame) : undefined;
  if (!shot) throw new Error('frame outside scene');
  return {shot, localFrame: frame - shot.startFrame};
}
export function shotFrameToSceneFrame(shotId: string, frame: number, scene: {shots: Pick<Shot, 'id' | 'startFrame' | 'durationFrames'>[]}): number {
  integer(frame, 'frame');
  const shot = scene.shots.find(shot => shot.id === shotId);
  if (!shot || frame >= shot.durationFrames) throw new Error('shot frame outside scene');
  return shot.startFrame + frame;
}
export function adjacentShotFrame(frame: number, direction: -1 | 1, scene: {shots: Shot[]; durationFrames: number}): number {
  const {shot} = sceneFrameToShot(frame, scene);
  const index = scene.shots.indexOf(shot);
  return scene.shots[Math.min(scene.shots.length - 1, Math.max(0, index + direction))]!.startFrame;
}
export function playbackFrame(origin: number, elapsedMs: number, fps: number, rate: number, total: number): number {
  integer(origin, 'origin');
  integer(fps, 'fps', 1);
  if (![0.25, 0.5, 1, 2].includes(rate) || !Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('invalid playback clock');
  return clampFrame(origin + Math.floor(elapsedMs * fps * rate / 1000), total);
}
export function formatTime(frame: number, fps: number): string {
  integer(frame, 'frame'); integer(fps, 'fps', 1);
  const seconds = Math.floor(frame / fps);
  return [Math.floor(seconds / 60), seconds % 60, frame % fps].map(value => String(value).padStart(2, '0')).join(':');
}
