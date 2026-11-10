// เทสต์ export, import, ไฟล์ผิดรูปแบบ, ข้อมูลเดิมไม่เสียหายเมื่อ import ล้มเหลว

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BackupError,
  backupFileName,
  exportBackup,
  importBackup,
  parseBackup,
  serializeBackup,
} from '../src/db/backup';
import { ToteDatabase } from '../src/db/db';
import { createEntryRepo } from '../src/db/entryRepo';
import { createSessionRepo } from '../src/db/sessionRepo';
import { calculate } from '../src/domain/calculation';

let counter = 0;
let tick = 0;
let dbName: string;
let db: ToteDatabase;
let sessions: ReturnType<typeof createSessionRepo>;
let entries: ReturnType<typeof createEntryRepo>;

const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
const FIXED_NOW = '2026-11-05T10:00:00.000Z';

beforeEach(() => {
  dbName = `tote-backup-test-${counter++}`;
  tick = 0;
  db = new ToteDatabase(dbName);
  sessions = createSessionRepo(db, clock);
  entries = createEntryRepo(db, clock);
});

afterEach(async () => {
  vi.restoreAllMocks();
  db.close();
  await Dexie.delete(dbName);
});

// a fresh object every call so tests can mutate it freely
const makeBackup = () => ({
  app: 'tote-calculator',
  schemaVersion: 1,
  exportedAt: FIXED_NOW,
  sessions: [
    {
      name: 'รอบเช้า',
      createdAt: '2026-11-01T01:00:00.000Z',
      updatedAt: '2026-11-02T01:00:00.000Z',
      entries: [
        { columnMultiplier: 30, number: '007', createdAt: '2026-11-01T01:00:00.000Z', updatedAt: '2026-11-01T01:00:00.000Z' },
        { columnMultiplier: 60, number: '123', createdAt: '2026-11-01T01:01:00.000Z', updatedAt: '2026-11-01T01:01:00.000Z' },
      ],
    },
    {
      name: 'รอบบ่าย',
      createdAt: '2026-11-03T01:00:00.000Z',
      updatedAt: '2026-11-03T02:00:00.000Z',
      entries: [
        { columnMultiplier: 30, number: '555', createdAt: '2026-11-03T01:00:00.000Z', updatedAt: '2026-11-03T01:00:00.000Z' },
      ],
    },
  ],
});

describe('exportBackup', () => {
  it('exports nested sessions and entries in order, without database ids', async () => {
    const a = await sessions.create('A');
    const b = await sessions.create('B');
    await entries.add(a.id, '007', 30);
    await entries.add(a.id, '007', 30);
    await entries.add(b.id, '123', 60);

    const exported = await exportBackup(db, () => FIXED_NOW);

    expect(exported.app).toBe('tote-calculator');
    expect(exported.schemaVersion).toBe(1);
    expect(exported.exportedAt).toBe(FIXED_NOW);
    expect(exported.sessions.map((s) => s.name)).toEqual(['A', 'B']);
    expect(exported.sessions[0].entries.map((e) => e.number)).toEqual(['007', '007']);
    expect(exported.sessions[1].entries.map((e) => e.number)).toEqual(['123']);
    expect(Object.keys(exported.sessions[0]).sort()).toEqual(['createdAt', 'entries', 'name', 'updatedAt']);
    expect(Object.keys(exported.sessions[0].entries[0]).sort()).toEqual([
      'columnMultiplier',
      'createdAt',
      'number',
      'updatedAt',
    ]);
  });

  it('exports an empty database as a backup with no sessions', async () => {
    const exported = await exportBackup(db, () => FIXED_NOW);
    expect(exported.sessions).toEqual([]);
  });

  it('survives serialize and parse unchanged (round trip)', async () => {
    const a = await sessions.create('A');
    await entries.add(a.id, '007', 30);
    await entries.add(a.id, '123', 180);
    const exported = await exportBackup(db, () => FIXED_NOW);
    expect(parseBackup(serializeBackup(exported))).toEqual(exported);
  });
});

