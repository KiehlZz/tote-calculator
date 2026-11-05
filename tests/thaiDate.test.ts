import { describe, it, expect } from 'vitest';
import { formatThaiDate, formatThaiDateTime } from '../src/utils/thaiDate';

describe('formatThaiDate', () => {
  it.each([
    ['2026-11-05T10:00:00.000Z', '5 พ.ย. 2569'],
    ['2026-12-31T17:30:00.000Z', '1 ม.ค. 2570'], // already the next day and year in Bangkok
    ['2026-01-01T00:00:00.000Z', '1 ม.ค. 2569'],
    ['2026-03-31T16:59:59.000Z', '31 มี.ค. 2569'], // last second before Bangkok midnight
    ['2026-03-31T17:00:00.000Z', '1 เม.ย. 2569'], // Bangkok midnight
  ])('formats %s as %s', (iso, expected) => {
    expect(formatThaiDate(iso)).toBe(expected);
  });

  it('uses the right abbreviation for all twelve months', () => {
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    months.forEach((name, index) => {
      const mm = String(index + 1).padStart(2, '0');
      expect(formatThaiDate(`2026-${mm}-15T05:00:00.000Z`)).toBe(`15 ${name} 2569`);
    });
  });

  it('throws on an invalid date', () => {
    expect(() => formatThaiDate('')).toThrow(/Invalid date/);
    expect(() => formatThaiDate('yesterday')).toThrow(/Invalid date/);
  });
});

describe('formatThaiDateTime', () => {
  it.each([
    ['2026-11-05T10:00:00.000Z', '5 พ.ย. 2569 17:00 น.'],
    ['2026-12-31T17:30:00.000Z', '1 ม.ค. 2570 00:30 น.'],
    ['2026-01-01T00:00:00.000Z', '1 ม.ค. 2569 07:00 น.'],
  ])('formats %s as %s', (iso, expected) => {
    expect(formatThaiDateTime(iso)).toBe(expected);
  });

  it('throws on an invalid date', () => {
    expect(() => formatThaiDateTime('')).toThrow(/Invalid date/);
    expect(() => formatThaiDateTime('yesterday')).toThrow(/Invalid date/);
  });
});