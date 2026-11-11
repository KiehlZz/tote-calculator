// เพิ่ม, อ่านตามชุด, แก้, ลบรายการ

import type { Mode } from '../domain/columns';
import { isValidMultiplier, isValidNumber } from '../domain/validators';
import { systemClock, type ToteDatabase } from './db';
import { sessionMode, type Clock, type Entry } from './types';

export interface EntryChanges {
  number?: string;
  columnMultiplier?: number;
}

// ตรวจตามโหมดของเซสชัน: 3 ตัว = เลข 3 หลัก + x15..x180, 4 ตัว = เลข 4 หลัก + x24/x48
function assertValid(number: unknown, columnMultiplier: unknown, mode: Mode): void {
  if (!isValidNumber(number, mode)) {
    throw new Error(`Invalid number: ${JSON.stringify(number)}`);
  }
  if (!isValidMultiplier(columnMultiplier, mode)) {
    throw new Error(`Invalid column multiplier: ${JSON.stringify(columnMultiplier)}`);
  }
}

export function createEntryRepo(db: ToteDatabase, clock: Clock = systemClock) {
  async function touchSession(sessionId: number, now: string): Promise<void> {
    await db.sessions.update(sessionId, { updatedAt: now });
  }

  return {
    async add(sessionId: number, number: string, columnMultiplier: number): Promise<Entry> {
      return db.transaction('rw', db.sessions, db.entries, async () => {
        const session = await db.sessions.get(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        assertValid(number, columnMultiplier, sessionMode(session));
        const now = clock();
        const data = { sessionId, columnMultiplier, number, createdAt: now, updatedAt: now };
        const id = await db.entries.add(data);
        await touchSession(sessionId, now);
        return { id, ...data };
      });
    },

    // entries of one session only, in the order they were added
    listBySession(sessionId: number): Promise<Entry[]> {
      return db.entries.where('sessionId').equals(sessionId).sortBy('id');
    },

    async update(id: number, changes: EntryChanges): Promise<Entry> {
      return db.transaction('rw', db.sessions, db.entries, async () => {
        const existing = await db.entries.get(id);
        if (!existing) throw new Error(`Entry not found: ${id}`);
        const number = changes.number ?? existing.number;
        const columnMultiplier = changes.columnMultiplier ?? existing.columnMultiplier;
        assertValid(number, columnMultiplier, sessionMode(await db.sessions.get(existing.sessionId)));
        const now = clock();
        const updated: Entry = { ...existing, number, columnMultiplier, updatedAt: now };
        await db.entries.put(updated);
        await touchSession(existing.sessionId, now);
        return updated;
      });
    },

    async remove(id: number): Promise<void> {
      await db.transaction('rw', db.sessions, db.entries, async () => {
        const existing = await db.entries.get(id);
        if (!existing) throw new Error(`Entry not found: ${id}`);
        await db.entries.delete(id);
        await touchSession(existing.sessionId, clock());
      });
    },
  };
}

export type EntryRepo = ReturnType<typeof createEntryRepo>;