describe('parseBackup', () => {
  it('accepts a valid backup, trims names and drops unknown fields', () => {
    const b = makeBackup() as any;
    b.sessions[0].name = '  รอบเช้า  ';
    b.sessions[0].extra = 'ignored';
    b.sessions[0].entries[0].sessionId = 99;
    const parsed = parseBackup(JSON.stringify(b)) as any;
    expect(parsed.sessions[0].name).toBe('รอบเช้า');
    expect(parsed.sessions[0].extra).toBeUndefined();
    expect(parsed.sessions[0].entries[0].sessionId).toBeUndefined();
    expect(parsed.sessions[0].entries[0].number).toBe('007');
  });

  it('accepts a file that starts with a UTF-8 BOM', () => {
    const parsed = parseBackup('\uFEFF' + JSON.stringify(makeBackup()));
    expect(parsed.sessions).toHaveLength(2);
  });

  it.each(['not json', '[]', 'null', '42'])('rejects non-backup text %s', (text) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
  });

  const bad: [string, (b: any) => void][] = [
    ['wrong app id', (b) => { b.app = 'other'; }],
    ['unsupported schemaVersion', (b) => { b.schemaVersion = 2; }],
    ['missing exportedAt', (b) => { delete b.exportedAt; }],
    ['sessions not an array', (b) => { b.sessions = {}; }],
    ['blank session name', (b) => { b.sessions[0].name = '  '; }],
    ['entries missing', (b) => { delete b.sessions[0].entries; }],
    ['invalid number', (b) => { b.sessions[0].entries[0].number = '12'; }],
    ['numeric number (not a string)', (b) => { b.sessions[0].entries[0].number = 7; }],
    ['multiplier x90', (b) => { b.sessions[0].entries[0].columnMultiplier = 90; }],
    ['bad timestamp', (b) => { b.sessions[0].updatedAt = 'yesterday'; }],
  ];

  it.each(bad)('rejects: %s', (_label, mutate) => {
    const b = makeBackup();
    mutate(b);
    expect(() => parseBackup(JSON.stringify(b))).toThrow(BackupError);
  });
});

  it('names the allowed columns when a multiplier is rejected', () => {
    const b = makeBackup();
    b.sessions[0].entries[0].columnMultiplier = 210;
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/allowed: 15, 30, 60, 120, 150, 180/);
  });

