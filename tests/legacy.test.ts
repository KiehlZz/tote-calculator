import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToteDatabase } from '../src/db/db';
import { findLegacyEntries, removeLegacyEntries } from '../src/db/legacy';
import { createSessionRepo } from '../src/db/sessionRepo';

let counter = 0;
let tick = 0;
let name: string;
let db: ToteDatabase;
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();

beforeEach(() => {
  name = `tote-legacy-${counter++}`;
  tick = 0;
  db = new ToteDatabase(name);
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});

// writes straight to the table, the way an older app version stored it
const addRaw = (sessionId: number, number: string, columnMultiplier: number) =>
  db.entries.add({ sessionId, number, columnMultiplier, createdAt: 'x', updatedAt: 'x' });

describe('legacy entries', () => {
  it('finds nothing when every entry is in a current column', async () => {
    const s = await createSessionRepo(db, clock).create('A');
    await addRaw(s.id, '123', 30);
    await addRaw(s.id, '456', 15);
    expect(await findLegacyEntries(db)).toEqual({ entries: 0, sessions: 0, multipliers: [] });
  });

  it('counts the entries, sessions and columns that no longer exist', async () => {
    const sessions = createSessionRepo(db, clock);
    const a = await sessions.create('A');
    const b = await sessions.create('B');
    await addRaw(a.id, '111', 210);
    await addRaw(a.id, '222', 210);
    await addRaw(b.id, '333', 210);
    await addRaw(b.id, '444', 90);
    await addRaw(a.id, '555', 30);
    expect(await findLegacyEntries(db)).toEqual({ entries: 4, sessions: 2, multipliers: [90, 210] });
  });

  it('removes only those entries and returns how many', async () => {
    const sessions = createSessionRepo(db, clock);
    const a = await sessions.create('A');
    const b = await sessions.create('B');
    await addRaw(a.id, '111', 210);
    await addRaw(a.id, '222', 30);
    await addRaw(b.id, '333', 210);
    expect(await removeLegacyEntries(db, clock)).toBe(2);
    expect((await db.entries.toArray()).map((e) => e.number)).toEqual(['222']);
    expect(await db.sessions.count()).toBe(2);
  });

  it('updates only the sessions that lost entries', async () => {
    const sessions = createSessionRepo(db, clock);
    const a = await sessions.create('A');
    const b = await sessions.create('B');
    await addRaw(a.id, '111', 210);
    await removeLegacyEntries(db, clock);
    expect((await sessions.get(a.id))!.updatedAt > a.updatedAt).toBe(true);
    expect((await sessions.get(b.id))!.updatedAt).toBe(b.updatedAt);
  });

  it('does nothing when there is nothing to remove', async () => {
    const sessions = createSessionRepo(db, clock);
    const a = await sessions.create('A');
    await addRaw(a.id, '111', 30);
    expect(await removeLegacyEntries(db, clock)).toBe(0);
    expect((await sessions.get(a.id))!.updatedAt).toBe(a.updatedAt);
    expect(await db.entries.count()).toBe(1);
  });
});