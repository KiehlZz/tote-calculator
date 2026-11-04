// หน้าที่: ตรวจว่าเลขเป็น string ตัวเลข 0-9 จำนวน 3 หลักพอดี (รักษา 007) และตัวคูณอยู่ใน 6 คอลัมน์
// ตรวจว่าเลขเป็น string 3 หลักที่เป็นตัวเลขล้วน และตัวคูณอยู่ใน 6 คอลัมน์

import { isValidColumn } from './columns';

const NUMBER_PATTERN = /^[0-9]{3}$/;

export function isValidNumber(value: unknown): value is string {
  return typeof value === 'string' && NUMBER_PATTERN.test(value);
}

export function isValidMultiplier(value: unknown): boolean {
  return typeof value === 'number' && isValidColumn(value);
}