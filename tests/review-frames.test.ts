import {expect, test} from 'bun:test';
import {selectReviewFrames} from '../src/review/frames';

test('selects the only frame of a one-frame shot once', () => {
  expect(selectReviewFrames([{id: 'one', startFrame: 0, durationFrames: 1}], [])).toEqual([
    {shotId: 'one', localFrame: 0, globalFrame: 0, path: 'screenshots/one-local-0000-global-0000.png'},
  ]);
});

test('selects first, middle and last for short shots on both sides of a zero-overlap cut', () => {
  const frames = selectReviewFrames([
    {id: 'one', startFrame: 0, durationFrames: 1},
    {id: 'short', startFrame: 1, durationFrames: 4},
    {id: 'next', startFrame: 5, durationFrames: 2},
  ], []);
  expect(frames.map(({shotId, localFrame, globalFrame}) => [shotId, localFrame, globalFrame])).toEqual([
    ['one', 0, 0], ['short', 0, 1], ['short', 1, 2], ['short', 3, 4],
    ['next', 0, 5], ['next', 1, 6],
  ]);
});

test('adds quarter frames for long shots, deduplicates milestones and sorts globally', () => {
  const frames = selectReviewFrames([
    {id: 'long', startFrame: 5, durationFrames: 90},
    {id: 'short', startFrame: 1, durationFrames: 4},
    {id: 'one', startFrame: 0, durationFrames: 1},
  ], ['long:67', 'short:0', 'long:67']);
  expect(frames.map(({shotId, localFrame, globalFrame}) => [shotId, localFrame, globalFrame])).toEqual([
    ['one', 0, 0], ['short', 0, 1], ['short', 1, 2], ['short', 3, 4],
    ['long', 0, 5], ['long', 22, 27], ['long', 44, 49], ['long', 66, 71],
    ['long', 67, 72], ['long', 89, 94],
  ]);
  expect(frames[4]?.path).toBe('screenshots/long-local-0000-global-0005.png');
  expect(frames.at(-1)?.path).toBe('screenshots/long-local-0089-global-0094.png');
});

test('rejects malformed, unknown and out-of-range milestones', () => {
  const shots = [{id: 'a', startFrame: 0, durationFrames: 2}];
  for (const milestone of ['missing:0', 'a:-1', 'a:2', 'a:1.2', 'a:1x', 'a:', 'a:0:1',
    'a:01', 'a:+1', 'a:9007199254740992']) {
    expect(() => selectReviewFrames(shots, [milestone])).toThrow();
  }
});

test('rejects invalid shot ranges, unsafe or duplicate IDs before naming files', () => {
  const valid = {id: 'safe', startFrame: 0, durationFrames: 1};
  for (const shot of [
    {...valid, id: '../escape'}, {...valid, id: ''},
    {...valid, startFrame: -1}, {...valid, startFrame: 0.5},
    {...valid, durationFrames: 0}, {...valid, durationFrames: 1.5},
    {...valid, startFrame: Number.MAX_SAFE_INTEGER},
  ]) {
    expect(() => selectReviewFrames([shot], [])).toThrow();
  }
  expect(() => selectReviewFrames([valid, valid], [])).toThrow('duplicate shot id');
});

test('quarters start at 90 frames and filename digits widen without truncation', () => {
  expect(selectReviewFrames([{id: 'x', startFrame: 0, durationFrames: 89}], []).map(item => item.localFrame))
    .toEqual([0, 44, 88]);
  expect(selectReviewFrames([{id: 'x', startFrame: 10000, durationFrames: 90}], []).map(item => item.localFrame))
    .toEqual([0, 22, 44, 66, 89]);
  expect(selectReviewFrames([{id: 'x', startFrame: 10000, durationFrames: 1}], [])[0]?.path)
    .toBe('screenshots/x-local-0000-global-10000.png');
  expect(selectReviewFrames([{id: 'x', startFrame: 0, durationFrames: 10001}], ['x:10000'])
    .at(-1)?.path).toBe('screenshots/x-local-10000-global-10000.png');
});

test('shot ID breaks global-frame ties', () => {
  expect(selectReviewFrames([
    {id: 'z', startFrame: 0, durationFrames: 1},
    {id: 'a', startFrame: 0, durationFrames: 1},
  ], []).map(frame => frame.shotId)).toEqual(['a', 'z']);
});
