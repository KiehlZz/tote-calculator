import { COLUMNS, isValidColumn, type ColumnMultiplier } from '../domain/columns';

// keeps only the digits 0-9 (Thai digits and full-width digits are dropped), max 3
export function sanitizeDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, 3);
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
  multiplier: ColumnMultiplier;
  items: T[];
}

// always returns all six columns in order, even when a column is empty
export function groupByColumn<T extends { columnMultiplier: number }>(
  items: readonly T[],
): ColumnGroup<T>[] {
  for (const item of items) {
    if (!isValidColumn(item.columnMultiplier)) {
      throw new Error(`Unknown column multiplier: ${JSON.stringify(item.columnMultiplier)}`);
    }
  }
  return COLUMNS.map((multiplier) => ({
    multiplier,
    items: items.filter((item) => item.columnMultiplier === multiplier),
  }));
}

// returns an error message, or null when the name is acceptable
export function validateSessionName(name: string): string | null {
  return name.trim() === '' ? 'กรุณากรอกชื่อชุดข้อมูล' : null;
}