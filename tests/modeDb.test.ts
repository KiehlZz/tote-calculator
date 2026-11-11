// เทสต์ Phase 10.2: Session มี mode (3/4 ตัว), Dexie v1 -> v2 migration, repo ตรวจตามโหมด, legacy ไม่นับ x24/x48 ของเซสชัน 4 ตัว
// บรรทัดแรกต้องเป็น import 'fake-indexeddb/auto'

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { calculate } from '../src/domain/calculation';
import { ToteDatabase } from '../src/db/db';
import { createEntryRepo } from '../src/db/entryRepo';
import { findLegacyEntries, removeLegacyEntries } from '../src/db/legacy';
import { createSessionRepo } from '../src/db/sessionRepo';

let counter = 0;
let tick = 0;
let dbName: string;
let db: ToteDatabase;
let sessions: ReturnType<typeof createSessionRepo>;
let entries: ReturnType<typeof createEntryRepo>;
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();

beforeEach(() => {
  dbName = `tote-mode-${counter++}`;
  tick = 0;
  db = new ToteDatabase(dbName);
  sessions = createSessionRepo(db, clock);
  entries = createEntryRepo(db, clock);
});

afterEach(async () => {
  db.close();
  await Dexie.delete(dbName);
});

describe('sessionRepo mode', () => {
  it('defaults to mode 3 and stores mode 4 when asked', async () => {
    const a = await sessions.create('A');
    const b = await sessions.create('B', 4);
    expect(a.mode).toBe(3);
    expect(b.mode).toBe(4);
    expect((await sessions.get(a.id))?.mode).toBe(3);
    expect((await sessions.get(b.id))?.mode).toBe(4);
  });

  it.each([2, 5, 0, '4', null])('rejects invalid mode %j and writes nothing', async (m) => {
    await expect(sessions.create('X', m as never)).rejects.toThrow(/Invalid session mode/);
    expect(await sessions.list()).toEqual([]);
  });

  it('keeps the mode when renaming', async () => {
    const s = await sessions.create('A', 4);
    const renamed = await sessions.rename(s.id, 'B');
    expect(renamed.mode).toBe(4);
    expect((await sessions.get(s.id))?.mode).toBe(4);
  });

  it('lists 3-digit and 4-digit sessions together', async () => {
    await sessions.create('A', 3);
    await sessions.create('B', 4);
    expect((await sessions.list()).map((s) => s.mode).sort()).toEqual([3, 4]);
  });
});

describe('entryRepo follows the session mode', () => {
  it('mode 4 session accepts 4 digits with x24 / x48 only', async () => {
    const s = await sessions.create('4ตัว', 4);
    const e = await entries.add(s.id, '0012', 24);
    expect(e.number).toBe('0012');
    await entries.add(s.id, '2100', 48);
    await expect(entries.add(s.id, '123', 24)).rejects.toThrow(/Invalid number/);
    await expect(entries.add(s.id, '12345', 24)).rejects.toThrow(/Invalid number/);
    await expect(entries.add(s.id, '1234', 30)).rejects.toThrow(/Invalid column multiplier/);
    await expect(entries.add(s.id, '1234', 15)).rejects.toThrow(/Invalid column multiplier/);
    expect(await entries.listBySession(s.id)).toHaveLength(2);
  });

  it('mode 3 session still rejects 4 digits and x24 / x48', async () => {
    const s = await sessions.create('3ตัว', 3);
    await expect(entries.add(s.id, '1234', 30)).rejects.toThrow(/Invalid number/);
    await expect(entries.add(s.id, '123', 24)).rejects.toThrow(/Invalid column multiplier/);
    await expect(entries.add(s.id, '123', 48)).rejects.toThrow(/Invalid column multiplier/);
    await entries.add(s.id, '123', 30);
    expect(await entries.listBySession(s.id)).toHaveLength(1);
  });

  it('update validates against the mode of the entry session', async () => {
    const s4 = await sessions.create('4ตัว', 4);
    const e = await entries.add(s4.id, '1234', 24);
    const u = await entries.update(e.id, { number: '4321', columnMultiplier: 48 });
    expect(u.number).toBe('4321');
    expect(u.columnMultiplier).toBe(48);
    await expect(entries.update(e.id, { number: '123' })).rejects.toThrow(/Invalid number/);
    await expect(entries.update(e.id, { columnMultiplier: 30 })).rejects.toThrow(/Invalid column multiplier/);
    const same = (await entries.listBySession(s4.id))[0];
    expect(same.number).toBe('4321');

    const s3 = await sessions.create('3ตัว', 3);
    const e3 = await entries.add(s3.id, '123', 30);
    await expect(entries.update(e3.id, { number: '1234' })).rejects.toThrow(/Invalid number/);
    await expect(entries.update(e3.id, { columnMultiplier: 24 })).rejects.toThrow(/Invalid column multiplier/);
  });

  it('keeps two sessions of different modes separate', async () => {
    const s3 = await sessions.create('3ตัว', 3);
    const s4 = await sessions.create('4ตัว', 4);
    await entries.add(s3.id, '123', 30);
    await entries.add(s3.id, '321', 60);
    await entries.add(s4.id, '1234', 24);
    await entries.add(s4.id, '4321', 48);
    expect(calculate(await entries.listBySession(s3.id), 3).groups).toEqual([{ key: '123', total: 90, count: 2 }]);
    expect(calculate(await entries.listBySession(s4.id), 4).groups).toEqual([{ key: '1234', total: 72, count: 2 }]);
  });

  it('deleting a 4-digit session removes only its entries', async () => {
    const s3 = await sessions.create('3ตัว', 3);
    const s4 = await sessions.create('4ตัว', 4);
    await entries.add(s3.id, '123', 30);
    await entries.add(s4.id, '1234', 24);
    await sessions.remove(s4.id);
    expect(await entries.listBySession(s4.id)).toEqual([]);
    expect(await entries.listBySession(s3.id)).toHaveLength(1);
  });
});

