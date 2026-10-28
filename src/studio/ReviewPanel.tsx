import React, {useEffect, useRef, useState} from 'react';
import {categories, severities, issueStatuses, parseFeedback, parseGeometry, isStale, type Feedback, type Geometry, type ReviewIssue} from '../review/feedback';
import type {RevisionSummary} from '../review/revisions';
import type {Scene} from '../spike/project';
import {sceneFrameToShot} from '../timeline';

type ReviewData = {feedback: Feedback; etag: string; sourceSha256: string; revisions: RevisionSummary[]};
export function useReview(projectId?: string, sceneId?: string) {
  const [data, setData] = useState<ReviewData>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [attempt, reload] = useState(0);
  const query = `project=${encodeURIComponent(projectId ?? '')}&scene=${encodeURIComponent(sceneId ?? '')}`;
  const identity = useRef(query); identity.current = query;
  useEffect(() => {
    setData(undefined); setError(''); if (!projectId || !sceneId) return;
    const controller = new AbortController();
    fetch(`/api/review?${query}`, {signal: controller.signal}).then(async r => {const body = await r.json(); if (!r.ok) throw new Error(body.error); parseFeedback(body.feedback); if (!controller.signal.aborted) setData(body);}).catch(e => {if (!controller.signal.aborted) setError(String(e.message));});
    return () => controller.abort();
  }, [query, attempt]);
  useEffect(() => {
    if (!projectId || !sceneId) return;
    let controller: AbortController | undefined;
    const checkSource = async () => {
      controller?.abort();
      const request = new AbortController(); controller = request;
      try {
        const response = await fetch(`/api/review?${query}`, {signal: request.signal});
        const body = await response.json(); if (!response.ok) throw new Error(body.error);
        if (!request.signal.aborted) setData(previous => previous && ({...previous, sourceSha256: body.sourceSha256}));
      } catch (e) {if (!request.signal.aborted) setError(`Source recheck failed: ${e instanceof Error ? e.message : String(e)}`);}
    };
    addEventListener('focus', checkSource);
    return () => {controller?.abort(); removeEventListener('focus', checkSource);};
  }, [query]);
  async function save(feedback: Feedback) {
    if (!data || busy) return false;
    const key = query; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/review?${query}`, {method: 'PUT', headers: {'Content-Type': 'application/json', 'If-Match': data.etag}, body: JSON.stringify(parseFeedback(feedback))});
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (identity.current === key) setData({...data, ...body}); return true;
    } catch (e) {if (identity.current === key) setError(e instanceof Error ? e.message : String(e)); return false;}
    finally {setBusy(false);}
  }
  return {data: data && data.feedback.projectId === projectId && data.feedback.sceneId === sceneId ? data : undefined, error, busy, save, refresh: () => reload(v => v + 1), query};
}
export type ReviewController = ReturnType<typeof useReview>;
export function AnnotationOverlay({issues, frame, mode, onGeometry, draft}: {issues: ReviewIssue[]; frame: number; mode: 'none' | 'point' | 'rectangle'; onGeometry: (g: Geometry) => void; draft?: Geometry}) {
  const start = useRef<{x: number; y: number} | undefined>(undefined);
  const geometry = issues.filter(i => i.frame === frame && i.status === 'open').map(i => i.geometry).filter((g): g is Geometry => !!g).concat(draft ? [draft] : []);
  return <svg className="annotation-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Frame annotation regions" style={{pointerEvents: mode === 'none' ? 'none' : 'auto'}}
    onPointerDown={e => {if (mode === 'none') return; const r = e.currentTarget.getBoundingClientRect(); start.current = {x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))}; e.currentTarget.setPointerCapture(e.pointerId); if (mode === 'point') onGeometry({type: 'point', ...start.current});}}
    onPointerUp={e => {if (mode !== 'rectangle' || !start.current) return; const r = e.currentTarget.getBoundingClientRect(); const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); const g = {type: 'rectangle' as const, x: Math.min(x, start.current.x), y: Math.min(y, start.current.y), width: Math.abs(x - start.current.x), height: Math.abs(y - start.current.y)}; if (g.width && g.height) onGeometry(g); start.current = undefined;}}>
    {geometry.map((g, i) => g.type === 'point' ? <circle key={i} cx={g.x * 1000} cy={g.y * 1000} r="12" vectorEffect="non-scaling-stroke"/> : <rect key={i} x={g.x * 1000} y={g.y * 1000} width={g.width * 1000} height={g.height * 1000} vectorEffect="non-scaling-stroke"/>)}
  </svg>;
}
export function ReviewPanel({review, scene, frame, projectId, ready, seek, geometry, setGeometry, mode, setMode}: {review: ReviewController; scene: Scene; frame: number; projectId: string; ready: boolean; seek: (f: number) => void; geometry?: Geometry; setGeometry: (g?: Geometry) => void; mode: 'none' | 'point' | 'rectangle'; setMode: (m: 'none' | 'point' | 'rectangle') => void}) {
  const [selected, setSelected] = useState<string>(); const [description, setDescription] = useState(''); const [severity, setSeverity] = useState<ReviewIssue['severity']>('minor'); const [category, setCategory] = useState<ReviewIssue['category']>('layout'); const [status, setStatus] = useState<ReviewIssue['status']>('open'); const [formError, setFormError] = useState('');
  const doc = review.data?.feedback; const issue = doc?.issues.find(i => i.id === selected);
  useEffect(() => {setGeometry(issue?.frame === frame ? issue.geometry : undefined); setMode('none');}, [frame, selected]);
  const clear = () => {setSelected(undefined); setDescription(''); setGeometry(undefined); setMode('none'); setStatus('open'); setFormError('');};
  const choose = (i: ReviewIssue) => {setSelected(i.id); setDescription(i.description); setSeverity(i.severity); setCategory(i.category); setStatus(i.status); setGeometry(i.geometry); setMode('none'); seek(i.frame);};
  return <section className="review-panel" aria-label="Review annotations"><h2>Review annotations</h2>
    {review.error && <p role="alert">{review.error} Your unsaved form is preserved.</p>}
    <button type="button" onClick={() => {if (!description || confirm('Reload feedback and discard the unsaved form?')) {clear(); review.refresh();}}}>Check source / reload feedback</button>
    {!doc ? <p role="status">{review.error ? 'Feedback unavailable. Reload to retry.' : 'Loading feedback…'}</p> : <>
      <p className="source-digest">Current source <code>{review.data!.sourceSha256}</code></p>
      <p>{doc.issues.filter(i => i.frame === frame).length} issues at frame {frame}; {doc.issues.length} in scene.</p>
      <ul className="issue-list">{doc.issues.map(i => <li key={i.id}><button type="button" aria-pressed={selected === i.id} onClick={() => choose(i)}>{i.severity} · {i.shotId}:{i.localFrame} · {i.status}{isStale(i, review.data!.sourceSha256) ? ' · STALE source' : ''}<span>{i.description}</span></button></li>)}</ul>
      {!doc.issues.length && <p className="muted">No feedback yet. Pause on an exact frame to add an issue.</p>}
      <form onSubmit={async e => {e.preventDefault(); setFormError(''); try {
        if (geometry) parseGeometry(geometry);
         const mapped = sceneFrameToShot(frame, scene);
         if (issue && issue.frame !== frame) throw new Error('Return to the issue frame before editing it.');
         const revision = review.data!.revisions.find(r => r.sourceSha256 === review.data!.sourceSha256 && r.frames.some(f => f.globalFrame === frame && f.shotId === mapped.shot.id && f.localFrame === mapped.localFrame));
         const capture = revision?.frames.find(f => f.globalFrame === frame);
         const artifact = revision && capture ? `revisions/${revision.id}/${capture.path}` : undefined;
         const next: ReviewIssue = issue ? {...issue, description, severity, category, status, geometry} : {id: crypto.randomUUID(), projectId, sceneId: scene.id, shotId: mapped.shot.id, frame, localFrame: mapped.localFrame, sourceSha256: review.data!.sourceSha256, severity, category, description, status, geometry, artifact};
        if (await review.save({...doc, issues: issue ? doc.issues.map(i => i.id === issue.id ? next : i) : [...doc.issues, next]})) clear();
      } catch (error) {setFormError(error instanceof Error ? error.message : String(error));}}}>
        <h3>{issue ? `Edit issue at frame ${issue.frame}` : `New issue at frame ${frame}`}</h3>
        {issue && <><p>Shot {issue.shotId}, local {issue.localFrame}</p><p className="source-digest">Issue source <code>{issue.sourceSha256}</code></p></>}
        <label>Description<textarea aria-label="Issue description" required maxLength={10000} value={description} onChange={e => setDescription(e.currentTarget.value)}/></label>
        <div className="form-pair"><label>Severity<select aria-label="Issue severity" value={severity} onChange={e => setSeverity(e.currentTarget.value as typeof severity)}>{severities.map(s => <option key={s}>{s}</option>)}</select></label><label>Category<select aria-label="Issue category" value={category} onChange={e => setCategory(e.currentTarget.value as typeof category)}>{categories.map(s => <option key={s}>{s}</option>)}</select></label></div>
        <label>Status<select aria-label="Issue status" value={status} onChange={e => setStatus(e.currentTarget.value as typeof status)}>{issueStatuses.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Region<select aria-label="Annotation region" value={mode !== 'none' ? mode : geometry?.type ?? 'none'} onChange={e => {const value = e.currentTarget.value as typeof mode; setMode(value); setGeometry(value === 'none' ? undefined : value === 'point' ? {type: 'point', x: .5, y: .5} : {type: 'rectangle', x: .25, y: .25, width: .5, height: .5});}}><option value="none">None</option><option value="point">Point (click preview)</option><option value="rectangle">Rectangle (drag preview)</option></select></label>
        {geometry && <div className="geometry-fields">{Object.keys(geometry).filter(k => k !== 'type').map(k => <label key={k}>{k}<input aria-label={`Region ${k}`} type="number" min="0" max="1" step="0.01" value={geometry[k as 'x' | 'y']} onChange={e => setGeometry({...geometry, [k]: Number(e.currentTarget.value)})}/></label>)}</div>}
        {formError && <p role="alert">{formError}</p>}
         {issue && issue.frame !== frame && <p role="status">Select this issue again to return to its frame before editing.</p>}
         <div className="toolbar"><button type="submit" disabled={review.busy || !ready || !!issue && issue.frame !== frame}>{review.busy ? 'Saving…' : issue ? 'Save issue' : 'Add issue'}</button><button type="button" onClick={clear}>Clear form</button></div>
        {issue && <div className="toolbar"><button type="button" disabled={review.busy || !ready} onClick={async () => {if (confirm('Revalidate this issue against the current source at its existing frame?')) {try {const mapped = sceneFrameToShot(issue.frame, scene); if (mapped.shot.id !== issue.shotId || mapped.localFrame !== issue.localFrame) throw new Error('Frame mapping changed; create a new issue at the correct frame.'); if (await review.save({...doc, issues: doc.issues.map(i => i.id === issue.id ? {...i, sourceSha256: review.data!.sourceSha256, artifact: undefined} : i)})) clear();} catch (error) {setFormError(error instanceof Error ? error.message : String(error));}}}}>Revalidate source</button><button type="button" disabled={review.busy} onClick={async () => {if (confirm('Delete this issue permanently?') && await review.save({...doc, issues: doc.issues.filter(i => i.id !== issue.id)})) clear();}}>Delete issue</button></div>}
      </form>
      <div className="toolbar"><a download href={`/api/feedback-export?${review.query}&format=json`}>Export JSON</a><a download href={`/api/feedback-export?${review.query}&format=md`}>Export Markdown</a></div>
      <p className="muted">Exports include saved issues only. Historical captures are never edited.</p>
    </>}
  </section>;
}
