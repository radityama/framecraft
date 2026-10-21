import {Player, type PlayerRef} from '@remotion/player';
import React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {SceneComposition} from '../spike/composition';
import type {Scene, Shot, StudioProject} from '../spike/project';
import {activeShot, formatTime} from './frame';

type Status = 'loading' | 'ready' | 'seeking' | 'error';

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export function Studio() {
  const [project, setProject] = useState<StudioProject>();
  const [loadError, setLoadError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [sceneId, setSceneId] = useState<string>();
  const [routeError, setRouteError] = useState<string>();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<Status>('loading');
  const [notice, setNotice] = useState('Loading preview…');
  const player = useRef<PlayerRef>(null);
  const pending = useRef<number | null>(0);
  const scene = project?.scenes.find(candidate => candidate.id === sceneId);

  const openScene = useCallback((next: Scene, push: boolean) => {
    if (push) history.pushState(null, '', `?clip=${encodeURIComponent(next.id)}`);
    pending.current = 0;
    setSceneId(next.id);
    setRouteError(undefined);
    setFrame(0);
    setPlaying(false);
    setStatus('loading');
    setNotice('Loading preview…');
  }, []);

  const seek = useCallback((target: number, gate = true) => {
    if (!scene) return;
    const bounded = Math.min(scene.durationFrames - 1, Math.max(0, Math.round(target)));
    setFrame(bounded);
    if (gate) {
      pending.current = bounded;
      setStatus('seeking');
      setNotice(`Seeking frame ${bounded}…`);
    }
    player.current?.seekTo(bounded);
  }, [scene]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(undefined);
    (async () => {
      try {
        const response = await fetch('/api/project');
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as {error?: string};
          throw new Error(body.error ?? `Project request failed (${response.status})`);
        }
        const data = await response.json() as StudioProject;
        if (cancelled) return;
        setProject(data);
        const requested = new URLSearchParams(location.search).get('clip');
        const first = data.scenes[0];
        if (!first) return;
        const selected = requested ? data.scenes.find(candidate => candidate.id === requested) : first;
        if (!selected) {
          setSceneId(first.id);
          setRouteError(`Unknown scene "${requested}".`);
          return;
        }
        openScene(selected, false);
      } catch (error) {
        if (!cancelled) setLoadError(messageOf(error));
      }
    })();
    return () => { cancelled = true; };
  }, [attempt, openScene]);

  useEffect(() => {
    if (!project) return;
    const onPopState = () => {
      const requested = new URLSearchParams(location.search).get('clip');
      const first = project.scenes[0];
      if (!requested) {
        if (first) openScene(first, false);
        return;
      }
      const next = project.scenes.find(candidate => candidate.id === requested);
      if (!next) {
        setRouteError(`Unknown scene "${requested}".`);
        return;
      }
      openScene(next, false);
    };
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, [project, openScene]);

  useEffect(() => {
    const instance = player.current;
    if (!instance || !scene) return;
    const onFrame = ({detail}: {detail: {frame: number}}) => setFrame(detail.frame);
    const onPlay = () => {
      pending.current = null;
      setPlaying(true);
      setStatus('ready');
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      if (pending.current !== null) return;
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
  }, [scene]);

  useEffect(() => {
    if (!scene) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.v !== 1) return;
      const iframe = Array.from(document.querySelectorAll('iframe')).find(candidate => candidate.contentWindow === event.source);
      if (!iframe || !iframe.isConnected) return;
      if (event.data.type === 'error') {
        pending.current = null;
        setPlaying(false);
        setStatus('error');
        setNotice(String(event.data.message));
        return;
      }
      if (event.data.type !== 'rendered' || pending.current === null) return;
      const target = pending.current;
      const shot = activeShot(scene.shots, target);
      if (!shot || event.data.frame !== target - shot.startFrame) return;
      if (!new URL(iframe.src).pathname.endsWith(`/${shot.entry}`)) return;
      pending.current = null;
      setFrame(target);
      setStatus('ready');
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [scene]);

  const toggle = () => {
    const instance = player.current;
    if (!instance || !scene) return;
    if (playing) {
      instance.pause();
      setPlaying(false);
      seek(instance.getCurrentFrame());
      return;
    }
    if (frame >= scene.durationFrames - 1) {
      pending.current = null;
      setStatus('ready');
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
    seek(frame + delta);
  };

  const jump = (shot: Shot) => {
    player.current?.pause();
    setPlaying(false);
    seek(shot.startFrame);
  };

  if (loadError) {
    return <main className="studio-message">
      <h1>Framecraft Studio</h1>
      <p role="alert">Could not load the project: {loadError}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry loading</button>
    </main>;
  }
  if (!project) {
    return <main className="studio-message"><p role="status">Loading project…</p></main>;
  }
  if (!project.scenes.length) {
    return <main className="studio-message">
      <h1>Framecraft Studio</h1>
      <p role="status">This project has no scenes. Add a scene to <code>project.json</code> to preview it.</p>
    </main>;
  }

  const active = scene ? activeShot(scene.shots, frame) : undefined;

  return <main className="studio">
    <header className="topbar">
      <div className="identity">
        <h1>Framecraft</h1>
        <p><span>{project.title}</span> <span className="muted">{project.id}</span></p>
      </div>
      <p className="format">{project.video.width}×{project.video.height} · {project.video.fps} fps</p>
      <label className="scene-picker">Scene
        <select value={sceneId} onChange={event => {
          const next = project.scenes.find(candidate => candidate.id === event.currentTarget.value);
          if (next) openScene(next, true);
        }}>
          {project.scenes.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
        </select>
      </label>
    </header>

    {routeError ? <section className="fault" role="alert">
      <h2>{routeError}</h2>
      <p>Choose a scene from this project to continue.</p>
      <div className="fault-actions">
        {project.scenes.map(candidate => <button key={candidate.id} type="button" onClick={() => openScene(candidate, true)}>Open {candidate.id}</button>)}
      </div>
    </section> : scene && <>
      <div className="workspace">
        <section className="preview" aria-label="Preview">
          <div className="stage" id="stage" data-state={status} data-scene={scene.id} data-frame={frame} data-shot={active?.id ?? ''}>
            <Player
              key={scene.id}
              ref={player}
              component={SceneComposition}
              inputProps={{shots: scene.shots, video: project.video}}
              compositionWidth={project.video.width}
              compositionHeight={project.video.height}
              durationInFrames={scene.durationFrames}
              fps={project.video.fps}
              controls={false}
              loop={false}
              moveToBeginningWhenEnded={false}
              autoPlay={false}
              clickToPlay={false}
              doubleClickToFullscreen={false}
              spaceKeyToPlayOrPause={false}
              style={{width: '100%', height: '100%'}}
            />
            {status !== 'ready' && <div className="overlay" role={status === 'error' ? 'alert' : 'status'}>
              <p>{notice}</p>
              {status === 'error' && <button type="button" onClick={() => seek(frame)}>Retry frame</button>}
            </div>}
          </div>

          <div className="transport">
            <button type="button" onClick={() => step(-1)} aria-label="Previous frame">Prev</button>
            <button type="button" className="play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</button>
            <button type="button" onClick={() => step(1)} aria-label="Next frame">Next</button>
            <p className="timecode"><output aria-label="Current and total time">{formatTime(frame, project.video.fps)}</output><span className="muted"> / {formatTime(scene.durationFrames, project.video.fps)}</span></p>
          </div>

          <div className="timeline">
            <h2 className="sr-only">Timeline</h2>
            <div className="segments" aria-hidden="true">
              {scene.shots.map(shot => <span key={shot.id} data-active={shot.id === active?.id} style={{flexGrow: shot.durationFrames}} />)}
            </div>
            <input type="range" aria-label="Timeline frame" min={0} max={scene.durationFrames - 1} step={1} value={frame}
              onChange={event => seek(Number(event.currentTarget.value))} />
            <p className="frame-count">Frame {frame} of {scene.durationFrames - 1}</p>
          </div>
        </section>

        <aside className="shots" aria-label="Shots">
          <h2>Shots</h2>
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
      </div>
    </>}
  </main>;
}
