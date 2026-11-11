// สร้าง, อ่าน, เปลี่ยนชื่อ, ลบชุด (ลบรายการลูกใน transaction เดียว)

import { DEFAULT_MODE, isValidMode, type Mode } from '../domain/columns';
import { systemClock, type ToteDatabase } from './db';
import type { Clock, Session } from './types';

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new Error('Session name must not be empty');
  }
  return trimmed;
}

export function createSessionRepo(db: ToteDatabase, clock: Clock = systemClock) {
  return {
    async create(name: string, mode: Mode = DEFAULT_MODE): Promise<Session> {
      const clean = normalizeName(name);
      if (!isValidMode(mode)) {
        throw new Error(`Invalid session mode: ${JSON.stringify(mode)}`);
      }
      const now = clock();
      const id = await db.sessions.add({ name: clean, createdAt: now, updatedAt: now, mode });
      return { id, name: clean, createdAt: now, updatedAt: now, mode };
    },

    get(id: number): Promise<Session | undefined> {
      return db.sessions.get(id);
    },

    // newest updatedAt first; ties broken by newest id
    async list(): Promise<Session[]> {
      const all = await db.sessions.toArray();
      return all.sort((a, b) => {
        if (a.updatedAt === b.updatedAt) return b.id - a.id;
        return a.updatedAt < b.updatedAt ? 1 : -1;
      });
    },

    async rename(id: number, name: string): Promise<Session> {
      const clean = normalizeName(name);
      return db.transaction('rw', db.sessions, async () => {
        const existing = await db.sessions.get(id);
        if (!existing) throw new Error(`Session not found: ${id}`);
        const updated: Session = { ...existing, name: clean, updatedAt: clock() };
        await db.sessions.put(updated);
        return updated;
      });
    },

    // deletes the session and all of its entries in one transaction
    async remove(id: number): Promise<void> {
      await db.transaction('rw', db.sessions, db.entries, async () => {
        const existing = await db.sessions.get(id);
        if (!existing) throw new Error(`Session not found: ${id}`);
        await db.entries.where('sessionId').equals(id).delete();
        await db.sessions.delete(id);
      });
    },
  };
}

export type SessionRepo = ReturnType<typeof createSessionRepo>;