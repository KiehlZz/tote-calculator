// เทสต์ข้อ 9.3 ด้วย fake-indexeddb
// บรรทัดแรกต้องเป็น import 'fake-indexeddb/auto' เพราะ Dexie อ่านค่า indexedDB ตอนโหลด ถ้าสลับลำดับเทสต์จะพัง

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { calculate } from '../src/domain/calculation';
import { ToteDatabase } from '../src/db/db';
import { createEntryRepo } from '../src/db/entryRepo';
import { createSessionRepo } from '../src/db/sessionRepo';

let counter = 0;
let tick = 0;
let dbName: string;
let db: ToteDatabase;
let sessions: ReturnType<typeof createSessionRepo>;
let entries: ReturnType<typeof createEntryRepo>;

// deterministic clock: every call returns a later time
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();

beforeEach(() => {
  dbName = `tote-test-${counter++}`;
  tick = 0;
  db = new ToteDatabase(dbName);
  sessions = createSessionRepo(db, clock);
  entries = createEntryRepo(db, clock);
});

afterEach(async () => {
  db.close();
  await Dexie.delete(dbName);
});

describe('sessionRepo', () => {
  it('creates a session with a trimmed name and matching timestamps', async () => {
    const s = await sessions.create('  รอบเช้า  ');
    expect(typeof s.id).toBe('number');
    expect(s.name).toBe('รอบเช้า');
    expect(s.createdAt).toBe(s.updatedAt);
    expect(await sessions.get(s.id)).toEqual(s);
  });

  it.each(['', '   '])('rejects blank session name %j', async (name) => {
    await expect(sessions.create(name)).rejects.toThrow(/name/i);
  });

  it('lists sessions by updatedAt, newest first', async () => {
    const a = await sessions.create('A');
    await sessions.create('B');
    expect((await sessions.list()).map((s) => s.name)).toEqual(['B', 'A']);
    await entries.add(a.id, '123', 30);
    expect((await sessions.list()).map((s) => s.name)).toEqual(['A', 'B']);
  });

  it('returns undefined for an unknown session', async () => {
    expect(await sessions.get(999)).toBeUndefined();
  });

  it('renames a session and updates updatedAt', async () => {
    const s = await sessions.create('old');
    const renamed = await sessions.rename(s.id, '  new  ');
    expect(renamed.name).toBe('new');
    expect(renamed.createdAt).toBe(s.createdAt);
    expect(renamed.updatedAt > s.updatedAt).toBe(true);
  });

  it('throws when renaming an unknown session', async () => {
    await expect(sessions.rename(999, 'x')).rejects.toThrow(/not found/);
  });

  it('throws when renaming to a blank name', async () => {
    const s = await sessions.create('keep');
    await expect(sessions.rename(s.id, '  ')).rejects.toThrow(/name/i);
    expect((await sessions.get(s.id))?.name).toBe('keep');
  });

  it('removes a session together with its entries but not other sessions', async () => {
    const a = await sessions.create('A');
    const b = await sessions.create('B');
    await entries.add(a.id, '123', 30);
    await entries.add(a.id, '456', 60);
    await entries.add(b.id, '789', 30);

    await sessions.remove(a.id);

    expect(await sessions.get(a.id)).toBeUndefined();
    expect(await entries.listBySession(a.id)).toEqual([]);
    expect((await entries.listBySession(b.id)).map((x) => x.number)).toEqual(['789']);
    expect(await db.entries.count()).toBe(1);
  });

  it('throws when removing an unknown session', async () => {
    await expect(sessions.remove(999)).rejects.toThrow(/not found/);
  });
});

