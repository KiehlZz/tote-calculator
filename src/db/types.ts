// ชนิดข้อมูล Session และ Entry

import { DEFAULT_MODE, type Mode } from '../domain/columns';

export interface Session {
  id: number;
  name: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  mode: Mode; // 3 = เลข 3 ตัว, 4 = เลข 4 ตัว (เซสชันเก่าก่อน v2 ถือเป็น 3)
}

// อ่านโหมดของเซสชัน ถ้าไม่มี (ข้อมูลเก่า) ให้ถือเป็น 3 ตัว
export function sessionMode(session: { mode?: Mode } | undefined): Mode {
  return session?.mode ?? DEFAULT_MODE;
}

export interface Entry {
  id: number;
  sessionId: number;
  columnMultiplier: number;
  number: string; // always a string to keep leading zeros
  createdAt: string;
  updatedAt: string;
}

export type Clock = () => string;