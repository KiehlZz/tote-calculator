// ชนิดข้อมูล Session และ Entry

export interface Session {
  id: number;
  name: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
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