// เทสต์ตามข้อ 9.1 และ 9.2

import { describe, it, expect } from 'vitest';
import { calculate, getToteKey } from '../src/domain/calculation';

const e = (number: string, columnMultiplier: number) => ({ number, columnMultiplier });

describe('getToteKey', () => {
  it.each([
    ['321', '123'],
    ['546', '456'],
    ['654', '456'],
    ['211', '112'],
    ['919', '199'],
    ['555', '555'],
    ['007', '007'],
    ['700', '007'],
  ])('maps %s to %s', (input, expected) => {
    expect(getToteKey(input)).toBe(expected);
  });

  it('puts all six permutations of 123 in the same group', () => {
    for (const n of ['123', '321', '132', '213', '231', '312']) {
      expect(getToteKey(n)).toBe('123');
    }
  });

  it('puts 112, 121 and 211 in the same group', () => {
    for (const n of ['112', '121', '211']) {
      expect(getToteKey(n)).toBe('112');
    }
  });

  it('puts 456 and 654 in the same group', () => {
    expect(getToteKey('456')).toBe(getToteKey('654'));
  });

  it('separates 123 and 124', () => {
    expect(getToteKey('123')).not.toBe(getToteKey('124'));
  });

  it.each(['12', '1234', '', '12a', 'abc', ' 123'])('throws for invalid number %s', (value) => {
    expect(() => getToteKey(value)).toThrow(/Invalid number/);
  });
});

describe('calculate', () => {
  it('returns an empty result for no entries', () => {
    expect(calculate([])).toEqual({ groups: [], totalEntries: 0, groupCount: 0 });
  });

  it('counts every duplicate: 123 five times in x30 = 150', () => {
    const entries = Array.from({ length: 5 }, () => e('123', 30));
    const result = calculate(entries);
    expect(result.groups).toEqual([{ key: '123', total: 150, count: 5 }]);
  });

  it('adds 123 in x30 and 321 in x60 = 90', () => {
    const result = calculate([e('123', 30), e('321', 60)]);
    expect(result.groups).toEqual([{ key: '123', total: 90, count: 2 }]);
  });

  it('adds 123, 321, 132 in x30 = 90', () => {
    const result = calculate([e('123', 30), e('321', 30), e('132', 30)]);
    expect(result.groups).toEqual([{ key: '123', total: 90, count: 3 }]);
  });

  it('adds 456 and 546 in x30 plus 654 in x60 = 120', () => {
    const result = calculate([e('456', 30), e('546', 30), e('654', 60)]);
    expect(result.groups).toEqual([{ key: '456', total: 120, count: 3 }]);
  });

  it('does not combine numbers from different groups', () => {
    const result = calculate([e('123', 30), e('124', 60)]);
    expect(result.groups).toEqual([
      { key: '124', total: 60, count: 1 },
      { key: '123', total: 30, count: 1 },
    ]);
  });

  it('keeps leading zeros: 007 and 700 form group 007', () => {
    const result = calculate([e('007', 30), e('700', 60)]);
    expect(result.groups).toEqual([{ key: '007', total: 90, count: 2 }]);
  });

  it('gives the same result regardless of entry order', () => {
    const entries = [e('123', 30), e('456', 60), e('321', 120), e('654', 30), e('789', 210)];
    expect(calculate([...entries].reverse())).toEqual(calculate(entries));
  });

  it('sorts by total descending, then key ascending', () => {
    const result = calculate([
      e('789', 60),
      e('456', 30),
      e('456', 30),
      e('123', 30),
      e('111', 30),
    ]);
    expect(result.groups.map((g) => g.key)).toEqual(['456', '789', '111', '123']);
  });

  it('reports totalEntries, groupCount and per-group count', () => {
    const result = calculate([e('123', 30), e('321', 30), e('456', 60), e('555', 30)]);
    expect(result.totalEntries).toBe(4);
    expect(result.groupCount).toBe(3);
    expect(result.groups.find((g) => g.key === '123')?.count).toBe(2);
  });

  it('supports all six columns: one number in each = 750', () => {
    const result = calculate([
      e('123', 30),
      e('321', 60),
      e('132', 120),
      e('213', 150),
      e('231', 180),
      e('312', 210),
    ]);
    expect(result.groups).toEqual([{ key: '123', total: 750, count: 6 }]);
  });

  it('does not mutate its input', () => {
    const entries = Object.freeze([Object.freeze(e('123', 30)), Object.freeze(e('321', 60))]);
    const snapshot = JSON.stringify(entries);
    calculate(entries);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });

  it('throws on an invalid number and reports its index', () => {
    expect(() => calculate([e('123', 30), e('12', 30)])).toThrow(/index 1/);
  });

  it.each([90, 0, 30.5, NaN])('throws on invalid multiplier %s', (multiplier) => {
    expect(() => calculate([e('123', multiplier)])).toThrow(/Invalid entry/);
  });
});