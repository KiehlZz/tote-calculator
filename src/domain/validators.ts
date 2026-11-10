// หน้าที่: ตรวจว่าเลขเป็น string ตัวเลข 0-9 ยาวตามโหมดพอดี (3 หรือ 4 หลัก รักษา 007 / 0012) และตัวคูณอยู่ในคอลัมน์ของโหมดนั้น
// ถ้าไม่ส่ง mode จะใช้โหมด 3 ตัวเหมือนเดิม

import { DEFAULT_MODE, getDigits, isValidColumn, type Mode } from './columns';

const NUMBER_PATTERNS: Readonly<Record<Mode, RegExp>> = {
  3: /^[0-9]{3}$/,
  4: /^[0-9]{4}$/,
};

export function isValidNumber(value: unknown, mode: Mode = DEFAULT_MODE): value is string {
  return typeof value === 'string' && NUMBER_PATTERNS[getDigits(mode)].test(value);
}

export function isValidMultiplier(value: unknown, mode: Mode = DEFAULT_MODE): boolean {
  return typeof value === 'number' && isValidColumn(value, mode);
}