describe('legacy check is mode aware', () => {
  it('does not flag x24 / x48 in a 4-digit session', async () => {
    const s = await sessions.create('4ตัว', 4);
    await entries.add(s.id, '1234', 24);
    await entries.add(s.id, '4321', 48);
    expect(await findLegacyEntries(db)).toEqual({ entries: 0, sessions: 0, multipliers: [] });
    expect(await removeLegacyEntries(db, clock)).toBe(0);
    expect(await entries.listBySession(s.id)).toHaveLength(2);
  });

  it('still flags removed columns in a 3-digit session, and x24 stored in it', async () => {
    const s = await sessions.create('3ตัว', 3);
    await db.entries.add({ sessionId: s.id, number: '123', columnMultiplier: 90, createdAt: 'x', updatedAt: 'x' });
    await db.entries.add({ sessionId: s.id, number: '123', columnMultiplier: 24, createdAt: 'x', updatedAt: 'x' });
    await entries.add(s.id, '123', 30);
    expect(await findLegacyEntries(db)).toEqual({ entries: 2, sessions: 1, multipliers: [24, 90] });
    expect(await removeLegacyEntries(db, clock)).toBe(2);
    expect(await entries.listBySession(s.id)).toHaveLength(1);
  });

  it('flags an x15 stored in a 4-digit session but keeps its x24 / x48', async () => {
    const s = await sessions.create('4ตัว', 4);
    await entries.add(s.id, '1234', 24);
    await db.entries.add({ sessionId: s.id, number: '1234', columnMultiplier: 15, createdAt: 'x', updatedAt: 'x' });
    expect(await findLegacyEntries(db)).toEqual({ entries: 1, sessions: 1, multipliers: [15] });
    expect(await removeLegacyEntries(db, clock)).toBe(1);
    expect((await entries.listBySession(s.id)).map((e) => e.columnMultiplier)).toEqual([24]);
  });
});

describe('Dexie v1 -> v2 migration', () => {
  const oldName = () => `tote-old-${counter++}`;

  async function seedVersion1(name: string): Promise<void> {
    const old = new Dexie(name);
    old.version(1).stores({
      sessions: '++id, name, updatedAt',
      entries: '++id, sessionId, columnMultiplier',
    });
    await old.open();
    const sid = (await old.table('sessions').add({ name: 'เก่า', createdAt: 'a', updatedAt: 'b' })) as number;
    await old.table('sessions').add({ name: 'เก่า 2', createdAt: 'c', updatedAt: 'd' });
    await old.table('entries').bulkAdd([
      { sessionId: sid, number: '007', columnMultiplier: 30, createdAt: 'a', updatedAt: 'a' },
      { sessionId: sid, number: '700', columnMultiplier: 60, createdAt: 'a', updatedAt: 'a' },
    ]);
    old.close();
  }

  it('gives every old session mode 3 and keeps all data', async () => {
    const name = oldName();
    await seedVersion1(name);
    const upgraded = new ToteDatabase(name);
    try {
      const all = await upgraded.sessions.orderBy('id').toArray();
      expect(all.map((s) => [s.name, s.mode])).toEqual([
        ['เก่า', 3],
        ['เก่า 2', 3],
      ]);
      expect(all[0].createdAt).toBe('a');
      expect(all[0].updatedAt).toBe('b');
      const es = await createEntryRepo(upgraded, clock).listBySession(all[0].id);
      expect(es.map((e) => [e.number, e.columnMultiplier])).toEqual([
        ['007', 30],
        ['700', 60],
      ]);
      expect(calculate(es, 3).groups).toEqual([{ key: '007', total: 90, count: 2 }]);
    } finally {
      upgraded.close();
      await Dexie.delete(name);
    }
  });

  it('works for new 4-digit sessions after the upgrade, next to old ones', async () => {
    const name = oldName();
    await seedVersion1(name);
    const upgraded = new ToteDatabase(name);
    try {
      const sRepo = createSessionRepo(upgraded, clock);
      const eRepo = createEntryRepo(upgraded, clock);
      const s4 = await sRepo.create('ใหม่ 4 ตัว', 4);
      await eRepo.add(s4.id, '1234', 24);
      expect((await sRepo.list()).map((s) => s.mode).sort()).toEqual([3, 3, 4]);
      expect(await findLegacyEntries(upgraded)).toEqual({ entries: 0, sessions: 0, multipliers: [] });
    } finally {
      upgraded.close();
      await Dexie.delete(name);
    }
  });

  it('does not change mode when a v2 database is opened again', async () => {
    const s = await sessions.create('4ตัว', 4);
    db.close();
    db = new ToteDatabase(dbName);
    expect((await db.sessions.get(s.id))?.mode).toBe(4);
  });
});