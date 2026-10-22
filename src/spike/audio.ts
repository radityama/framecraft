export type AudioCue = {
  id: string;
  src: string;
  startFrame: number;
  durationFrames: number;
  trimInFrames: number;
  trimOutFrames: number;
  gain: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  loop: boolean;
};

type AudioShot = {id: string; startFrame: number; durationFrames: number; audio?: unknown};

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, field: string, min: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) throw new Error(`${field} must be an integer >= ${min}`);
  return value as number;
}

function parseCue(raw: unknown, scope: string, limit: number, seen: Set<string>): AudioCue {
  const cue = object(raw, scope);
  const id = cue.id;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`${scope}.id must be a kebab-case id`);
  if (seen.has(id)) throw new Error(`${scope}: duplicate audio cue id ${id}`);
  seen.add(id);
  const field = `${scope}.${id}`;
  if (typeof cue.src !== 'string' || !cue.src) throw new Error(`${field}.src must be a local file`);
  const startFrame = integer(cue.startFrame, `${field}.startFrame`, 0);
  const durationFrames = integer(cue.durationFrames, `${field}.durationFrames`, 1);
  const trimInFrames = integer(cue.trimInFrames === undefined ? 0 : cue.trimInFrames, `${field}.trimInFrames`, 0);
  const trimOutFrames = integer(cue.trimOutFrames, `${field}.trimOutFrames`, 1);
  const fadeInFrames = integer(cue.fadeInFrames === undefined ? 0 : cue.fadeInFrames, `${field}.fadeInFrames`, 0);
  const fadeOutFrames = integer(cue.fadeOutFrames === undefined ? 0 : cue.fadeOutFrames, `${field}.fadeOutFrames`, 0);
  const gain = cue.gain === undefined ? 1 : cue.gain;
  if (typeof gain !== 'number' || !Number.isFinite(gain) || gain < 0 || gain > 1) throw new Error(`${field}.gain must be between 0 and 1`);
  if (cue.loop !== undefined && typeof cue.loop !== 'boolean') throw new Error(`${field}.loop must be boolean`);
  if (trimOutFrames <= trimInFrames || (cue.loop !== true && durationFrames > trimOutFrames - trimInFrames)) {
    throw new Error(`${field}: invalid source trim range`);
  }
  if (!Number.isSafeInteger(startFrame + durationFrames) || startFrame + durationFrames > limit) {
    throw new Error(`${field}.durationFrames exceeds its scope`);
  }
  if (fadeInFrames + fadeOutFrames > durationFrames) throw new Error(`${field}: fades exceed durationFrames`);
  return {id, src: cue.src, startFrame, durationFrames, trimInFrames, trimOutFrames,
    gain, fadeInFrames, fadeOutFrames, loop: cue.loop === true};
}

export function resolveAudioTimeline(sceneAudio: unknown, shots: AudioShot[], durationFrames: number):
  {cues: AudioCue[]; shotCues: Record<string, AudioCue[]>} {
  integer(durationFrames, 'scene.durationFrames', 0);
  let raw: unknown[];
  if (Array.isArray(sceneAudio) && sceneAudio.length === 0) {
    if (shots.some(shot => Array.isArray(shot.audio) && shot.audio.length)) {
      throw new Error('scene.audio.schemaVersion required for shot audio');
    }
    raw = [];
  } else {
    const timeline = object(sceneAudio, 'scene.audio');
    if (timeline.schemaVersion !== 1 || !Array.isArray(timeline.cues)) {
      throw new Error('scene.audio.schemaVersion must be 1 with a cues array');
    }
    raw = timeline.cues;
  }
  const seenScene = new Set<string>();
  const cues = raw.map((cue, index) => parseCue(cue, `scene.audio[${index}]`, durationFrames, seenScene));
  const shotCues: Record<string, AudioCue[]> = {};
  for (const shot of shots) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(shot.id)) throw new Error(`shot ${shot.id}.id must be a kebab-case id`);
    integer(shot.startFrame, `shot ${shot.id}.startFrame`, 0);
    integer(shot.durationFrames, `shot ${shot.id}.durationFrames`, 1);
    if (!Number.isSafeInteger(shot.startFrame + shot.durationFrames) || shot.startFrame + shot.durationFrames > durationFrames) {
      throw new Error(`shot ${shot.id}.durationFrames exceeds scene durationFrames`);
    }
    if (Object.hasOwn(shotCues, shot.id)) throw new Error(`duplicate shot id: ${shot.id}`);
    const list = shot.audio === undefined ? [] : shot.audio;
    if (!Array.isArray(list)) throw new Error(`shot ${shot.id}.audio must be an array`);
    const seen = new Set<string>();
    const local = list.map((cue, index) => parseCue(cue, `shot ${shot.id}.audio[${index}]`, shot.durationFrames, seen));
    shotCues[shot.id] = local;
    cues.push(...local.map(cue => ({...cue, id: `${shot.id}:${cue.id}`, startFrame: shot.startFrame + cue.startFrame})));
  }
  return {cues, shotCues};
}

export function cueGain(cue: AudioCue, localFrame: number): number {
  return cue.gain * Math.max(0, Math.min(1, cue.fadeInFrames ? localFrame / cue.fadeInFrames : 1,
    cue.fadeOutFrames ? (cue.durationFrames - localFrame) / cue.fadeOutFrames : 1));
}
