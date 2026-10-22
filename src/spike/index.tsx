import React from 'react';
import {Composition, registerRoot} from 'remotion';
import project from '../../projects/demo/project.json';
import scene from '../../projects/demo/scenes/intro/scene.json';
import {resolveAudioTimeline} from './audio';
import {SceneComposition} from './composition';
import type {Shot} from './project';

const {width, height, fps} = project.video;
let offset = 0;
const rawShots = scene.shots.map(shot => {
  const result = {...shot, entry: `${project.scenes[0]!.path.replace(/\/[^/]+$/, '')}/${shot.entry}`,
    startFrame: offset, audio: 'audio' in shot ? shot.audio : []};
  offset += shot.durationFrames;
  return result;
});
const resolved = resolveAudioTimeline(scene.audio, rawShots, offset);
const shots: Shot[] = rawShots.map(shot => ({id: shot.id, entry: shot.entry, startFrame: shot.startFrame,
  durationFrames: shot.durationFrames, audio: resolved.shotCues[shot.id]!}));

const Intro = () => <SceneComposition shots={shots} video={project.video} audio={resolved.cues} />;
const Scoped = ({shot}: {shot: Shot}) => <SceneComposition shots={[{...shot, startFrame: 0}]}
  video={project.video} audio={shot.audio} />;
const Root = () => <>
  <Composition id="intro" component={Intro} durationInFrames={offset} fps={fps} width={width} height={height} />
  {shots.map(shot => <Composition key={shot.id} id={shot.id} component={Scoped}
    durationInFrames={shot.durationFrames} fps={fps} width={width} height={height} defaultProps={{shot}} />)}
</>;

registerRoot(Root);
