import { describe, it, expect } from 'vitest';
import { parseRoute, routeToHash, type Route } from '../src/ui/router';

describe('parseRoute', () => {
  it.each([
    '',
    '#',
    '#/',
    '#/unknown',
    '#/session/0',
    '#/session/-1',
    '#/session/abc',
    '#/session/3/extra',
    '#/session/03',
    '#/session/12345678901234567890',
  ])('falls back to home for %j', (hash) => {
    expect(parseRoute(hash)).toEqual({ name: 'home' });
  });

  it.each([
    ['#/session/3', 3],
    ['#/session/42', 42],
    ['#/session/999999999', 999999999],
  ])('parses %s as session %s', (hash, id) => {
    expect(parseRoute(hash)).toEqual({ name: 'session', id });
  });
});

describe('routeToHash', () => {
  it('builds the home hash', () => {
    expect(routeToHash({ name: 'home' })).toBe('#/');
  });

  it('builds a session hash', () => {
    expect(routeToHash({ name: 'session', id: 7 })).toBe('#/session/7');
  });

  it('round-trips through parseRoute', () => {
    const routes: Route[] = [{ name: 'home' }, { name: 'session', id: 7 }, { name: 'session', id: 123456 }];
    for (const route of routes) {
      expect(parseRoute(routeToHash(route))).toEqual(route);
    }
  });
});