describe('entryRepo', () => {
  it('adds an entry and returns it with an id and a string number', async () => {
    const s = await sessions.create('S');
    const entry = await entries.add(s.id, '123', 30);
    expect(typeof entry.id).toBe('number');
    expect(entry).toMatchObject({ sessionId: s.id, number: '123', columnMultiplier: 30 });
  });

  it('stores duplicates as separate rows: 123 five times in x30 = 150', async () => {
    const s = await sessions.create('S');
    for (let i = 0; i < 5; i++) {
      await entries.add(s.id, '123', 30);
    }
    const list = await entries.listBySession(s.id);
    expect(list).toHaveLength(5);
    expect(calculate(list).groups).toEqual([{ key: '123', total: 150, count: 5 }]);
  });

  it('keeps leading zeros', async () => {
    const s = await sessions.create('S');
    await entries.add(s.id, '007', 60);
    const [loaded] = await entries.listBySession(s.id);
    expect(loaded.number).toBe('007');
    expect(typeof loaded.number).toBe('string');
  });

  it('lists entries in insertion order', async () => {
    const s = await sessions.create('S');
    await entries.add(s.id, '321', 30);
    await entries.add(s.id, '123', 60);
    await entries.add(s.id, '555', 30);
    const list = await entries.listBySession(s.id);
    expect(list.map((x) => x.number)).toEqual(['321', '123', '555']);
  });

  it('does not mix entries between sessions', async () => {
    const a = await sessions.create('A');
    const b = await sessions.create('B');
    await entries.add(a.id, '111', 30);
    await entries.add(b.id, '222', 60);
    expect((await entries.listBySession(a.id)).map((x) => x.number)).toEqual(['111']);
    expect((await entries.listBySession(b.id)).map((x) => x.number)).toEqual(['222']);
  });

  it.each(['12', 'abc', '1234'])('rejects invalid number %s and writes nothing', async (value) => {
    const s = await sessions.create('S');
    await expect(entries.add(s.id, value, 30)).rejects.toThrow(/Invalid number/);
    expect(await entries.listBySession(s.id)).toEqual([]);
  });

  it('rejects a multiplier that is not one of the six columns (x90)', async () => {
    const s = await sessions.create('S');
    await expect(entries.add(s.id, '123', 90)).rejects.toThrow(/Invalid column multiplier/);
    expect(await entries.listBySession(s.id)).toEqual([]);
  });

  it('rejects adding to an unknown session', async () => {
    await expect(entries.add(999, '123', 30)).rejects.toThrow(/not found/);
  });

  it('updates number and multiplier and keeps id and createdAt', async () => {
    const s = await sessions.create('S');
    const entry = await entries.add(s.id, '123', 30);
    const updated = await entries.update(entry.id, { number: '007', columnMultiplier: 120 });
    expect(updated).toMatchObject({ id: entry.id, number: '007', columnMultiplier: 120 });
    expect(updated.createdAt).toBe(entry.createdAt);
    expect(updated.updatedAt > entry.updatedAt).toBe(true);
    expect(await entries.listBySession(s.id)).toEqual([updated]);
  });

  it('rejects an invalid update and leaves the entry unchanged', async () => {
    const s = await sessions.create('S');
    const entry = await entries.add(s.id, '123', 30);
    await expect(entries.update(entry.id, { number: '12' })).rejects.toThrow(/Invalid number/);
    expect(await entries.listBySession(s.id)).toEqual([entry]);
  });

  it('throws when updating an unknown entry', async () => {
    await expect(entries.update(999, { number: '123' })).rejects.toThrow(/not found/);
  });

  it('removes only the chosen entry', async () => {
    const s = await sessions.create('S');
    const first = await entries.add(s.id, '123', 30);
    await entries.add(s.id, '123', 30);
    await entries.remove(first.id);
    const list = await entries.listBySession(s.id);
    expect(list).toHaveLength(1);
    expect(list[0].id).not.toBe(first.id);
  });

  it('throws when removing an unknown entry', async () => {
    await expect(entries.remove(999)).rejects.toThrow(/not found/);
  });

  it('updates the session updatedAt on add, update and remove', async () => {
    const s = await sessions.create('S');
    const entry = await entries.add(s.id, '123', 30);
    const afterAdd = (await sessions.get(s.id))!.updatedAt;
    expect(afterAdd > s.updatedAt).toBe(true);

    await entries.update(entry.id, { number: '321' });
    const afterUpdate = (await sessions.get(s.id))!.updatedAt;
    expect(afterUpdate > afterAdd).toBe(true);

    await entries.remove(entry.id);
    const afterRemove = (await sessions.get(s.id))!.updatedAt;
    expect(afterRemove > afterUpdate).toBe(true);
  });

  it('does not touch the session when an add fails validation', async () => {
    const s = await sessions.create('S');
    await expect(entries.add(s.id, '12', 30)).rejects.toThrow();
    expect((await sessions.get(s.id))!.updatedAt).toBe(s.updatedAt);
  });

  it('still reads the data after the database is closed and reopened', async () => {
    const s = await sessions.create('S');
    await entries.add(s.id, '007', 30);
    await entries.add(s.id, '007', 30);
    db.close();

    const reopened = new ToteDatabase(dbName);
    const loaded = await createEntryRepo(reopened, clock).listBySession(s.id);
    expect(loaded.map((x) => x.number)).toEqual(['007', '007']);
    reopened.close();
  });
});