import {mkdir, realpath} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import type {Registry} from '../spike/registry';
import {sourceDigest} from '../review/artifacts';
import {FeedbackConflict, FeedbackStore} from '../review/feedback-store';
import {feedbackMarkdown, parseFeedback} from '../review/feedback';
import {readRevision, revisionImage, revisionSummary, type Revision} from '../review/revisions';
import {sceneFrameToShot} from '../timeline';
import {assertOutsideProject} from '../../scripts/atomic-output';

export async function createReviewApi(registry: Registry, workspacePath: string, reviewPaths: string[]) {
  const revisions: Revision[] = [];
  for (const path of reviewPaths) revisions.push(await readRevision(path));
  for (const revision of revisions) if (!registry.projects.get(revision.manifest.projectId)?.project.scenes.some(s => s.id === revision.manifest.sceneId)) throw new Error('Review project/scene is not authorized');
  const workspace = resolve(workspacePath);
  for (const root of [...registry.projects.values()].map(p => p.root).concat(revisions.map(r => r.directory))) await assertOutsideProject(join(workspace, 'feedback.json'), root);
  await mkdir(workspace, {recursive: true});
  const store = new FeedbackStore(await realpath(workspace));
  return async function reviewApi(request: Request, url: URL): Promise<Response | undefined> {
    if (!['/api/review', '/api/feedback-export', '/api/revision-image'].includes(url.pathname)) return;
    const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
    try {
      for (const key of url.searchParams.keys()) if (url.searchParams.getAll(key).length !== 1) return json({error: 'Repeated query parameter'}, 400);
      if (url.pathname === '/api/revision-image') {
        if (request.method !== 'GET') return json({error: 'Method not allowed'}, 405);
        const revision = revisions.find(r => r.id === url.searchParams.get('revision'));
        const index = url.searchParams.get('capture') ?? '';
        if (!revision || !/^\d+$/.test(index)) return json({error: 'Unknown capture'}, 404);
        const capture = revision.manifest.captures[Number(index)];
        if (!capture) return json({error: 'Unknown capture'}, 404);
        return new Response(new Uint8Array(await revisionImage(revision, capture.path)), {headers: {'Content-Type': 'image/png', 'Cache-Control': 'no-store'}});
      }
      const projectId = url.searchParams.get('project') ?? ''; const sceneId = url.searchParams.get('scene') ?? '';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId) || !/^[a-z0-9][a-z0-9-]*$/.test(sceneId)) return json({error: 'Invalid review identity'}, 400);
      const entry = registry.projects.get(projectId); const scene = entry?.project.scenes.find(s => s.id === sceneId);
      if (!entry || !scene) return json({error: 'Review project/scene not found'}, 404);
      if (url.pathname === '/api/feedback-export') {
        if (request.method !== 'GET') return json({error: 'Method not allowed'}, 405);
        const {feedback} = await store.read(projectId, sceneId); const format = url.searchParams.get('format');
        if (format !== 'json' && format !== 'md') return json({error: 'Invalid export format'}, 400);
        return new Response(format === 'md' ? feedbackMarkdown(feedback) : JSON.stringify(feedback, null, 2) + '\n', {headers: {'Content-Type': format === 'md' ? 'text/markdown' : 'application/json', 'Content-Disposition': `attachment; filename="${projectId}-${sceneId}-feedback.${format}"`, 'Cache-Control': 'no-store'}});
      }
      if (request.method === 'GET') return json({...await store.read(projectId, sceneId), sourceSha256: await sourceDigest(entry.root), revisions: revisions.filter(r => r.manifest.projectId === projectId && r.manifest.sceneId === sceneId).map(revisionSummary)});
      if (request.method !== 'PUT') return json({error: 'Method not allowed'}, 405);
      if (request.headers.get('origin') !== url.origin || request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({error: 'Same-origin JSON writes required'}, 403);
      const expected = request.headers.get('if-match');
      if (!expected || (expected !== 'missing' && !/^[a-f0-9]{64}$/.test(expected))) return json({error: 'Expected feedback revision required'}, 428);
      const reader = request.body?.getReader(); if (!reader) return json({error: 'Feedback body required'}, 400);
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const {done, value} = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024 * 1024) { await reader.cancel(); return json({error: 'Feedback too large'}, 413); } chunks.push(value); }
      let feedback;
      try { feedback = parseFeedback(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (error) { return json({error: error instanceof Error ? error.message : 'Invalid feedback'}, 400); }
      if (feedback.projectId !== projectId || feedback.sceneId !== sceneId) return json({error: 'Feedback identity mismatch'}, 400);
      const source = await sourceDigest(entry.root);
      for (const issue of feedback.issues) if (issue.sourceSha256 === source) {
        try { const mapped = sceneFrameToShot(issue.frame, scene); if (mapped.shot.id !== issue.shotId || mapped.localFrame !== issue.localFrame) throw new Error(); }
        catch { return json({error: 'Issue frame does not match scene'}, 400); }
      }
      return json({...await store.save(feedback, expected), sourceSha256: source});
    } catch (error) { return json({error: error instanceof FeedbackConflict ? error.message : 'Review request failed; check workspace or capture integrity'}, error instanceof FeedbackConflict ? 409 : 422); }
  };
}
