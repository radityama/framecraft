import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {SceneComposition} from './composition';
import type {Scene, Shot, StudioProject} from './project';

type Props = {scene: Scene; video: StudioProject['video']; shotId?: string};

const defaults: Props = {
  scene: {id: 'intro', title: 'intro', durationFrames: 1, audio: [], shots: [
    {id: 'title', entry: 'scenes/intro/shots/01-title/index.html', startFrame: 0, durationFrames: 1, audio: []},
  ]},
  video: {width: 1920, height: 1080, fps: 30},
};

function selectedShot({scene, shotId}: Props): Shot {
  const shot = scene.shots.find(item => item.id === shotId);
  if (!shot) throw new Error(`Unknown shot: ${shotId ?? '(missing)'}`);
  return shot;
}

const SceneView = ({scene, video}: Props) => <SceneComposition shots={scene.shots} video={video} audio={scene.audio} />;
const ShotView = (props: Props) => {
  const shot = selectedShot(props);
  return <SceneComposition shots={[{...shot, startFrame: 0}]} video={props.video} audio={shot.audio} />;
};

const Root = () => <>
  <Composition id="scene" component={SceneView} durationInFrames={1} fps={30} width={1920} height={1080}
    defaultProps={defaults} calculateMetadata={({props}) => ({durationInFrames: props.scene.durationFrames, ...props.video})} />
  <Composition id="shot" component={ShotView} durationInFrames={1} fps={30} width={1920} height={1080}
    defaultProps={{...defaults, shotId: 'title'}}
    calculateMetadata={({props}) => ({durationInFrames: selectedShot(props).durationFrames, ...props.video})} />
</>;

registerRoot(Root);
