import {createHash} from 'node:crypto';
import {readFile, realpath, stat} from 'node:fs/promises';
import {join, relative, isAbsolute, sep} from 'node:path';
import {cueGain} from '../spike/audio';
import type {Scene, StudioProject} from '../spike/project';

export const formats = ['tech-documentary', 'desktop-simulation', 'product-explainer', 'editorial-graphics', 'data-story', 'cinematic-type'] as const;
export const categories = ['press', 'release', 'key', 'grab', 'drag', 'drop', 'transition', 'ambience', 'voice', 'music'] as const;
export type Brief = {
  schemaVersion: 1; projectId: string; sceneId: string; audience: string; message: string;
  format: typeof formats[number]; references: string[]; narrative: string; constraints: string[];
  design: {palette: string[]; typography: string; composition: string; motion: string};
  audio: {sfx: 'required' | 'optional' | 'silent'; silenceReason: string | null;
    narration: {enabled: boolean; authorization: string | null}; music: {enabled: boolean; authorization: string | null}};
  review: {humanApprovalRequired: boolean};
};
export type Beat = {id: string; shotId: string; startFrame: number; endFrame: number; script: string; visual: string; motion: string; rationale: string};
export type Event = {id: string; beatId: string; shotId: string; frame: number; type: string; detail: string;
  audio: {intent: 'required' | 'optional' | 'silent'; cueId: string | null; reason: string}};
export type Asset = {src: string; category: typeof categories[number]; sha256: string;
  provenance: {kind: 'original-synthesis' | 'licensed'; author: string; license: string; recipe: string}};
export type Plan = {schemaVersion: 1; projectId: string; sceneId: string; beats: Beat[]; events: Event[];
  assets: Asset[]; quiet: Array<{startFrame: number; endFrame: number; reason: string}>};
export type Production = {brief: Brief; plan: Plan};

