// กำหนด Dexie schema: version 1 = เริ่มต้น, version 2 = เพิ่มฟิลด์ mode (3/4 ตัว) ให้ Session

import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_MODE } from '../domain/columns';
import type { Clock, Entry, Session } from './types';

export const systemClock: Clock = () => new Date().toISOString();

const STORES = {
  sessions: '++id, name, updatedAt',
  entries: '++id, sessionId, columnMultiplier',
};

export class ToteDatabase extends Dexie {
  sessions!: EntityTable<Session, 'id'>;
  entries!: EntityTable<Entry, 'id'>;

  constructor(name = 'tote-calculator') {
    super(name);
    this.version(1).stores(STORES);
    // v2: ไม่มี index ใหม่ แค่เติม mode = 3 ให้เซสชันเก่าทุกอัน (ข้อมูลเดิมไม่หาย)
    this.version(2)
      .stores(STORES)
      .upgrade((tx) =>
        tx
          .table('sessions')
          .toCollection()
          .modify((session: { mode?: number }) => {
            if (session.mode === undefined) session.mode = DEFAULT_MODE;
          }),
      );
  }
}

export const db = new ToteDatabase();