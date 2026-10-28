import {expect, test} from 'bun:test';
import {routeFromSearch, routeSearch} from '../src/studio/catalog';

test('routes use IDs, preserve clip scene alias and reject conflicting or repeated parameters', () => {
  expect(routeFromSearch('?project=showcase&clip=signal&shot=receive')).toEqual({project: 'showcase', scene: 'signal', shot: 'receive'});
  for (const query of ['?project=../demo', '?scene=', '?project=demo&project=showcase', '?shot=one&shot=two', '?scene=signal&clip=pulse']) {
    expect(routeFromSearch(query).error).toBeTruthy();
  }
  expect(routeSearch({project: 'showcase', scene: 'signal', shot: 'receive'})).toBe('?project=showcase&scene=signal&shot=receive');
  expect(routeSearch({project: 'empty', scene: null})).toBe('?project=empty');
});