export function object(value: unknown, keys: string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field}: expected object`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key)) || keys.some(key => !(key in result)))
    throw new Error(`${field}: missing or unknown fields`);
  return result;
}
export function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 20000) throw new Error('expected nonempty text (maximum 20000 characters)');
}
export function integer(value: unknown, minimum = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`expected integer >= ${minimum}`);
}
export function choice(value: unknown, values: readonly string[]): void {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`expected one of: ${values.join(', ')}`);
}
export function hash(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('expected SHA-256');
}
export function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value)) throw new Error('expected kebab-case id');
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('expected array (maximum 10000 entries)');
  return value;
}
function identity(o: Record<string, unknown>): void {
  if (o.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  id(o.projectId); id(o.sceneId);
}
function texts(value: unknown, nonempty = false): void {
  const items = array(value); items.forEach(text);
  if (nonempty && !items.length) throw new Error('expected nonempty text array');
}
export function parseBrief(value: unknown): Brief {
  const o = object(value, ['schemaVersion', 'projectId', 'sceneId', 'audience', 'message', 'format', 'references', 'narrative', 'constraints', 'design', 'audio', 'review'], 'brief');
  identity(o); choice(o.format, formats);
  for (const key of ['audience', 'message', 'narrative']) text(o[key]);
  texts(o.references, true); texts(o.constraints);
  const design = object(o.design, ['palette', 'typography', 'composition', 'motion'], 'design');
  texts(design.palette, true);
  for (const key of ['typography', 'composition', 'motion']) text(design[key]);
  const audio = object(o.audio, ['sfx', 'silenceReason', 'narration', 'music'], 'audio');
  choice(audio.sfx, ['required', 'optional', 'silent']);
  if (audio.silenceReason !== null) text(audio.silenceReason);
  if (audio.sfx === 'silent' && audio.silenceReason === null) throw new Error('deliberate silence requires a reason');
  for (const key of ['narration', 'music']) {
    const mode = object(audio[key], ['enabled', 'authorization'], key);
    if (typeof mode.enabled !== 'boolean') throw new Error(`${key}.enabled must be boolean`);
    if (mode.authorization !== null) text(mode.authorization);
    if (mode.enabled && mode.authorization === null) throw new Error(`${key} requires explicit authorization`);
  }
  const review = object(o.review, ['humanApprovalRequired'], 'review');
  if (typeof review.humanApprovalRequired !== 'boolean') throw new Error('humanApprovalRequired must be boolean');
  return o as Brief;
}
export function parsePlan(value: unknown): Plan {
  const o = object(value, ['schemaVersion', 'projectId', 'sceneId', 'beats', 'events', 'assets', 'quiet'], 'plan');
  identity(o);
  for (const raw of array(o.beats)) {
    const b = object(raw, ['id', 'shotId', 'startFrame', 'endFrame', 'script', 'visual', 'motion', 'rationale'], 'beat');
    id(b.id); id(b.shotId); integer(b.startFrame); integer(b.endFrame, 1);
    for (const key of ['script', 'visual', 'motion', 'rationale']) text(b[key]);
  }
  for (const raw of array(o.events)) {
    const e = object(raw, ['id', 'beatId', 'shotId', 'frame', 'type', 'detail', 'audio'], 'event');
    id(e.id); id(e.beatId); id(e.shotId); integer(e.frame); text(e.detail);
    choice(e.type, ['press', 'release', 'focus', 'type', 'confirm', 'grab', 'drag', 'drop', 'transition', 'reveal', 'voice', 'music']);
    const a = object(e.audio, ['intent', 'cueId', 'reason'], 'event.audio');
    choice(a.intent, ['required', 'optional', 'silent']); text(a.reason);
    if (a.cueId !== null) text(a.cueId);
    if (a.intent === 'required' && a.cueId === null) throw new Error('required event needs cueId');
    if (a.intent === 'silent' && a.cueId !== null) throw new Error('silent event cannot map a cue');
  }
  for (const raw of array(o.assets)) {
    const a = object(raw, ['src', 'category', 'sha256', 'provenance'], 'asset');
    text(a.src); choice(a.category, categories); hash(a.sha256);
    const p = object(a.provenance, ['kind', 'author', 'license', 'recipe'], 'provenance');
    choice(p.kind, ['original-synthesis', 'licensed']);
    for (const key of ['author', 'license', 'recipe']) text(p[key]);
  }
  for (const raw of array(o.quiet)) {
    const q = object(raw, ['startFrame', 'endFrame', 'reason'], 'quiet');
    integer(q.startFrame); integer(q.endFrame, 1); text(q.reason);
  }
  return o as Plan;
}
function unique<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map(items.map(item => [key(item), item]));
  if (map.size !== items.length) throw new Error('duplicate contract identity');
  return map;
}
export async function localFile(root: string, path: string): Promise<string> {
  if (!path || /[\\\0?#:]|^\//.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`invalid local path: ${path}`);
  const base = await realpath(root); const actual = await realpath(join(base, path));
  const rel = relative(base, actual);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`path escapes project: ${path}`);
  if (!(await stat(actual)).isFile()) throw new Error(`expected regular file: ${path}`);
  return actual;
}
export function validateMappings(brief: Brief, plan: Plan, project: StudioProject, scene: Scene): void {
  if ([brief, plan].some(c => c.projectId !== project.id || c.sceneId !== scene.id)) throw new Error('production project/scene identity mismatch');
  const beats = unique(plan.beats, b => b.id); const assets = unique(plan.assets, a => a.src);
  unique(plan.events, e => e.id);
  const shots = new Map(scene.shots.map(s => [s.id, s]));
  for (const b of plan.beats) {
    const shot = shots.get(b.shotId);
    if (!shot || b.endFrame <= b.startFrame || b.endFrame > shot.durationFrames) throw new Error(`beat out of bounds: ${b.id}`);
  }
  for (const shot of scene.shots) {
    let end = 0;
    for (const b of plan.beats.filter(b => b.shotId === shot.id).sort((a, b) => a.startFrame - b.startFrame)) {
      if (b.startFrame !== end) throw new Error(`beat gap/overlap: ${shot.id}`);
      end = b.endFrame;
    }
    if (end !== shot.durationFrames) throw new Error(`beats must cover shot: ${shot.id}`);
  }
  const mapped = new Set<string>();
  for (const event of plan.events) {
    if (event.type === 'voice' && !brief.audio.narration.enabled) throw new Error('narration not authorized');
    if (event.type === 'music' && !brief.audio.music.enabled) throw new Error('music not authorized');
    const shot = shots.get(event.shotId); const beat = beats.get(event.beatId);
    if (!shot || !beat || beat.shotId !== shot.id || event.frame < beat.startFrame || event.frame >= beat.endFrame) throw new Error(`event out of bounds: ${event.id}`);
    if (event.audio.cueId === null) continue;
    const cue = scene.audio.find(c => c.id === event.audio.cueId);
    if (!cue || cue.gain <= 0 || cue.startFrame !== shot.startFrame + event.frame) throw new Error(`missing, muted or misaligned cue: ${event.id}`);
    if (!assets.has(cue.src) || mapped.has(cue.id)) throw new Error(`unregistered asset or duplicate cue mapping: ${event.id}`);
    mapped.add(cue.id);
  }
  if (scene.audio.some(c => !mapped.has(c.id))) throw new Error('actual cue has no planned event');
  if (brief.audio.sfx === 'required' && !plan.events.some(e => e.audio.intent === 'required' && !['voice', 'music'].includes(e.type))) throw new Error('required SFX need required events');
  if (brief.audio.sfx === 'silent' && (scene.audio.length || plan.events.some(e => e.audio.intent !== 'silent'))) throw new Error('silent brief cannot contain sound');
  for (const asset of plan.assets) {
    if (!scene.audio.some(c => c.src === asset.src)) throw new Error(`unused audio asset: ${asset.src}`);
    if (asset.category === 'voice' && !brief.audio.narration.enabled) throw new Error('narration not authorized');
    if (asset.category === 'music' && !brief.audio.music.enabled) throw new Error('music not authorized');
  }
  for (const q of plan.quiet) {
    if (q.endFrame <= q.startFrame || q.endFrame > scene.durationFrames || scene.audio.some(c => c.startFrame < q.endFrame && c.startFrame + c.durationFrames > q.startFrame)) throw new Error('invalid or occupied quiet interval');
  }
  const boundaries = new Set(scene.audio.flatMap(c => [c.startFrame, c.startFrame + c.fadeInFrames, c.startFrame + c.durationFrames - c.fadeOutFrames, c.startFrame + c.durationFrames]));
  for (const frame of [...boundaries].flatMap(f => [f, f - 1e-6])) {
    const sum = scene.audio.reduce((n, c) => n + (frame >= c.startFrame && frame < c.startFrame + c.durationFrames ? cueGain(c, frame - c.startFrame) : 0), 0);
    if (sum > 0.9 + 1e-9) throw new Error('summed gain exceeds production headroom (0.9)');
  }
}
export async function loadProduction(root: string, project: StudioProject, scene: Scene): Promise<Production> {
  const brief = parseBrief(JSON.parse(await readFile(await localFile(root, 'production/brief.json'), 'utf8')));
  const plan = parsePlan(JSON.parse(await readFile(await localFile(root, 'production/plan.json'), 'utf8')));
  validateMappings(brief, plan, project, scene);
  for (const asset of plan.assets) {
    const bytes = await readFile(await localFile(root, asset.src));
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`asset hash mismatch: ${asset.src}`);
    if (asset.provenance.kind === 'original-synthesis') await localFile(root, asset.provenance.recipe);
  }
  return {brief, plan};
}
export function cueSheet(plan: Plan, scene: Scene, fps: number): string {
  const safe = (s: string) => s.replace(/[|\r\n]/g, ' ');
  return '# Production cue sheet\n\nScene frames are authoritative; intervals are half-open.\n\n| Event | Shot:local | Scene frame / seconds | Intent / purpose | Cue / local asset | Trim / length | Gain / fades |\n| --- | --- | --- | --- | --- | --- | --- |\n' + plan.events.map(e => {
    const shot = scene.shots.find(s => s.id === e.shotId)!;
    const c = scene.audio.find(c => c.id === e.audio.cueId);
    const f = shot.startFrame + e.frame;
    return `| ${e.id} (${e.type}) | ${e.shotId}:${e.frame} | ${f} / ${(f / fps).toFixed(3)} | ${e.audio.intent}: ${safe(e.audio.reason)} | ${c ? `${c.id} / ${c.src}` : 'deliberate silence / unavailable optional cue'} | ${c ? `[${c.trimInFrames},${c.trimOutFrames}) / ${c.durationFrames}` : 'n/a'} | ${c ? `${c.gain} / ${c.fadeInFrames},${c.fadeOutFrames}` : 'n/a'} |`;
  }).join('\n') + '\n';
}
