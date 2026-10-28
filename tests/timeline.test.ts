import {expect, test} from 'bun:test';
import {activeShot, adjacentShotFrame, clampFrame, frameToSeconds, playbackFrame, sceneFrameToShot, secondsToFrame, shotFrameToSceneFrame} from '../src/timeline';
import {loadStudioProject} from '../src/spike/project';

test('canonical mapping, half-open boundaries and scene-scoped shot identities', async () => {
  const project = await loadStudioProject('projects/showcase');
  for (const scene of project.scenes) {
    expect(sceneFrameToShot(47, scene).localFrame).toBe(47);
    expect(sceneFrameToShot(48, scene).localFrame).toBe(0);
    expect(shotFrameToSceneFrame(scene.shots[1]!.id, 47, scene)).toBe(95);
    expect(activeShot(scene.shots, 96)).toBeUndefined();
    expect(adjacentShotFrame(47, 1, scene)).toBe(48);
    expect(adjacentShotFrame(48, -1, scene)).toBe(0);
    expect(() => sceneFrameToShot(96, scene)).toThrow();
    expect(() => shotFrameToSceneFrame('missing', 0, scene)).toThrow();
    expect(() => shotFrameToSceneFrame(scene.shots[0]!.id, 48, scene)).toThrow();
  }
});
test('integer time, clamping and elapsed playback do not accumulate callback drift', () => {
  expect(frameToSeconds(45, 30)).toBe(1.5);
  expect(secondsToFrame(1.5, 30)).toBe(45);
  expect(clampFrame(-1, 96)).toBe(0);
  expect(clampFrame(96, 96)).toBe(95);
  for (const rate of [.25, .5, 1, 2]) {
    for (const elapsed of [0, 17, 333, 1000, 10000]) expect(playbackFrame(10, elapsed, 30, rate, 1000)).toBe(Math.min(999, 10 + Math.floor(elapsed * 30 * rate / 1000)));
  }
  for (const bad of [NaN, Infinity, -1, .5]) expect(() => frameToSeconds(bad, 30)).toThrow();
  expect(() => frameToSeconds(0, 0)).toThrow();
  expect(() => clampFrame(0, 0)).toThrow();
  expect(() => secondsToFrame(-1, 30)).toThrow();
  expect(() => playbackFrame(0, 10, 30, 3, 10)).toThrow();
});
