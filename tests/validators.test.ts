// เทสต์ตัวตรวจสอบ

import { describe, it, expect } from 'vitest';
import { isValidNumber, isValidMultiplier } from '../src/domain/validators';

describe('isValidNumber', () => {
  it.each(['123', '007', '000', '999'])('accepts %s', (value) => {
    expect(isValidNumber(value)).toBe(true);
  });

  it.each(['12', '1234', '', 'abc', '12a', ' 123', '123 ', '1.5', '-12', '１２３', '123\n'])(
    'rejects string %s',
    (value) => {
      expect(isValidNumber(value)).toBe(false);
    },
  );

  it.each([123, null, undefined, {}])('rejects non-string %s', (value) => {
    expect(isValidNumber(value)).toBe(false);
  });
});

describe('isValidMultiplier', () => {
  it.each([15, 30, 60, 120, 150, 180])('accepts %s', (value) => {
    expect(isValidMultiplier(value)).toBe(true);
  });

  it.each([90, 210, 0, -30, 30.5, NaN, '30', null])('rejects %s', (value) => {
    expect(isValidMultiplier(value)).toBe(false);
  });
});