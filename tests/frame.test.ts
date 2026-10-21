import {expect, test} from 'bun:test';
import {activeShot, formatTime} from '../src/studio/frame';
import type {Shot} from '../src/spike/project';

const shots: Shot[] = [
  {id: 'title', entry: 'a.html', durationFrames: 60, startFrame: 0},
  {id: 'diagram', entry: 'b.html', durationFrames: 90, startFrame: 60},
  {id: 'close', entry: 'c.html', durationFrames: 60, startFrame: 150},
  {id: 'commit', entry: 'd.html', durationFrames: 120, startFrame: 210},
];

test('formatTime converts frames to mm:ss:ff', () => {
  expect(formatTime(0, 30)).toBe('00:00:00');
  expect(formatTime(61, 30)).toBe('00:02:01');
  expect(formatTime(330, 30)).toBe('00:11:00');
});

test('activeShot resolves shot boundaries and the end', () => {
  expect(activeShot(shots, 59)?.id).toBe('title');
  expect(activeShot(shots, 60)?.id).toBe('diagram');
  expect(activeShot(shots, 149)?.id).toBe('diagram');
  expect(activeShot(shots, 150)?.id).toBe('close');
  expect(activeShot(shots, 209)?.id).toBe('close');
  expect(activeShot(shots, 210)?.id).toBe('commit');
  expect(activeShot(shots, 329)?.id).toBe('commit');
  expect(activeShot(shots, 330)).toBeUndefined();
});
