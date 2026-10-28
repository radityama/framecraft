import {expect, test} from 'bun:test';
import {mkdtemp, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {feedbackMarkdown, isStale, parseFeedback, parseGeometry, type Feedback} from '../src/review/feedback';
import {FeedbackStore} from '../src/review/feedback-store';
const make = (): Feedback => ({schemaVersion: 1, projectId: 'showcase', sceneId: 'pulse', issues: [{id: crypto.randomUUID(), projectId: 'showcase', sceneId: 'pulse', shotId: 'echo', frame: 48, localFrame: 0, sourceSha256: 'a'.repeat(64), severity: 'major', category: 'layout', description: 'Move the ring inside the frame.', status: 'open', geometry: {type: 'rectangle', x: .2, y: .3, width: .4, height: .5}}]});
test('feedback schema, geometry, stable identities, source association and portable exports', () => {
  const doc = make(); expect(parseFeedback(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  expect(isStale(doc.issues[0]!, 'b'.repeat(64))).toBe(true);
  expect(isStale(doc.issues[0]!, 'a'.repeat(64))).toBe(false);
  expect(feedbackMarkdown(doc)).toContain('Scene frame: 48');
  expect(feedbackMarkdown(doc)).toContain('local frame 0');
  expect(feedbackMarkdown(doc)).toContain('Agent handoff');
  for (const value of [{type: 'point', x: -1, y: 0}, {type: 'rectangle', x: .9, y: 0, width: .2, height: .3}, {type: 'point', x: NaN, y: 0}]) expect(() => parseGeometry(value)).toThrow();
  for (const change of [{schemaVersion: 2}, {projectId: '../x'}, {issues: [...doc.issues, ...doc.issues]}, {issues: [{...doc.issues[0], frame: -1}]}, {issues: [{...doc.issues[0], description: ''}]}, {issues: [{...doc.issues[0], artifact: '/etc/passwd'}]}]) expect(() => parseFeedback({...doc, ...change})).toThrow();
});
test('atomic persistent edits/deletion, conflict detection and symlink refusal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'framecraft-feedback-'));
  try {
    const store = new FeedbackStore(root); const doc = make();
    expect((await store.read('showcase', 'pulse')).etag).toBe('missing');
    const a = await store.save(doc, 'missing');
    expect((await new FeedbackStore(root).read('showcase', 'pulse')).feedback).toEqual(doc);
    doc.issues[0]!.status = 'resolved';
    const b = await store.save(doc, a.etag);
    await expect(store.save(doc, a.etag)).rejects.toThrow('changed');
    expect((await readFile(join(root, 'showcase__pulse.feedback.json'), 'utf8'))).toContain('resolved');
    doc.issues = []; await store.save(doc, b.etag);
    expect((await store.read('showcase', 'pulse')).feedback.issues).toEqual([]);
    await symlink('/etc/passwd', join(root, 'demo__intro.feedback.json'));
    await expect(store.read('demo', 'intro')).rejects.toThrow();
    await expect(store.read('../demo', 'intro')).rejects.toThrow();
  } finally { await rm(root, {recursive: true, force: true}); }
});
