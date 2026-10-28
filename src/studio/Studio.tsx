import {Player, type PlayerRef} from '@remotion/player';
import React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {SceneComposition} from '../spike/composition';
import type {Shot, StudioProject} from '../spike/project';
import {activeShot, formatTime, clampFrame, adjacentShotFrame, shotFrameToSceneFrame} from '../timeline';
import {Timeline} from './Timeline';
import {AnnotationOverlay, ReviewPanel, useReview} from './ReviewPanel';
import {Comparison} from './Comparison';
import type {Geometry} from '../review/feedback';
import {routeFromSearch, routeSearch, type StudioCatalog, type StudioRoute} from './catalog';

type Status = 'loading' | 'ready' | 'seeking' | 'error';
const routeFromUrl = () => routeFromSearch(location.search);

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export function Studio() {
  const [catalog, setCatalog] = useState<StudioCatalog>();
  const [loaded, setLoaded] = useState<{id: string; project: StudioProject}>();
  const [loadError, setLoadError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [route, setRoute] = useState(routeFromUrl);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [geometry, setGeometry] = useState<Geometry>();
  const [annotationMode, setAnnotationMode] = useState<'none' | 'point' | 'rectangle'>('none');
  const [status, setStatus] = useState<Status>('loading');
  const [notice, setNotice] = useState('Loading preview…');
  const player = useRef<PlayerRef>(null);
  const pending = useRef<number | null>(0);
  const confirmed = useRef<number | null>(null);
  const frameRef = useRef(0);
  const previewSource = useRef<{key: string; sha: string} | undefined>(undefined);
  const projectId = route.project ?? catalog?.selected.projectId;
  const summary = catalog?.projects.find(candidate => candidate.id === projectId);
  const sceneId = route.scene ?? (projectId === catalog?.selected.projectId ? catalog?.selected.sceneId : undefined) ?? summary?.scenes[0]?.id;
  const project = loaded && loaded.id === projectId ? loaded.project : undefined;
  const scene = project?.scenes.find(candidate => candidate.id === sceneId);
  const review = useReview(project?.id, scene?.id);
  const selectedShot = scene?.shots.find(shot => shot.id === route.shot);
  const routeError = route.error ?? (catalog && (route.project && !summary
    ? `Unknown project "${route.project}".`
    : route.scene && !summary?.scenes.some(candidate => candidate.id === route.scene)
      ? `Unknown scene "${route.scene}".` : route.shot && scene && !selectedShot ? `Unknown shot "${route.shot}".` : undefined));

  const navigate = useCallback((next: StudioRoute, push: boolean) => {
    player.current?.pause();
    if (push) history.pushState(null, '', routeSearch(next));
    pending.current = 0;
    if (routeError || next.project !== projectId || next.scene !== sceneId) confirmed.current = null;
    frameRef.current = 0;
    setRoute(next);
    setFrame(0);
    setPlaying(false);
    setPreviewAttempt(0);
    setGeometry(undefined);
    setAnnotationMode('none');
    setStatus('loading');
    setNotice('Loading preview…');
  }, [projectId, sceneId, routeError]);

  const seek = useCallback((target: number, gate = true) => {
    if (!scene) return;
    const bounded = clampFrame(target, scene.durationFrames);
    frameRef.current = bounded;
    setFrame(bounded);
    if (gate) {
      const settled = confirmed.current === bounded && player.current?.getCurrentFrame() === bounded;
      pending.current = settled ? null : bounded;
      setStatus(settled ? 'ready' : 'seeking');
      setNotice(`Seeking frame ${bounded}…`);
    }
    player.current?.seekTo(bounded);
  }, [scene]);

  useEffect(() => {
    const sha = review.data?.sourceSha256;
    if (!sha || !scene || routeError) return;
    const key = `${projectId}/${sceneId}`;
    const previous = previewSource.current; previewSource.current = {key, sha};
    if (previous?.key !== key || previous.sha === sha) return;
    player.current?.pause(); setPlaying(false);
    confirmed.current = null; pending.current = frameRef.current;
    setStatus('loading'); setNotice('Source changed. Reloading the selected frame…');
    setPreviewAttempt(value => value + 1);
  }, [review.data?.sourceSha256, projectId, sceneId, routeError]);

  useEffect(() => {
    let cancelled = false;
    setCatalog(undefined);
    setLoadError(undefined);
    (async () => {
      try {
        const response = await fetch('/api/projects');
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as {error?: string};
          throw new Error(body.error ?? `Projects request failed (${response.status})`);
        }
        const data = await response.json() as StudioCatalog;
        if (!cancelled) setCatalog(data);
      } catch (error) {
        if (!cancelled) setLoadError(messageOf(error));
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    const onPopState = () => navigate(routeFromUrl(), false);
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, [navigate]);

  useEffect(() => {
    if (!summary || !projectId) return;
    const controller = new AbortController();
    setLoadError(undefined);
    (async () => {
      try {
        const response = await fetch(`/api/project?id=${encodeURIComponent(projectId)}`, {signal: controller.signal});
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as {error?: string};
          throw new Error(body.error ?? `Project request failed (${response.status})`);
        }
        const data = await response.json() as StudioProject;
        if (!controller.signal.aborted) setLoaded({id: projectId, project: data});
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(messageOf(error));
      }
    })();
    return () => controller.abort();
  }, [projectId, summary?.id, attempt]);

  useEffect(() => {
    if (!project || !scene || routeError) return;
    const target = selectedShot?.startFrame ?? 0;
    player.current?.pause();
    const settled = confirmed.current === target && player.current?.getCurrentFrame() === target;
    pending.current = settled ? null : target;
    frameRef.current = target;
    setFrame(target);
    setPlaying(false);
    setStatus(settled ? 'ready' : 'loading');
    setNotice('Loading preview…');
    player.current?.seekTo(target);
    history.replaceState(null, '', routeSearch({project: project.id, scene: scene.id, shot: selectedShot?.id ?? scene.shots[0]?.id}));
  }, [project, scene, route, routeError]);

  useEffect(() => {
    const instance = player.current;
    if (!instance || !scene) return;
    const onFrame = ({detail}: {detail: {frame: number}}) => {
      if (pending.current !== null) return;
      frameRef.current = detail.frame;
      setFrame(detail.frame);
    };
    const onPlay = () => {
      setPlaying(true);
      if (pending.current === null) setStatus('ready');
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      if (pending.current !== null) return;
      frameRef.current = scene.durationFrames - 1;
      setFrame(scene.durationFrames - 1);
      setStatus('ready');
    };
    const onError = ({detail}: {detail: {error: Error}}) => {
      pending.current = null;
      setPlaying(false);
      setStatus('error');
      setNotice(detail.error.message);
    };
    instance.addEventListener('frameupdate', onFrame);
    instance.addEventListener('play', onPlay);
    instance.addEventListener('pause', onPause);
    instance.addEventListener('ended', onEnded);
    instance.addEventListener('error', onError);
    return () => {
      instance.removeEventListener('frameupdate', onFrame);
      instance.removeEventListener('play', onPlay);
      instance.removeEventListener('pause', onPause);
      instance.removeEventListener('ended', onEnded);
      instance.removeEventListener('error', onError);
    };
  }, [scene, projectId, routeError, previewAttempt]);

  useEffect(() => {
    if (!scene) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.v !== 1) return;
      const iframe = Array.from(document.querySelectorAll('iframe')).find(candidate => candidate.contentWindow === event.source);
      if (!iframe || !iframe.isConnected || iframe.closest('#stage')?.getAttribute('data-project') !== projectId) return;
      if (event.data.type === 'error') {
        pending.current = null;
        setPlaying(false);
        setStatus('error');
        setNotice(String(event.data.message));
        return;
      }
      if (event.data.type !== 'rendered') return;
      const shot = scene.shots.find(candidate => candidate.id === iframe.dataset.framecraftShotId);
      if (!shot || !Number.isSafeInteger(event.data.frame) || event.data.frame < 0 || event.data.frame >= shot.durationFrames) return;
      const target = shotFrameToSceneFrame(shot.id, event.data.frame, scene);
      confirmed.current = target;
      if (pending.current !== target) return;
      pending.current = null;
      frameRef.current = target;
      setFrame(target);
      setStatus('ready');
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [scene, projectId]);

  const toggle = () => {
    const instance = player.current;
    if (!instance || !scene) return;
    if (playing) {
      instance.pause();
      setPlaying(false);
      const current = instance.getCurrentFrame();
      if (confirmed.current === current) {
        pending.current = null;
        frameRef.current = current;
        setFrame(current);
        setStatus('ready');
      } else seek(current);
      return;
    }
    if (frame >= scene.durationFrames - 1) {
      pending.current = null;
      setStatus('ready');
      frameRef.current = 0;
      setFrame(0);
      instance.seekTo(0);
    }
    pending.current = null;
    setStatus('ready');
    instance.play();
  };

  const step = (delta: number) => {
    player.current?.pause();
    setPlaying(false);
    seek(frameRef.current + delta);
  };

  const jump = (shot: Shot) => {
    navigate({project: project!.id, scene: scene!.id, shot: shot.id}, true);
  };

  const pauseSeek = (target: number) => {player.current?.pause(); setPlaying(false); seek(target);};

  useEffect(() => {
    if (!scene || routeError) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
        (event.target instanceof Element && event.target.closest('button, input, select, textarea, [contenteditable]'))) return;
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        toggle();
      } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault();
        if (event.shiftKey) pauseSeek(adjacentShotFrame(frameRef.current, event.code === 'ArrowRight' ? 1 : -1, scene));
        else step(event.code === 'ArrowRight' ? 1 : -1);
      } else if (event.code === 'Home' || event.code === 'End') {
        event.preventDefault(); pauseSeek(event.code === 'Home' ? 0 : scene.durationFrames - 1);
      } else if (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '0') {
        event.preventDefault(); setZoom(v => event.key === '0' ? 1 : event.key === '-' ? Math.max(1, v / 2) : Math.min(16, v * 2));
      }
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  });

  if (loadError && !catalog) {
    return <main className="studio-message">
      <h1>Framecraft Studio</h1>
      <p role="alert">Could not load projects: {loadError}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry loading</button>
    </main>;
  }
  if (!catalog) {
    return <main className="studio-message"><p role="status">Loading projects…</p></main>;
  }
  if (!catalog.projects.length) {
    return <main className="studio-message">
      <h1>Framecraft Studio</h1>
      <p role="status">No projects available. Add a valid project under <code>projects/</code> to preview it.</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry loading</button>
    </main>;
  }

  const active = scene ? activeShot(scene.shots, frame) : undefined;

  return <main className="studio">
    <header className="topbar">
      <div className="identity">
        <h1>Framecraft</h1>
        <p>{summary?.title ?? 'Choose a project'}</p>
      </div>
      {project && <p className="format">{project.id} · {project.video.width}×{project.video.height} · {project.video.fps} fps</p>}
      <label className="scene-picker">Project
        <select aria-label="Project" value={summary?.id ?? ''} onChange={event => {
          const next = catalog.projects.find(candidate => candidate.id === event.currentTarget.value);
          if (next) navigate({project: next.id, scene: next.scenes[0]?.id ?? null}, true);
        }}>
          {!summary && <option value="">Choose a project</option>}
          {catalog.projects.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
        </select>
      </label>
      {summary && <label className="scene-picker">Scene
        <select aria-label="Scene" value={summary.scenes.some(candidate => candidate.id === sceneId) ? sceneId : ''} onChange={event => {
          if (summary.scenes.some(candidate => candidate.id === event.currentTarget.value)) navigate({project: summary.id, scene: event.currentTarget.value}, true);
        }}>
          {!summary.scenes.some(candidate => candidate.id === sceneId) && <option value="">Choose a scene</option>}
          {summary.scenes.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
        </select>
      </label>}
    </header>

    {catalog.warnings.length > 0 && <details className="fault">
      <summary>Some projects were skipped ({catalog.warnings.length})</summary>
      <ul>{catalog.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
    </details>}

    {routeError ? <section className="fault" role="alert">
      <h2>{routeError}</h2>
      <p>Choose {summary ? 'a scene from this project' : 'an available project'} to continue.</p>
      <div className="fault-actions">
        {(route.shot && scene ? scene.shots : summary?.scenes ?? catalog.projects).map(candidate => <button key={candidate.id} type="button"
          onClick={() => navigate(route.shot && scene ? {project: project!.id, scene: scene.id, shot: candidate.id} : summary ? {project: summary.id, scene: candidate.id} : {project: candidate.id, scene: catalog.projects.find(item => item.id === candidate.id)?.scenes[0]?.id ?? null}, true)}>Open {candidate.id}</button>)}
      </div>
    </section> : loadError ? <section className="fault" role="alert">
      <h2>Could not load the project: {loadError}</h2>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry loading</button>
    </section> : !project ? <p role="status">Loading project…</p> : !project.scenes.length ? <section className="fault">
      <h2>This project has no scenes.</h2>
      <p>Add a scene to <code>project.json</code> to preview it.</p>
    </section> : scene && <>
      <div className="workspace">
        <aside className="shots" aria-label="Shots">
          <h2>Shots <span className="muted">{scene.shots.length} · {scene.durationFrames}f</span></h2>
          <ol>
            {scene.shots.map(shot => <li key={shot.id}>
              <button type="button" data-active={shot.id === active?.id} aria-current={shot.id === active?.id ? 'true' : undefined}
                onClick={() => jump(shot)}>
                <span>{shot.id}</span>
                <span className="muted">{shot.durationFrames}f</span>
              </button>
            </li>)}
          </ol>
        </aside>
        <section className="preview" aria-label="Preview">
          <div className="stage" id="stage" style={{aspectRatio: `${project.video.width} / ${project.video.height}`}} data-state={status} data-project={project.id} data-scene={scene.id} data-frame={frame} data-shot={active?.id ?? ''}>
            <Player
              key={`${project.id}/${scene.id}/${previewAttempt}`}
              ref={player}
              component={SceneComposition}
              inputProps={{shots: scene.shots, video: project.video, audio: scene.audio}}
              compositionWidth={project.video.width}
              compositionHeight={project.video.height}
              durationInFrames={scene.durationFrames}
              initialFrame={previewAttempt ? frame : selectedShot?.startFrame ?? 0}
              fps={project.video.fps}
              playbackRate={rate}
              controls={false}
              loop={false}
              moveToBeginningWhenEnded={false}
              autoPlay={false}
              clickToPlay={false}
              doubleClickToFullscreen={false}
              spaceKeyToPlayOrPause={false}
              style={{width: '100%', height: '100%'}}
            />
            <AnnotationOverlay issues={review.data?.feedback.issues ?? []} frame={frame} mode={annotationMode} draft={geometry} onGeometry={setGeometry}/>
            {status !== 'ready' && <div className="overlay" role={status === 'error' ? 'alert' : 'status'}>
              <p>{notice}</p>
              {status === 'error' && <button type="button" onClick={() => {
                confirmed.current = null;
                pending.current = frame;
                setStatus('loading');
                setNotice(`Reloading frame ${frame}…`);
                setPreviewAttempt(value => value + 1);
              }}>Retry frame</button>}
            </div>}
          </div>

          <div className="transport">
            <button type="button" onClick={() => pauseSeek(0)} aria-label="Jump to start">Start</button>
            <button type="button" onClick={() => pauseSeek(adjacentShotFrame(frame, -1, scene))}>Previous shot</button>
            <button type="button" onClick={() => step(-1)} aria-label="Previous frame">Prev</button>
            <button type="button" className="play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</button>
            <button type="button" onClick={() => step(1)} aria-label="Next frame">Next</button>
            <button type="button" onClick={() => pauseSeek(adjacentShotFrame(frame, 1, scene))}>Next shot</button>
            <button type="button" onClick={() => pauseSeek(scene.durationFrames - 1)} aria-label="Jump to end">End</button>
            <button type="button" onClick={() => pauseSeek(0)}>Stop</button>
            <label>Speed <select aria-label="Playback speed" value={rate} onChange={e => setRate(Number(e.currentTarget.value))}>{[.25, .5, 1, 2].map(v => <option value={v} key={v}>{v}×</option>)}</select></label>
            <p className="timecode"><output aria-label="Current and total time">{formatTime(frame, project.video.fps)}</output><span className="muted"> / {formatTime(scene.durationFrames, project.video.fps)}</span></p>
          </div>

          <Timeline scene={scene} fps={project.video.fps} frame={frame} zoom={zoom} setZoom={setZoom} seek={pauseSeek}/>
          <details className="shortcuts"><summary>Keyboard shortcuts</summary><p>Space: play/pause. Left/Right: one frame. Shift+Left/Right: previous/next shot. Home/End: scene start/end. +/−: timeline zoom. 0: fit scene. Shortcuts do not run in form fields or editable text.</p></details>
        </section>
        <aside className="inspector" aria-label="Shot inspector">
          <h2>Shot inspector</h2><dl><dt>Project / scene</dt><dd>{project.id} / {scene.id}</dd><dt>Current frame</dt><dd data-testid="inspector-frame">{frame}</dd><dt>Shot</dt><dd data-testid="inspector-shot">{active?.id}</dd><dt>Frame range</dt><dd>{active && `[${active.startFrame}, ${active.startFrame + active.durationFrames})`}</dd><dt>Duration</dt><dd>{active?.durationFrames} frames</dd><dt>Source entry</dt><dd><code>{active?.entry}</code></dd><dt>Declared audio assets</dt><dd>{[...new Set([...(active?.audio ?? []), ...scene.audio].map(c => c.src))].join(', ') || 'None'}</dd></dl>
          <ReviewPanel key={`${project.id}/${scene.id}`} review={review} projectId={project.id} scene={scene} frame={frame} ready={!playing && status === 'ready'} seek={pauseSeek} geometry={geometry} setGeometry={setGeometry} mode={annotationMode} setMode={setAnnotationMode}/>
        </aside>
      </div>
      {review.data && <Comparison key={`${project.id}/${scene.id}/${review.data.revisions.map(r => r.id).join(',')}`} revisions={review.data.revisions}/>}
    </>}
  </main>;
}
