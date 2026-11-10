// เทสต์ Phase 10.1: engine โหมด 4 ตัว (x24, x48) และการไม่กระทบโหมด 3 ตัว

import { describe, it, expect } from 'vitest';
import { calculate, getToteKey } from '../src/domain/calculation';
import { COLUMNS, COLUMNS_4, getColumns, getDigits, isValidColumn, isValidMode } from '../src/domain/columns';
import { isValidMultiplier, isValidNumber } from '../src/domain/validators';

const e = (number: string, columnMultiplier: number) => ({ number, columnMultiplier });

describe('mode config', () => {
  it('has the fixed columns for each mode', () => {
    expect(getColumns(3)).toEqual([15, 30, 60, 120, 150, 180]);
    expect(getColumns(4)).toEqual([24, 48]);
    expect(getColumns()).toBe(COLUMNS);
    expect(COLUMNS_4).toEqual([24, 48]);
  });

  it('has the digit count for each mode', () => {
    expect(getDigits(3)).toBe(3);
    expect(getDigits(4)).toBe(4);
    expect(getDigits()).toBe(3);
  });

  it.each([3, 4])('accepts mode %s', (m) => expect(isValidMode(m)).toBe(true));
  it.each([2, 5, '3', null, undefined])('rejects mode %s', (m) => expect(isValidMode(m)).toBe(false));

  it('checks columns per mode', () => {
    expect(isValidColumn(24, 4)).toBe(true);
    expect(isValidColumn(48, 4)).toBe(true);
    expect(isValidColumn(30, 4)).toBe(false);
    expect(isValidColumn(24, 3)).toBe(false);
    expect(isValidColumn(30)).toBe(true);
  });
});

describe('validators in mode 4', () => {
  it.each(['1234', '0012', '0000', '9999'])('accepts %s', (v) => expect(isValidNumber(v, 4)).toBe(true));
  it.each(['123', '12345', '', '12a4', ' 1234', '1234 ', '１２３４', '1234\n'])('rejects %s', (v) =>
    expect(isValidNumber(v, 4)).toBe(false),
  );
  it('rejects 4 digits in mode 3 and 3 digits in mode 4', () => {
    expect(isValidNumber('1234', 3)).toBe(false);
    expect(isValidNumber('1234')).toBe(false);
    expect(isValidNumber('123', 4)).toBe(false);
  });
  it('accepts only x24 and x48 in mode 4', () => {
    expect(isValidMultiplier(24, 4)).toBe(true);
    expect(isValidMultiplier(48, 4)).toBe(true);
    for (const bad of [15, 30, 180, 0, 24.5, NaN, '24', null]) expect(isValidMultiplier(bad, 4)).toBe(false);
    expect(isValidMultiplier(24, 3)).toBe(false);
  });
});

describe('getToteKey in mode 4', () => {
  it('puts all 24 permutations of 1234 in one group', () => {
    const perms: string[] = [];
    const permute = (rest: string, acc: string) => {
      if (!rest) return void perms.push(acc);
      for (let i = 0; i < rest.length; i++) permute(rest.slice(0, i) + rest.slice(i + 1), acc + rest[i]);
    };
    permute('1234', '');
    expect(perms).toHaveLength(24);
    for (const n of perms) expect(getToteKey(n, 4)).toBe('1234');
  });

  it('handles repeated digits and keeps leading zeros', () => {
    expect(getToteKey('1123', 4)).toBe('1123');
    expect(getToteKey('3211', 4)).toBe('1123');
    expect(getToteKey('1223', 4)).toBe('1223');
    expect(getToteKey('1123', 4)).not.toBe(getToteKey('1223', 4));
    expect(getToteKey('7000', 4)).toBe('0007');
    expect(getToteKey('0012', 4)).toBe('0012');
    expect(getToteKey('2100', 4)).toBe('0012');
    expect(getToteKey('5555', 4)).toBe('5555');
  });

  it.each(['123', '12345', '', '12a4', 'abcd'])('throws for invalid number %s', (v) => {
    expect(() => getToteKey(v, 4)).toThrow(/Invalid number/);
  });

  it('throws for 4 digits in mode 3', () => {
    expect(() => getToteKey('1234')).toThrow(/Invalid number/);
    expect(() => getToteKey('1234', 3)).toThrow(/Invalid number/);
  });
});

describe('calculate in mode 4', () => {
  it('returns an empty result for no entries', () => {
    expect(calculate([], 4)).toEqual({ groups: [], totalEntries: 0, groupCount: 0 });
  });

  it('adds multipliers within a group: 1234 x24 + 4321 x48 = 72', () => {
    expect(calculate([e('1234', 24), e('4321', 48)], 4).groups).toEqual([{ key: '1234', total: 72, count: 2 }]);
  });

  it('counts every duplicate: 1234 five times in x24 = 120', () => {
    const entries = Array.from({ length: 5 }, () => e('1234', 24));
    expect(calculate(entries, 4).groups).toEqual([{ key: '1234', total: 120, count: 5 }]);
  });

  it('separates groups with different digits', () => {
    const r = calculate([e('1123', 24), e('1223', 48)], 4);
    expect(r.groups).toEqual([
      { key: '1223', total: 48, count: 1 },
      { key: '1123', total: 24, count: 1 },
    ]);
    expect(r.groupCount).toBe(2);
    expect(r.totalEntries).toBe(2);
  });

  it('sorts by total descending, then key ascending', () => {
    const r = calculate([e('9876', 24), e('1234', 24), e('5555', 48), e('0012', 24)], 4);
    expect(r.groups.map((g) => g.key)).toEqual(['5555', '0012', '1234', '6789']);
  });

  it('does not mutate the input array', () => {
    const entries = [e('4321', 24), e('1234', 48)];
    const copy = JSON.parse(JSON.stringify(entries));
    calculate(entries, 4);
    expect(entries).toEqual(copy);
  });

  it('throws immediately on an invalid entry and reports its index', () => {
    expect(() => calculate([e('1234', 24), e('123', 24)], 4)).toThrow(/Invalid entry at index 1/);
    expect(() => calculate([e('1234', 30)], 4)).toThrow(/Invalid entry at index 0/);
    expect(() => calculate([e('1234', 15)], 4)).toThrow(/Invalid entry/);
  });

  it('rejects 3-digit entries and x15..x180 columns in mode 4', () => {
    expect(() => calculate([e('123', 24)], 4)).toThrow(/Invalid entry/);
    expect(() => calculate([e('1234', 180)], 4)).toThrow(/Invalid entry/);
  });
});

describe('mode 3 is unchanged', () => {
  it('still works with no mode argument and with mode 3', () => {
    const entries = [e('123', 30), e('321', 60)];
    expect(calculate(entries)).toEqual(calculate(entries, 3));
    expect(calculate(entries).groups).toEqual([{ key: '123', total: 90, count: 2 }]);
  });

  it('rejects 4-digit numbers and x24/x48 in mode 3', () => {
    expect(() => calculate([e('1234', 30)])).toThrow(/Invalid entry/);
    expect(() => calculate([e('123', 24)])).toThrow(/Invalid entry/);
    expect(() => calculate([e('123', 48)], 3)).toThrow(/Invalid entry/);
  });
});