// เทสต์ Phase 10.4: ไฟล์สำรองเก็บโหมดของชุด (3 ตัว / 4 ตัว), ไฟล์เก่านำเข้าได้, ตรวจเลขและตัวคูณตามโหมด
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BackupError,
  exportBackup,
  importBackup,
  parseBackup,
  serializeBackup,
  type BackupFile,
} from '../src/db/backup';
import { ToteDatabase } from '../src/db/db';
import { createEntryRepo } from '../src/db/entryRepo';
import { createSessionRepo } from '../src/db/sessionRepo';
import { calculate } from '../src/domain/calculation';
import { makeSampleBackup } from '../scripts/sample-backup.mjs';

let counter = 0;
let tick = 0;
let names: string[] = [];
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
const NOW = () => '2026-11-05T10:00:00.000Z';

function openDb(): ToteDatabase {
  const name = `tote-bkmode-${counter++}`;
  names.push(name);
  return new ToteDatabase(name);
}

let db: ToteDatabase;
beforeEach(() => {
  tick = 0;
  db = openDb();
});
afterEach(async () => {
  db.close();
  for (const n of names) await Dexie.delete(n);
  names = [];
});

const T = '2026-11-05T09:00:00.000Z';
const entry = (number: string, columnMultiplier: number) => ({
  number,
  columnMultiplier,
  createdAt: T,
  updatedAt: T,
});
const file = (sessions: unknown[]): unknown => ({
  app: 'tote-calculator',
  schemaVersion: 1,
  exportedAt: T,
  sessions,
});
const session = (extra: Record<string, unknown>, entries: unknown[] = []) => ({
  name: 'ชุด',
  createdAt: T,
  updatedAt: T,
  ...extra,
  entries,
});

async function seedMixed() {
  const sRepo = createSessionRepo(db, clock);
  const eRepo = createEntryRepo(db, clock);
  const s3 = await sRepo.create('สามตัว', 3);
  const s4 = await sRepo.create('สี่ตัว', 4);
  const empty4 = await sRepo.create('สี่ตัวว่าง', 4);
  await eRepo.add(s3.id, '007', 30);
  await eRepo.add(s3.id, '700', 60);
  await eRepo.add(s4.id, '0012', 24);
  await eRepo.add(s4.id, '2100', 48);
  await eRepo.add(s4.id, '1234', 24);
  return { s3, s4, empty4 };
}

describe('exportBackup with modes', () => {
  it('writes "mode": 4 only for 4-digit sessions; 3-digit sessions look exactly like before', async () => {
    await seedMixed();
    const out = await exportBackup(db, NOW);
    expect(out.schemaVersion).toBe(1);
    expect(out.sessions.map((s) => s.name)).toEqual(['สามตัว', 'สี่ตัว', 'สี่ตัวว่าง']);
    expect('mode' in out.sessions[0]).toBe(false);
    expect(out.sessions[1].mode).toBe(4);
    expect(out.sessions[2].mode).toBe(4);
    expect(out.sessions[2].entries).toEqual([]);
  });

  it('a database with only 3-digit sessions exports no mode field at all', async () => {
    const sRepo = createSessionRepo(db, clock);
    const eRepo = createEntryRepo(db, clock);
    const s = await sRepo.create('A');
    await eRepo.add(s.id, '123', 30);
    const text = serializeBackup(await exportBackup(db, NOW));
    expect(text).not.toContain('"mode"');
  });

  it('treats a stored session without a mode (very old data) as 3-digit', async () => {
    await db.sessions.add({ name: 'เก่ามาก', createdAt: T, updatedAt: T } as never);
    const out = await exportBackup(db, NOW);
    expect('mode' in out.sessions[0]).toBe(false);
  });
});

