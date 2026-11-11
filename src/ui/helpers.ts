import { DEFAULT_MODE, getColumns, getDigits, isValidColumn, type Mode } from '../domain/columns';
import { isValidNumber } from '../domain/validators';

// keeps only the digits 0-9 (Thai digits and full-width digits are dropped), max 3 (or 4 in 4-digit mode)
export function sanitizeDigits(raw: string, mode: Mode = DEFAULT_MODE): string {
  return raw.replace(/[^0-9]/g, '').slice(0, getDigits(mode));
}

export function columnLabel(multiplier: number): string {
  return `x${multiplier}`;
}

// 63000 -> "63,000"
export function formatTotal(total: number): string {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error(`Invalid total: ${JSON.stringify(total)}`);
  }
  return String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface ColumnGroup<T> {
  multiplier: number;
  items: T[];
}

// always returns every column of the mode in order (six for 3-digit, two for 4-digit), even when a column is empty
export function groupByColumn<T extends { columnMultiplier: number }>(
  items: readonly T[],
  mode: Mode = DEFAULT_MODE,
): ColumnGroup<T>[] {
  for (const item of items) {
    if (!isValidColumn(item.columnMultiplier, mode)) {
      throw new Error(`Unknown column multiplier: ${JSON.stringify(item.columnMultiplier)}`);
    }
  }
  return getColumns(mode).map((multiplier) => ({
    multiplier,
    items: items.filter((item) => item.columnMultiplier === multiplier),
  }));
}

// returns an error message, or null when the name is acceptable
export function validateSessionName(name: string): string | null {
  return name.trim() === '' ? 'กรุณากรอกชื่อชุดข้อมูล' : null;
}

// returns an error message, or null when the number is acceptable
export function validateEntryNumber(value: string, mode: Mode = DEFAULT_MODE): string | null {
  return isValidNumber(value, mode) ? null : `กรุณากรอกเลข ${getDigits(mode)} หลัก`;
}

// "3 ตัว" / "4 ตัว"
export function modeLabel(mode: Mode): string {
  return `${getDigits(mode)} ตัว`;
}