describe('importBackup', () => {
  it('merge adds the sessions and leaves existing data untouched', async () => {
    const existing = await sessions.create('Existing');
    await entries.add(existing.id, '111', 30);

    await importBackup(db, makeBackup(), 'merge');

    const names = (await sessions.list()).map((s) => s.name).sort();
    expect(names).toEqual(['Existing', 'รอบเช้า', 'รอบบ่าย'].sort());
    expect((await entries.listBySession(existing.id)).map((e) => e.number)).toEqual(['111']);
  });

  it('returns how many sessions and entries were imported', async () => {
    expect(await importBackup(db, makeBackup(), 'merge')).toEqual({ sessions: 2, entries: 3 });
  });

  it('keeps duplicate numbers and leading zeros', async () => {
    const b = makeBackup();
    b.sessions = [
      {
        name: 'dup',
        createdAt: '2026-11-01T01:00:00.000Z',
        updatedAt: '2026-11-01T01:00:00.000Z',
        entries: [
          ...Array.from({ length: 5 }, () => ({
            columnMultiplier: 30,
            number: '123',
            createdAt: '2026-11-01T01:00:00.000Z',
            updatedAt: '2026-11-01T01:00:00.000Z',
          })),
          { columnMultiplier: 60, number: '007', createdAt: '2026-11-01T01:00:00.000Z', updatedAt: '2026-11-01T01:00:00.000Z' },
        ],
      },
    ];
    await importBackup(db, b, 'merge');

    const [session] = await sessions.list();
    const list = await entries.listBySession(session.id);
    expect(list.map((e) => e.number)).toEqual(['123', '123', '123', '123', '123', '007']);
    expect(calculate(list).groups).toEqual([
      { key: '123', total: 150, count: 5 },
      { key: '007', total: 60, count: 1 },
    ]);
  });

  it('keeps the original timestamps, so Home ordering matches the backup', async () => {
    const existing = await sessions.create('Existing');
    const b = makeBackup();
    b.sessions = [
      { name: 'Old', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', entries: [] },
      { name: 'Future', createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z', entries: [] },
    ];
    await importBackup(db, b, 'merge');

    const list = await sessions.list();
    expect(list.map((s) => s.name)).toEqual(['Future', existing.name, 'Old']);
    expect(list[0].createdAt).toBe('2030-01-01T00:00:00.000Z');
  });

  it('allows duplicate session names (the same file imported twice)', async () => {
    await importBackup(db, makeBackup(), 'merge');
    await importBackup(db, makeBackup(), 'merge');
    const list = await sessions.list();
    expect(list.filter((s) => s.name === 'รอบเช้า')).toHaveLength(2);
    expect(list).toHaveLength(4);
  });

  it('replace removes existing data and imports only the backup', async () => {
    const old1 = await sessions.create('Old1');
    const old2 = await sessions.create('Old2');
    await entries.add(old1.id, '111', 30);
    await entries.add(old2.id, '222', 60);

    const b = makeBackup();
    b.sessions = [b.sessions[0]];
    await importBackup(db, b, 'replace');

    expect((await sessions.list()).map((s) => s.name)).toEqual(['รอบเช้า']);
    expect(await db.entries.count()).toBe(2);
    expect((await db.entries.toArray()).map((e) => e.number).sort()).toEqual(['007', '123']);
  });

  it.each(['merge', 'replace'] as const)(
    'rejects an invalid backup in %s mode and leaves existing data untouched',
    async (mode) => {
      const existing = await sessions.create('Existing');
      await entries.add(existing.id, '111', 30);

      const b = makeBackup();
      b.sessions[1].entries[0].number = '12';
      await expect(importBackup(db, b, mode)).rejects.toThrow(BackupError);

      expect(await db.sessions.count()).toBe(1);
      expect(await db.entries.count()).toBe(1);
    },
  );

  it('rejects an unknown import mode', async () => {
    await expect(importBackup(db, makeBackup(), 'wipe' as never)).rejects.toThrow(/mode/);
  });

  it('rolls back a replace import if writing fails midway', async () => {
    const existing = await sessions.create('Existing');
    await entries.add(existing.id, '111', 30);

    vi.spyOn(db.entries, 'bulkAdd').mockRejectedValue(new Error('boom'));
    await expect(importBackup(db, makeBackup(), 'replace')).rejects.toThrow('boom');
    vi.restoreAllMocks();

    expect((await sessions.list()).map((s) => s.name)).toEqual(['Existing']);
    expect((await db.entries.toArray()).map((e) => e.number)).toEqual(['111']);
  });

    it('restores exactly what was exported (export, file, import into an empty database)', async () => {
    const a = await sessions.create('A');
    const b = await sessions.create('B');
    await entries.add(a.id, '007', 30);
    await entries.add(a.id, '007', 30);
    await entries.add(a.id, '123', 180);
    await entries.add(b.id, '555', 60);

    const exported = await exportBackup(db, () => FIXED_NOW);
    const text = serializeBackup(exported);

    const otherName = `${dbName}-restore`;
    const other = new ToteDatabase(otherName);
    try {
      await importBackup(other, parseBackup(text), 'replace');
      expect(await exportBackup(other, () => FIXED_NOW)).toEqual(exported);
    } finally {
      other.close();
      await Dexie.delete(otherName);
    }
  });
});

describe('backupFileName', () => {
  it('uses the local date with a Gregorian year', () => {
    expect(backupFileName(new Date(2026, 10, 5, 23, 59))).toBe('tote-backup-2026-11-05.json');
    expect(backupFileName(new Date(2026, 0, 9, 0, 1))).toBe('tote-backup-2026-01-09.json');
  });
});