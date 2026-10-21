import type {Shot} from '../spike/project';

export function formatTime(frame: number, fps: number): string {
  const total = Math.max(0, Math.round(frame));
  const seconds = Math.floor(total / fps);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}:${pad(total % fps)}`;
}

export function activeShot(shots: Shot[], frame: number): Shot | undefined {
  return shots.find(shot => frame >= shot.startFrame && frame < shot.startFrame + shot.durationFrames);
}
