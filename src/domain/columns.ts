// หน้าที่: กำหนดโหมดของเซสชัน (3 ตัว / 4 ตัว) จำนวนหลัก และตัวคูณคงที่ของแต่ละโหมด
// โหมด 3 ตัว: x15, x30, x60, x120, x150, x180 | โหมด 4 ตัว: x24, x48

export type Mode = 3 | 4;

export const DEFAULT_MODE: Mode = 3;

export const COLUMNS = [15, 30, 60, 120, 150, 180] as const;
export const COLUMNS_4 = [24, 48] as const;

export type ColumnMultiplier = (typeof COLUMNS)[number];

export interface ModeConfig {
  readonly digits: Mode;
  readonly columns: readonly number[];
}

export const MODE_CONFIG: Readonly<Record<Mode, ModeConfig>> = {
  3: { digits: 3, columns: COLUMNS },
  4: { digits: 4, columns: COLUMNS_4 },
};

export function isValidMode(value: unknown): value is Mode {
  return value === 3 || value === 4;
}

export function getColumns(mode: Mode = DEFAULT_MODE): readonly number[] {
  return MODE_CONFIG[mode].columns;
}

export function getDigits(mode: Mode = DEFAULT_MODE): Mode {
  return MODE_CONFIG[mode].digits;
}

export function isValidColumn(value: number): value is ColumnMultiplier;
export function isValidColumn(value: number, mode: Mode): boolean;
export function isValidColumn(value: number, mode: Mode = DEFAULT_MODE): boolean {
  return getColumns(mode).includes(value);
}