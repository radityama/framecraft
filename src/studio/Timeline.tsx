import React, {useEffect, useRef, useState} from 'react';
import type {Scene} from '../spike/project';
import {formatTime, activeShot} from '../timeline';

export function Timeline({scene, fps, frame, zoom, setZoom, seek}: {scene: Scene; fps: number; frame: number; zoom: number; setZoom: (value: number) => void; seek: (frame: number) => void}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {const node = viewport.current; if (!node) return; const observer = new ResizeObserver(([entry]) => {if (entry) setWidth(entry.contentRect.width);}); observer.observe(node); return () => observer.disconnect();}, []);
  const active = activeShot(scene.shots, frame);
  useEffect(() => {
    const el = viewport.current; if (!el) return;
    const x = frame / scene.durationFrames * el.scrollWidth;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
  }, [frame, zoom, scene]);
  const ticks = Math.min(100, Math.max(1, Math.floor(width * zoom / 120)));
  return <section className="timeline" aria-label="Scene timeline">
    <div className="timeline-toolbar"><h2>Timeline <span className="muted">{scene.id} · {scene.durationFrames}f</span></h2>
      <div className="toolbar"><button onClick={() => setZoom(1)}>Fit scene</button><button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom / 2))}>−</button><button aria-label="Zoom in" disabled={zoom >= 16} onClick={() => setZoom(Math.min(16, zoom * 2))}>+</button><output aria-label="Timeline zoom">{zoom}×</output></div>
    </div>
    <div className="timeline-scroll" ref={viewport} tabIndex={0} aria-label="Scrollable timeline">
      <div className="timeline-content" style={{width: `${zoom * 100}%`}}>
        <div className="timeline-ruler" aria-hidden="true">{Array.from({length: ticks + 1}, (_, i) => {
          const value = Math.round(i / ticks * (scene.durationFrames - 1));
          return <span key={i} style={{left: `${value / scene.durationFrames * 100}%`, transform: i === ticks ? 'translateX(-100%)' : undefined}}>{formatTime(value, fps)}<small>{value}f</small></span>;
        })}</div>
        <div className="timeline-shots">{scene.shots.map(shot => <button key={shot.id} style={{width: `${shot.durationFrames / scene.durationFrames * 100}%`}} data-active={active?.id === shot.id} aria-pressed={active?.id === shot.id} title={`${shot.id}: [${shot.startFrame}, ${shot.startFrame + shot.durationFrames}), ${shot.durationFrames} frames`} onClick={() => seek(shot.startFrame)}><strong>{shot.id}</strong><span>{shot.startFrame}–{shot.startFrame + shot.durationFrames} · {shot.durationFrames}f</span></button>)}</div>
        <div className="timeline-playhead" aria-hidden="true" style={{left: `${frame / scene.durationFrames * 100}%`}} />
        <input type="range" aria-label="Timeline frame" min={0} max={scene.durationFrames - 1} step={1} value={frame} onChange={event => seek(Number(event.currentTarget.value))}/>
      </div>
    </div>
    <div className="timeline-footer"><p className="frame-count">Frame {frame} of {scene.durationFrames - 1}</p><label>Go to frame <input aria-label="Go to frame" type="number" min={0} max={scene.durationFrames - 1} value={frame} onChange={e => {if (e.currentTarget.value !== '') seek(Number(e.currentTarget.value));}} /></label></div>
  </section>;
}
