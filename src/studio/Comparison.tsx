import React, {useState} from 'react';
import type {RevisionSummary} from '../review/revisions';
import {matchedFrames} from '../review/comparison';

export function Comparison({revisions}: {revisions: RevisionSummary[]}) {
  const [left, setLeft] = useState(revisions[0]?.id ?? '');
  const [right, setRight] = useState(revisions[1]?.id ?? '');
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState('side');
  const [split, setSplit] = useState(50);
  const [error, setError] = useState('');
  const a = revisions.find(r => r.id === left), b = revisions.find(r => r.id === right);
  const frames = a && b ? matchedFrames(a, b) : [];
  const f = frames.find(c => c.globalFrame === selected) ?? frames[0];
  const image = (r: RevisionSummary) => `/api/revision-image?revision=${r.id}&capture=${r.frames.findIndex(c => c.globalFrame === f?.globalFrame && c.shotId === f.shotId && c.localFrame === f.localFrame)}`;
  return <section className="comparison" aria-label="Revision comparison"><h2>Revision comparison</h2>
    <p className="muted">Only explicitly authorized, verified captures are available. No video is preloaded.</p>
    {revisions.length < 2 && <p role="status">Register two captures with Studio’s repeated --review option to compare revisions.</p>}
    <div className="form-pair">{(['Before', 'After'] as const).map((label, i) => <label key={label}>{label}<select aria-label={`${label} revision`} value={i ? right : left} onChange={e => { (i ? setRight : setLeft)(e.currentTarget.value); setError(''); }}><option value="">Choose revision</option>{revisions.map(r => <option key={r.id} value={r.id}>{r.id.slice(0, 10)} · source {r.sourceSha256.slice(0, 10)}</option>)}</select></label>)}</div>
    {a && b && <>
      <p className="source-digest">Before: {a.id} / source {a.sourceSha256}<br/>After: {b.id} / source {b.sourceSha256}</p>
      {!frames.length ? <p role="alert">Comparison unavailable: project, scene, video format, shot layout, or captured frame identities differ.</p> : <>
        <div className="toolbar"><label>Matched frame<select aria-label="Comparison frame" value={f!.globalFrame} onChange={e => {setSelected(Number(e.currentTarget.value)); setError('');}}>{frames.map(c => <option key={c.globalFrame} value={c.globalFrame}>Scene {c.globalFrame} · {c.shotId}:{c.localFrame}</option>)}</select></label><label>View<select aria-label="Comparison view" value={mode} onChange={e => setMode(e.currentTarget.value)}><option value="side">Side by side</option><option value="split">Split</option></select></label></div>
        {mode === 'split' && <label>Split position<input aria-label="Comparison split" type="range" min="0" max="100" value={split} onChange={e => setSplit(Number(e.currentTarget.value))}/></label>}
        {error && <p role="alert">{error}</p>}
        <div className={`comparison-images ${mode}`} style={{aspectRatio: mode === 'split' ? `${a.video.width}/${a.video.height}` : undefined}}>
          <img key={`a${left}${f!.globalFrame}`} src={image(a)} alt={`Before: ${f!.shotId} frame ${f!.localFrame}`} onError={() => setError('Before capture failed verification or could not load.')}/>
          <img key={`b${right}${f!.globalFrame}`} src={image(b)} alt={`After: ${f!.shotId} frame ${f!.localFrame}`} style={mode === 'split' ? {clipPath: `inset(0 0 0 ${split}%)`} : undefined} onError={() => setError('After capture failed verification or could not load.')}/>
        </div>
      </>}
    </>}
  </section>;
}
