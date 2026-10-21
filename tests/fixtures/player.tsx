import {createRoot} from 'react-dom/client';
import React, {createRef} from 'react';
import {Player, type PlayerRef} from '@remotion/player';
import {ShotView} from '../../src/spike/shot';

const ref = createRef<PlayerRef>();
createRoot(document.getElementById('video-container')!).render(
  <Player ref={ref} component={ShotView} compositionWidth={1920} compositionHeight={1080} durationInFrames={90} fps={30}
    inputProps={{id:'diagram', entry:'scenes/intro/shots/02-diagram/index.html', durationFrames:90, fps:30, width:1920, height:1080}} />,
);

(window as any).seekPlayer = (frame: number) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => {cleanup(); reject(new Error(`Timed out at ${frame}`));}, 5000);
  const cleanup = () => {clearTimeout(timer); window.removeEventListener('message', onMessage);};
  const onMessage = ({data}: MessageEvent) => {
    if (data?.type === 'error') {cleanup(); reject(new Error(data.message));}
    if (data?.type === 'rendered' && data.frame === frame) {cleanup(); resolve();}
  };
  window.addEventListener('message', onMessage);
  ref.current?.seekTo(frame);
});
