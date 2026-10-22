import {expect, test} from 'bun:test';
import {cueGain, resolveAudioTimeline} from '../src/spike/audio';

const source = {id: 'hit', src: 'assets/audio/hit.wav', startFrame: 2, durationFrames: 8,
  trimInFrames: 3, trimOutFrames: 7, gain: 0.5, fadeInFrames: 2, fadeOutFrames: 2, loop: true};
const shots = [
  {id: 'a', startFrame: 0, durationFrames: 10, audio: [source]},
  {id: 'b', startFrame: 10, durationFrames: 20, audio: [source]},
];
const timeline = (cues: unknown[]) => ({schemaVersion: 1, cues});

test('resolves scene and shot cues without changing shot-local starts or source ranges', () => {
  const result = resolveAudioTimeline(timeline([{...source, id: 'hit', startFrame: 0, durationFrames: 30}]), shots, 30);
  expect(result.cues.map(({id, startFrame, durationFrames}) => [id, startFrame, durationFrames]))
    .toEqual([['hit', 0, 30], ['a:hit', 2, 8], ['b:hit', 12, 8]]);
  expect(result.shotCues.a?.[0]).toEqual(source);
  expect(result.shotCues.b?.[0]).toEqual(source);
  expect(result.cues[2]).toMatchObject({trimInFrames: 3, trimOutFrames: 7, loop: true, gain: 0.5});
  expect(result.cues[2]).not.toBe(result.shotCues.b?.[0]);
  expect(source.startFrame).toBe(2);
});

test('overlapping cues mix, while duplicate IDs are rejected only within a scope', () => {
  const cues = [{...source, id: 'one', startFrame: 0}, {...source, id: 'two', startFrame: 1}];
  expect(resolveAudioTimeline(timeline(cues), shots, 30).cues).toHaveLength(4);
  expect(() => resolveAudioTimeline(timeline([source, source]), [], 30)).toThrow('duplicate');
  expect(() => resolveAudioTimeline(timeline([]), [{...shots[0]!, audio: [source, source]}], 30)).toThrow('duplicate');
});

test('legacy empty audio is silent, but shot cues require a versioned scene timeline', () => {
  expect(resolveAudioTimeline([], [{id: 'a', startFrame: 0, durationFrames: 10}], 10))
    .toEqual({cues: [], shotCues: {a: []}});
  expect(() => resolveAudioTimeline([], shots, 30)).toThrow('schemaVersion');
  for (const invalid of [[source], {}, {schemaVersion: 2, cues: []}, {schemaVersion: 1, cues: {}}, null]) {
    expect(() => resolveAudioTimeline(invalid, [], 30)).toThrow();
  }
  expect(() => resolveAudioTimeline(timeline([]), [{...shots[0]!, audio: {}}], 30)).toThrow('audio');
  expect(() => resolveAudioTimeline(timeline([]), [{...shots[0]!, audio: null}], 30)).toThrow('audio');
  expect(() => resolveAudioTimeline(timeline([]), [shots[0]!, shots[0]!], 30)).toThrow('duplicate shot id');
  expect(() => resolveAudioTimeline(timeline([]), [{id: '__proto__', startFrame: 0, durationFrames: 1}], 30)).toThrow('id');
});

test('validates required fields, frame ranges, source trims, fades, loop and gain', () => {
  const invalid = [
    [null, 'object'],
    [{...source, id: 'Not Kebab'}, 'id'],
    [{...source, src: ''}, 'src'],
    [{...source, startFrame: -1}, 'startFrame'],
    [{...source, startFrame: 1.5}, 'startFrame'],
    [{...source, durationFrames: 0}, 'durationFrames'],
    [{...source, startFrame: 29}, 'durationFrames'],
    [{...source, startFrame: Number.MAX_SAFE_INTEGER}, 'durationFrames'],
    [{...source, trimInFrames: -1}, 'trimInFrames'],
    [{...source, trimInFrames: null}, 'trimInFrames'],
    [{...source, trimOutFrames: 3}, 'trim'],
    [{...source, trimOutFrames: undefined}, 'trimOutFrames'],
    [{...source, loop: false}, 'trim'],
    [{...source, loop: 'true'}, 'loop'],
    [{...source, fadeInFrames: 9}, 'fade'],
    [{...source, fadeOutFrames: 7}, 'fade'],
    [{...source, fadeOutFrames: 1.5}, 'fadeOutFrames'],
    [{...source, gain: NaN}, 'gain'],
    [{...source, gain: Infinity}, 'gain'],
    [{...source, gain: null}, 'gain'],
    [{...source, gain: 1.1}, 'gain'],
  ] as const;
  for (const [cue, error] of invalid) {
    expect(() => resolveAudioTimeline(timeline([cue]), [], 30)).toThrow(error);
  }
  expect(() => resolveAudioTimeline(timeline([]), [{...shots[0]!, audio: [{...source, startFrame: 3}]}], 30))
    .toThrow('durationFrames');
  expect(() => resolveAudioTimeline(timeline([]), [{...shots[0]!, startFrame: 25}], 30)).toThrow('durationFrames');
  expect(() => resolveAudioTimeline(timeline([]), [], -1)).toThrow('durationFrames');
});

test('defaults optional fields and applies per-frame envelopes independently of looping', () => {
  const minimal = {id: 'bed', src: 'assets/audio/bed.wav', startFrame: 0, durationFrames: 4, trimOutFrames: 4};
  const cue = resolveAudioTimeline(timeline([minimal]), [], 4).cues[0]!;
  expect(cue).toEqual({...minimal, trimInFrames: 0, gain: 1, fadeInFrames: 0, fadeOutFrames: 0, loop: false});
  expect([0, 1, 3].map(frame => cueGain(cue, frame))).toEqual([1, 1, 1]);
  expect(resolveAudioTimeline(timeline([{...source, durationFrames: 4, loop: false}]), [], 30).cues[0]?.loop).toBe(false);
  const looped = resolveAudioTimeline(timeline([source]), [], 30).cues[0]!;
  expect(looped.trimOutFrames - looped.trimInFrames).toBe(4);
  expect([0, 1, 2, 3, 4, 5, 6, 7].map(frame => cueGain(looped, frame)))
    .toEqual([0, 0.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25]);
  expect(cueGain({...looped, gain: 0}, 4)).toBe(0);
});
