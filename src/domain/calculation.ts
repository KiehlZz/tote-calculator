// หน้าที่: หาเลขตัวแทน รวมกลุ่ม บวกตัวคูณ นับรายการ และเรียงผลลัพธ์ ไม่มี Set, ไม่ dedupe, ไม่แก้ array ต้นทาง
// getToteKey, calculate (รวมกลุ่ม, บวกตัวคูณ, นับรายการ, เรียงผลลัพธ์) รองรับโหมด 3 ตัว (ค่าเริ่มต้น) และ 4 ตัว

import { DEFAULT_MODE, type Mode } from './columns';
import { isValidMultiplier, isValidNumber } from './validators';

export interface EntryInput {
  number: string;
  columnMultiplier: number;
}

export interface ToteGroup {
  key: string;
  total: number;
  count: number;
}

export interface CalculationResult {
  groups: ToteGroup[];
  totalEntries: number;
  groupCount: number;
}

export function getToteKey(number: string, mode: Mode = DEFAULT_MODE): string {
  if (!isValidNumber(number, mode)) {
    throw new Error(`Invalid number: ${JSON.stringify(number)}`);
  }
  return number.split('').sort().join('');
}

export function calculate(entries: readonly EntryInput[], mode: Mode = DEFAULT_MODE): CalculationResult {
  const groups = new Map<string, ToteGroup>();

  entries.forEach((entry, index) => {
    if (!isValidNumber(entry.number, mode) || !isValidMultiplier(entry.columnMultiplier, mode)) {
      throw new Error(`Invalid entry at index ${index}: ${JSON.stringify(entry)}`);
    }

    const key = getToteKey(entry.number, mode);
    const group = groups.get(key);

    if (group) {
      group.total += entry.columnMultiplier;
      group.count += 1;
    } else {
      groups.set(key, { key, total: entry.columnMultiplier, count: 1 });
    }
  });

  const sorted = [...groups.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.key < b.key ? -1 : 1;
  });

  return {
    groups: sorted,
    totalEntries: entries.length,
    groupCount: sorted.length,
  };
}