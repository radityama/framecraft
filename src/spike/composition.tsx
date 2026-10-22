import React from 'react';
import {Html5Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {cueGain, type AudioCue} from './audio';
import type {Project, Shot} from './project';
import {ShotView} from './shot';

function Cue({cue}: {cue: AudioCue}) {
  const localFrame = useCurrentFrame();
  return <Html5Audio src={staticFile(cue.src)} trimBefore={cue.trimInFrames}
    durationInFrames={cue.trimOutFrames - cue.trimInFrames} loop={cue.loop}
    volume={cueGain(cue, localFrame)} />;
}

export function SceneComposition({shots, video, audio}: {shots: Shot[]; video: Project['video']; audio: AudioCue[]}) {
  return <>
    {shots.map(shot => <Sequence key={shot.id} from={shot.startFrame} durationInFrames={shot.durationFrames}>
      <ShotView id={shot.id} entry={shot.entry} durationFrames={shot.durationFrames} {...video} />
    </Sequence>)}
    {audio.map(cue => <Sequence key={cue.id} from={cue.startFrame} durationInFrames={cue.durationFrames} layout="none">
      <Cue cue={cue} />
    </Sequence>)}
  </>;
}
