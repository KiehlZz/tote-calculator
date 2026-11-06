import { describe, it, expect } from 'vitest';
import { columnLabel, formatTotal, groupByColumn, sanitizeDigits, validateEntryNumber,validateSessionName } from '../src/ui/helpers';
import { COLUMNS } from '../src/domain/columns';

describe('sanitizeDigits', () => {
  it.each([
    ['123', '123'],
    ['12a3', '123'],
    ['1 2 3', '123'],
    ['1234567', '123'],
    ['', ''],
    ['abc', ''],
    ['007', '007'],
    ['１２๓', ''], // full-width and Thai digits are not accepted
  ])('turns %j into %j', (raw, expected) => {
    expect(sanitizeDigits(raw)).toBe(expected);
  });
});

describe('columnLabel', () => {
  it('labels the six columns', () => {
    expect(COLUMNS.map(columnLabel)).toEqual(['x30', 'x60', 'x120', 'x150', 'x180', 'x210']);
  });
});

describe('formatTotal', () => {
  it.each([
    [0, '0'],
    [30, '30'],
    [999, '999'],
    [1000, '1,000'],
    [63000, '63,000'],
    [1234567, '1,234,567'],
  ])('formats %s as %s', (total, expected) => {
    expect(formatTotal(total)).toBe(expected);
  });

  it('throws for negative, fractional or non-numeric totals', () => {
    for (const bad of [-1, 1.5, NaN]) {
      expect(() => formatTotal(bad)).toThrow(/Invalid total/);
    }
  });
});

describe('groupByColumn', () => {
  it('returns all six columns in order even when there are no items', () => {
    const groups = groupByColumn([]);
    expect(groups.map((g) => g.multiplier)).toEqual([30, 60, 120, 150, 180, 210]);
    expect(groups.every((g) => g.items.length === 0)).toBe(true);
  });

  it('puts items in their column and keeps their order', () => {
    const items = [
      { id: 'a', columnMultiplier: 60 },
      { id: 'b', columnMultiplier: 30 },
      { id: 'c', columnMultiplier: 60 },
      { id: 'd', columnMultiplier: 210 },
    ];
    const ids = (m: number) => groupByColumn(items).find((g) => g.multiplier === m)!.items.map((i) => i.id);
    expect(ids(30)).toEqual(['b']);
    expect(ids(60)).toEqual(['a', 'c']);
    expect(ids(120)).toEqual([]);
    expect(ids(210)).toEqual(['d']);
  });

  it('keeps duplicates: five identical items stay five', () => {
    const items = Array.from({ length: 5 }, () => ({ number: '123', columnMultiplier: 30 }));
    expect(groupByColumn(items)[0].items).toHaveLength(5);
  });

  it('throws for a multiplier outside the six columns', () => {
    expect(() => groupByColumn([{ columnMultiplier: 90 }])).toThrow(/Unknown column multiplier/);
  });
});

describe('validateSessionName', () => {
  it.each(['', '   ', '\t\n'])('rejects blank name %j', (name) => {
    expect(validateSessionName(name)).toBe('กรุณากรอกชื่อชุดข้อมูล');
  });

  it.each(['รอบเช้า', ' a ', '123'])('accepts %j', (name) => {
    expect(validateSessionName(name)).toBeNull();
  });
});

describe('validateEntryNumber', () => {
  it.each(['', '12', '1234', 'abc'])('rejects %j', (value) => {
    expect(validateEntryNumber(value)).toBe('กรุณากรอกเลข 3 หลัก');
  });

  it.each(['123', '007'])('accepts %j', (value) => {
    expect(validateEntryNumber(value)).toBeNull();
  });
});