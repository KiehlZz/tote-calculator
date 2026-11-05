// 	กำหนด Dexie schema version 1 ตามที่ตกลง

import Dexie, { type EntityTable } from 'dexie';
import type { Clock, Entry, Session } from './types';

export const systemClock: Clock = () => new Date().toISOString();

export class ToteDatabase extends Dexie {
  sessions!: EntityTable<Session, 'id'>;
  entries!: EntityTable<Entry, 'id'>;

  constructor(name = 'tote-calculator') {
    super(name);
    this.version(1).stores({
      sessions: '++id, name, updatedAt',
      entries: '++id, sessionId, columnMultiplier',
    });
  }
}

export const db = new ToteDatabase();