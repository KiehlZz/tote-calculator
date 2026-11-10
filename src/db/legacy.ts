import { isValidColumn } from '../domain/columns';
import { systemClock, type ToteDatabase } from './db';
import type { Clock } from './types';

export interface LegacySummary {
  entries: number;
  sessions: number;
  multipliers: number[];
}

// entries stored by an older version in a column that no longer exists
export async function findLegacyEntries(db: ToteDatabase): Promise<LegacySummary> {
  const legacy = (await db.entries.toArray()).filter((e) => !isValidColumn(e.columnMultiplier));
  return {
    entries: legacy.length,
    sessions: new Set(legacy.map((e) => e.sessionId)).size,
    multipliers: [...new Set(legacy.map((e) => e.columnMultiplier))].sort((a, b) => a - b),
  };
}

export async function removeLegacyEntries(db: ToteDatabase, clock: Clock = systemClock): Promise<number> {
  return db.transaction('rw', db.sessions, db.entries, async () => {
    const legacy = (await db.entries.toArray()).filter((e) => !isValidColumn(e.columnMultiplier));
    if (legacy.length === 0) return 0;
    await db.entries.bulkDelete(legacy.map((e) => e.id));
    const now = clock();
    for (const sessionId of new Set(legacy.map((e) => e.sessionId))) {
      await db.sessions.update(sessionId, { updatedAt: now });
    }
    return legacy.length;
  });
}