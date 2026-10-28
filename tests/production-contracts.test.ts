import {expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {loadStudioProject} from '../src/spike/project';
import {cueSheet, loadProduction, localFile, parseBrief, parsePlan, validateMappings} from '../src/production/contracts';
import {validateCreativeReview, type CreativeReview} from '../src/production/review';
import {synthesize, typingFrames} from '../projects/production-desktop/production/synthesize';

const root = resolve('projects/production-desktop');
const project = await loadStudioProject(root), scene = project.scenes[0]!;
const production = await loadProduction(root, project, scene);
const copy = () => structuredClone({...production, scene});

test('production intent is versioned, strict and independent from executable video metadata', () => {
  expect(production.brief.audio.sfx).toBe('required');
  expect(() => parseBrief({...production.brief, fps: 30})).toThrow('unknown');
  expect(() => parseBrief({...production.brief, schemaVersion: 2})).toThrow('schemaVersion');
  const p = copy(); p.brief.audio.narration = {enabled: true, authorization: null};
  expect(() => parseBrief(p.brief)).toThrow('authorization');
  p.brief.audio.narration.enabled = false; p.brief.audio.sfx = 'silent';
  expect(() => parseBrief(p.brief)).toThrow('reason');
  const plan = copy().plan; plan.events[0]!.audio.cueId = null;
  expect(() => parsePlan(plan)).toThrow('required');
});

test('event mappings reject gaps, stale identities, missing/muted/shifted cues and unauthorized sound', () => {
  const cases = [
    (p: ReturnType<typeof copy>) => {p.plan.beats[0]!.endFrame--;},
    (p: ReturnType<typeof copy>) => {p.plan.sceneId = 'elsewhere';},
    (p: ReturnType<typeof copy>) => {p.scene.audio.shift();},
    (p: ReturnType<typeof copy>) => {p.scene.audio[0]!.gain = 0;},
    (p: ReturnType<typeof copy>) => {p.scene.audio[0]!.startFrame++;},
    (p: ReturnType<typeof copy>) => {p.plan.events[0]!.frame = 450;},
    (p: ReturnType<typeof copy>) => {p.plan.events.push(p.plan.events[0]!);},
    (p: ReturnType<typeof copy>) => {p.plan.assets[0]!.category = 'voice';},
    (p: ReturnType<typeof copy>) => {p.plan.events[0]!.type = 'music';},
    (p: ReturnType<typeof copy>) => {p.plan.quiet[0]!.endFrame = 60;},
  ];
  for (const mutate of cases) { const p = copy(); mutate(p); expect(() => validateMappings(p.brief, p.plan, project, p.scene)).toThrow(); }
  const p = copy(); p.brief.audio.sfx = 'silent'; p.brief.audio.silenceReason = 'Intentional quiet';
  p.scene.audio = []; p.plan.assets = []; p.plan.events.forEach(e => {e.audio = {intent: 'silent', cueId: null, reason: 'Intentional quiet'};});
  expect(() => validateMappings(p.brief, p.plan, project, p.scene)).not.toThrow();
  p.brief.audio.sfx = 'required';
  expect(() => validateMappings(p.brief, p.plan, project, p.scene)).toThrow('required SFX');
});

test('gain headroom includes the left limit of an ending cue', () => {
  const p = copy(); p.plan.quiet = [];
  const a = p.scene.audio[0]!, b = p.scene.audio[1]!;
  a.gain = .6; a.startFrame = 54; a.durationFrames = 6; a.fadeOutFrames = 0;
  b.gain = .6; b.startFrame = 57; b.durationFrames = 3; b.fadeInFrames = 3; b.fadeOutFrames = 0;
  expect(() => validateMappings(p.brief, p.plan, project, p.scene)).toThrow('headroom');
});

test('original sounds reproduce byte-for-byte, vary contacts and leave silent key gaps', async () => {
  const generated = synthesize('typing', 52, 'key', 307);
  expect(generated.equals(await readFile(join(root, 'assets/audio/typing.wav')))).toBe(true);
  expect(synthesize('open-press', 3, 'press', 101).equals(synthesize('grip-press', 3, 'press', 521))).toBe(false);
  expect(new Set(production.plan.assets.map(a => a.sha256)).size).toBe(10);
  for (const asset of production.plan.assets) expect(createHash('sha256').update(await readFile(join(root, asset.src))).digest('hex')).toBe(asset.sha256);
  expect(typingFrames).toHaveLength('Field notes'.length);
  for (const frame of typingFrames) {
    let energy = 0; for (let i = frame * 1600; i < frame * 1600 + 1600; i++) energy += generated.readInt16LE(44 + i * 2) ** 2;
    expect(energy).toBeGreaterThan(10000);
  }
  expect(generated.subarray(44 + 3 * 1600 * 2, 44 + 4 * 1600 * 2).every(n => n === 0)).toBe(true);
  expect(cueSheet(production.plan, scene, 30)).toContain('drag-window');
  expect(cueSheet(production.plan, scene, 30)).toContain('54 / 1.800');
});

test('project-local production assets cannot escape by traversal, URL or symlink', async () => {
  const temp = await mkdtemp('/tmp/opencode/production-local-');
  try {
    await writeFile(join(temp, 'outside.wav'), 'protected'); await symlink(join(temp, 'outside.wav'), join(temp, 'escape'));
    for (const path of ['../outside.wav', '/etc/passwd', 'https://example.com/a.wav', 'a\\b', 'a/../b']) await expect(localFile(root, path)).rejects.toThrow();
    await expect(localFile(temp, 'escape')).resolves.toBe(join(temp, 'outside.wav'));
    await symlink('/etc/passwd', join(temp, 'outside'));
    await expect(localFile(temp, 'outside')).rejects.toThrow('escapes');
    await expect(localFile(root, 'assets/audio')).rejects.toThrow('regular file');
  } finally { await rm(temp, {recursive: true, force: true}); }
});

const frames = [{shotId: 'workspace', localFrame: 0, globalFrame: 0, path: 'screenshots/workspace-0.png', sha256: 'a'.repeat(64)}];
function review(): CreativeReview {
  return {schemaVersion: 1, sourceSha256: 'b'.repeat(64), candidateSha256: 'c'.repeat(64), reviewer: {kind: 'agent', name: 'Test reviewer'}, decision: 'accepted',
    frames: [{shotId: 'workspace', localFrame: 0, sha256: frames[0]!.sha256, observation: 'Explicit fixture observation, not a real creative acceptance.'}],
    motion: {status: 'reviewed', method: 'fixture', notes: 'Fixture only'}, sound: {status: 'measured', notes: 'Listening not performed'},
    human: {status: 'not-required', name: null, notes: 'Technical fixture'}, findings: []};
}
const validate = (r: CreativeReview, brief = production.brief) => validateCreativeReview(r, brief, scene, frames, 'b'.repeat(64), 'c'.repeat(64));
test('independent gates never convert measurements or agent claims into human approval', () => {
  expect(validate(review()).gates).toMatchObject({technical: 'passed', creative: 'partial-listening-pending', label: 'technically-verified'});
  const r = review(); r.human.status = 'approved'; r.human.name = r.reviewer.name;
  expect(() => validate(r)).toThrow('agent');
  const p = copy(); p.brief.review.humanApprovalRequired = true;
  expect(() => validate(review(), p.brief)).toThrow('pending');
  const heard = review(); heard.sound.status = 'listened';
  expect(validate(heard).gates.label).toBe('agent-reviewed');
  heard.reviewer.kind = 'human'; heard.human = {status: 'approved', name: heard.reviewer.name, notes: 'Fixture only'};
  expect(validate(heard, p.brief).gates.label).toBe('human-approved');
});
test('review requires complete hash-bound evidence and resolved serious findings', () => {
  for (const mutate of [
    (r: CreativeReview) => {r.sourceSha256 = 'd'.repeat(64);},
    (r: CreativeReview) => {r.frames = [];},
    (r: CreativeReview) => {r.frames[0]!.sha256 = 'd'.repeat(64);},
    (r: CreativeReview) => {r.motion.status = 'pending';},
    (r: CreativeReview) => {r.sound.status = 'pending';},
    (r: CreativeReview) => {r.findings = [{id: 'issue', severity: 'major', sceneId: 'desk', shotId: 'workspace', frame: 57, status: 'wont-fix', description: 'Broken focus', correction: 'Restore focus', limits: 'Fixture only'}];},
  ]) {const r = review(); mutate(r); expect(() => validate(r)).toThrow();}
});
