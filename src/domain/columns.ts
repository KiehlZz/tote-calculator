// หน้าที่: กำหนดค่าตัวคูณทั้ง 6 คอลัมน์ที่ล็อกตายตัว
// ค่าคงที่ 6 คอลัมน์: 30, 60, 120, 150, 180, 210

export const COLUMNS = [30, 60, 120, 150, 180, 210] as const;

export type ColumnMultiplier = (typeof COLUMNS)[number];

export function isValidColumn(value: number): value is ColumnMultiplier {
  return (COLUMNS as readonly number[]).includes(value);
}