describe('parseBackup with modes', () => {
  it('an old file with no mode loads as 3-digit', () => {
    const parsed = parseBackup(JSON.stringify(file([session({}, [entry('007', 30), entry('700', 60)])])));
    expect(parsed.sessions[0].mode).toBeUndefined();
    expect(parsed.sessions[0].entries).toHaveLength(2);
  });

  it('the old sample backup generator output still loads', () => {
    const parsed = parseBackup(JSON.stringify(makeSampleBackup(300)));
    expect(parsed.sessions[0].entries).toHaveLength(300);
    expect(parsed.sessions[0].mode).toBeUndefined();
  });

  it('accepts a 4-digit session with 4-digit numbers, leading zeros, x24 and x48', () => {
    const parsed = parseBackup(
      JSON.stringify(file([session({ mode: 4 }, [entry('0012', 24), entry('1234', 48)])])),
    );
    expect(parsed.sessions[0].mode).toBe(4);
    expect(parsed.sessions[0].entries.map((e) => e.number)).toEqual(['0012', '1234']);
  });

  it('accepts an empty 4-digit session', () => {
    expect(parseBackup(JSON.stringify(file([session({ mode: 4 })]))).sessions[0].mode).toBe(4);
  });

  it('an explicit mode 3 is the same as no mode', () => {
    const parsed = parseBackup(JSON.stringify(file([session({ mode: 3 }, [entry('123', 30)])])));
    expect(parsed.sessions[0].mode).toBeUndefined();
  });

  it.each([5, 2, 0, '4', null, true, [4], {}])('rejects invalid mode %j', (mode) => {
    expect(() => parseBackup(JSON.stringify(file([session({ mode }, [])])))).toThrow(/sessions\[0\]\.mode/);
  });

  it('rejects a 3-digit number inside a 4-digit session and says where', () => {
    const text = JSON.stringify(file([session({ mode: 4 }, [entry('1234', 24), entry('123', 24)])]));
    expect(() => parseBackup(text)).toThrow(/sessions\[0\]\.entries\[1\]\.number/);
  });

  it('rejects x30 and x15 inside a 4-digit session', () => {
    expect(() => parseBackup(JSON.stringify(file([session({ mode: 4 }, [entry('1234', 30)])])))).toThrow(
      /columnMultiplier.*allowed: 24, 48/,
    );
    expect(() => parseBackup(JSON.stringify(file([session({ mode: 4 }, [entry('1234', 15)])])))).toThrow(
      BackupError,
    );
  });

  it('rejects 4-digit numbers and x24 / x48 inside a 3-digit session (with or without mode)', () => {
    expect(() => parseBackup(JSON.stringify(file([session({}, [entry('1234', 30)])])))).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify(file([session({ mode: 3 }, [entry('1234', 30)])])))).toThrow(
      BackupError,
    );
    expect(() => parseBackup(JSON.stringify(file([session({}, [entry('123', 24)])])))).toThrow(/allowed: 15, 30/);
    expect(() => parseBackup(JSON.stringify(file([session({}, [entry('123', 48)])])))).toThrow(BackupError);
  });

  it('one bad session rejects the whole file', () => {
    const text = JSON.stringify(
      file([session({ mode: 4 }, [entry('1234', 24)]), session({ mode: 4 }, [entry('12', 24)])]),
    );
    expect(() => parseBackup(text)).toThrow(/sessions\[1\]\.entries\[0\]\.number/);
  });

  it('schemaVersion is still 1 only', () => {
    const bad = { ...(file([]) as object), schemaVersion: 2 };
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/schemaVersion/);
  });
});

