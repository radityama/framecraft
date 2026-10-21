import {Composition, registerRoot} from 'remotion';
import project from '../../projects/demo/project.json';
import scene from '../../projects/demo/scenes/intro/scene.json';
import {SceneComposition} from './composition';
import {ShotView} from './shot';

const {width, height, fps} = project.video;
const shots = scene.shots.map((shot, index) => ({...shot, entry: `${project.scenes[0]!.path.replace(/\/[^/]+$/, '')}/${shot.entry}`, startFrame: scene.shots.slice(0, index).reduce((sum, s) => sum + s.durationFrames, 0)}));
const props = (shot: typeof shots[number]) => ({id: shot.id, entry: shot.entry, durationFrames: shot.durationFrames, width, height, fps});

const Intro = () => <SceneComposition shots={shots} video={project.video} />;
const Root = () => <>
  <Composition id="intro" component={Intro} durationInFrames={shots.reduce((sum, s) => sum + s.durationFrames, 0)} fps={fps} width={width} height={height} />
  {shots.map(shot => <Composition key={shot.id} id={shot.id} component={ShotView} durationInFrames={shot.durationFrames} fps={fps} width={width} height={height} defaultProps={props(shot)} />)}
</>;

registerRoot(Root);
