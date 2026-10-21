import {Sequence} from 'remotion';
import type {Project, Shot} from './project';
import {ShotView} from './shot';

export function SceneComposition({shots, video}: {shots: Shot[]; video: Project['video']}) {
  return <>{shots.map(shot => <Sequence key={shot.id} from={shot.startFrame} durationInFrames={shot.durationFrames}>
    <ShotView id={shot.id} entry={shot.entry} durationFrames={shot.durationFrames} {...video} />
  </Sequence>)}</>;
}