describe('importBackup with modes', () => {
  it('imports 4-digit sessions with their mode and original timestamps', async () => {
    const data = parseBackup(
      JSON.stringify(
        file([
          session({ name: 'สี่', mode: 4, createdAt: '2026-01-02T03:04:05.000Z', updatedAt: '2026-02-03T04:05:06.000Z' }, [
            entry('1234', 24),
            entry('4321', 48),
          ]),
          session({ name: 'สาม' }, [entry('123', 30)]),
        ]),
      ),
    );
    expect(await importBackup(db, data, 'merge')).toEqual({ sessions: 2, entries: 3 });
    const all = await db.sessions.orderBy('id').toArray();
    expect(all.map((s) => [s.name, s.mode])).toEqual([
      ['สี่', 4],
      ['สาม', 3],
    ]);
    expect(all[0].createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(all[0].updatedAt).toBe('2026-02-03T04:05:06.000Z');
    const es = await createEntryRepo(db, clock).listBySession(all[0].id);
    expect(calculate(es, 4).groups).toEqual([{ key: '1234', total: 72, count: 2 }]);
  });

  it('an old file imports as 3-digit sessions', async () => {
    await importBackup(db, makeSampleBackup(50), 'merge');
    const all = await db.sessions.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].mode).toBe(3);
  });

  it('never trusts the caller: a bad 4-digit entry throws and writes nothing', async () => {
    const bad = file([session({ mode: 4 }, [entry('1234', 24), entry('123', 24)])]);
    await expect(importBackup(db, bad, 'merge')).rejects.toThrow(BackupError);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.entries.count()).toBe(0);
  });

  it('merge keeps the modes of existing sessions', async () => {
    const { s3, s4 } = await seedMixed();
    await importBackup(db, parseBackup(JSON.stringify(file([session({ name: 'ใหม่ 4', mode: 4 }, [entry('9999', 48)])]))), 'merge');
    const all = await db.sessions.orderBy('id').toArray();
    expect(all.map((s) => s.mode)).toEqual([3, 4, 4, 4]);
    expect(all[0].id).toBe(s3.id);
    expect(all[1].id).toBe(s4.id);
  });

  it('replace removes everything, including 4-digit sessions', async () => {
    await seedMixed();
    await importBackup(db, parseBackup(JSON.stringify(file([session({ name: 'แทน' }, [entry('123', 30)])]))), 'replace');
    const all = await db.sessions.toArray();
    expect(all.map((s) => [s.name, s.mode])).toEqual([['แทน', 3]]);
    expect(await db.entries.count()).toBe(1);
  });
});

describe('round trip', () => {
  it('backs up a mixed database and restores it into a fresh one with identical modes and results', async () => {
    const { s3, s4 } = await seedMixed();
    const before3 = calculate(await createEntryRepo(db, clock).listBySession(s3.id), 3);
    const before4 = calculate(await createEntryRepo(db, clock).listBySession(s4.id), 4);

    const text = serializeBackup(await exportBackup(db, NOW));
    const other = openDb();
    try {
      const result = await importBackup(other, parseBackup(text), 'replace');
      expect(result).toEqual({ sessions: 3, entries: 5 });
      const sessions = await other.sessions.orderBy('id').toArray();
      expect(sessions.map((s) => [s.name, s.mode])).toEqual([
        ['สามตัว', 3],
        ['สี่ตัว', 4],
        ['สี่ตัวว่าง', 4],
      ]);
      const eRepo = createEntryRepo(other, clock);
      expect(calculate(await eRepo.listBySession(sessions[0].id), 3)).toEqual(before3);
      expect(calculate(await eRepo.listBySession(sessions[1].id), 4)).toEqual(before4);
      expect(before4.groups.map((g) => [g.key, g.total, g.count])).toEqual([
        ['0012', 72, 2],
        ['1234', 24, 1],
      ]);
      // exporting again gives the same sessions
      const again = await exportBackup(other, NOW);
      expect(again.sessions).toEqual((await exportBackup(db, NOW)).sessions);
    } finally {
      other.close();
    }
  });

  it('a restored 4-digit session still accepts new 4-digit entries and refuses 3-digit ones', async () => {
    await importBackup(db, parseBackup(JSON.stringify(file([session({ mode: 4 }, [entry('1234', 24)])]))), 'merge');
    const [s] = await db.sessions.toArray();
    const eRepo = createEntryRepo(db, clock);
    await eRepo.add(s.id, '5678', 48);
    await expect(eRepo.add(s.id, '123', 24)).rejects.toThrow(/Invalid number/);
    expect(await eRepo.listBySession(s.id)).toHaveLength(2);
  });
});