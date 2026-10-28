import {useLayoutEffect, useRef, useState} from 'react';
import {IFrame, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame} from 'remotion';

type Props = {id: string; entry: string; durationFrames: number; fps: number; width: number; height: number};

export function ShotView({id, entry, durationFrames, fps, width, height}: Props) {
  const frame = useCurrentFrame();
  const iframe = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const [initial] = useState(() => delayRender(`Initial shot frame: ${id}`, {timeoutInMilliseconds: 10000}));
  const initialPending = useRef(true);

  useLayoutEffect(() => {
    const target = iframe.current;
    if (!target) return;
    const handle = delayRender(`${id} frame ${frame}`, {timeoutInMilliseconds: 10000});
    let pending = true;
    const timeout = setTimeout(() => cancelRender(new Error(`${id} frame ${frame}: no acknowledgement`)), 9000);
    const post = (type: string, data: object) => target.contentWindow?.postMessage({v: 1, type, ...data}, location.origin);
    const seek = () => post('seek', {frame});
    const onLoad = () => {
      ready.current = false;
      post('init', {ctx: {id, fps, durationFrames, width, height}});
    };
    const onMessage = ({source, origin, data}: MessageEvent) => {
      if (source !== target.contentWindow || origin !== location.origin || data?.v !== 1) return;
      if (data.type === 'error') {
        cancelRender(new Error(`${id} frame ${frame}: ${data.message}`));
      } else if (data.type === 'ready') {
        ready.current = true;
        seek();
      } else if (data.type === 'rendered' && data.frame === frame && pending) {
        pending = false;
        clearTimeout(timeout);
        continueRender(handle);
        if (initialPending.current) {
          initialPending.current = false;
          continueRender(initial);
        }
      }
    };
    window.addEventListener('message', onMessage);
    target.addEventListener('load', onLoad);
    if (ready.current) seek();
    else if (target.contentDocument?.readyState === 'complete') onLoad();
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      target.removeEventListener('load', onLoad);
      if (pending) continueRender(handle);
    };
  }, [id, frame, fps, durationFrames, width, height, initial]);

  return <IFrame ref={iframe} data-framecraft-shot-id={id} src={staticFile(entry)} style={{width, height, border: 0}} />;
}
