// exportBackup, parseBackup (ตรวจรูปแบบก่อนแตะฐานข้อมูล), importBackup
// โหมดของชุด: ไฟล์สำรองใส่ "mode": 4 เฉพาะชุด 4 ตัว ชุด 3 ตัวไม่มีฟิลด์ mode (ไฟล์เก่าจึงยังใช้ได้ และไฟล์ที่มีแต่ชุด 3 ตัวหน้าตาเหมือนเดิมทุกอย่าง)

import { isValidMultiplier, isValidNumber } from '../domain/validators';
import { systemClock, type ToteDatabase } from './db';
import { sessionMode, type Clock } from './types';
import { DEFAULT_MODE, getColumns, isValidMode, type Mode } from '../domain/columns';

export const BACKUP_APP_ID = 'tote-calculator';
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupEntry {
  columnMultiplier: number;
  number: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSession {
  name: string;
  createdAt: string;
  updatedAt: string;
  mode?: Mode; // มีเฉพาะชุด 4 ตัว (ไม่มี = 3 ตัว)
  entries: BackupEntry[];
}

export interface BackupFile {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  sessions: BackupSession[];
}

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  sessions: number;
  entries: number;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

// exactly the format produced by Date.toISOString(), so string order = time order
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new BackupError(`${path}: ${message}`);
}

function validateEntry(raw: unknown, path: string, mode: Mode): BackupEntry {
  if (!isRecord(raw)) fail(path, 'must be an object');
  const number = raw.number;
  const columnMultiplier = raw.columnMultiplier;
  const createdAt = raw.createdAt;
  const updatedAt = raw.updatedAt;
  if (!isValidNumber(number, mode)) fail(`${path}.number`, `invalid number ${JSON.stringify(number)} (expected ${mode} digits)`);
  if (typeof columnMultiplier !== 'number' || !isValidMultiplier(columnMultiplier, mode)) {
    fail(
      `${path}.columnMultiplier`,
      `invalid multiplier ${JSON.stringify(columnMultiplier)} (allowed: ${getColumns(mode).join(', ')})`,
    );
  }
  if (!isIso(createdAt)) fail(`${path}.createdAt`, 'must be an ISO timestamp');
  if (!isIso(updatedAt)) fail(`${path}.updatedAt`, 'must be an ISO timestamp');
  return { columnMultiplier, number, createdAt, updatedAt };
}

function validateSession(raw: unknown, path: string): BackupSession {
  if (!isRecord(raw)) fail(path, 'must be an object');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const createdAt = raw.createdAt;
  const updatedAt = raw.updatedAt;
  const rawEntries = raw.entries;
  if (name === '') fail(`${path}.name`, 'must be a non-empty string');
  if (!isIso(createdAt)) fail(`${path}.createdAt`, 'must be an ISO timestamp');
  if (!isIso(updatedAt)) fail(`${path}.updatedAt`, 'must be an ISO timestamp');
  // ไม่มี mode = ไฟล์เก่า = ชุด 3 ตัว; ถ้ามีต้องเป็น 3 หรือ 4 เท่านั้น
  const rawMode = raw.mode;
  if (rawMode !== undefined && !isValidMode(rawMode)) {
    fail(`${path}.mode`, `invalid mode ${JSON.stringify(rawMode)} (allowed: 3, 4)`);
  }
  const mode: Mode = rawMode ?? DEFAULT_MODE;
  if (!Array.isArray(rawEntries)) fail(`${path}.entries`, 'must be an array');
  const entries = rawEntries.map((entry, i) => validateEntry(entry, `${path}.entries[${i}]`, mode));
  return { name, createdAt, updatedAt, ...(mode === 4 ? { mode } : {}), entries };
}

// Checks the whole structure and returns a clean copy (unknown fields dropped).
export function validateBackup(value: unknown): BackupFile {
  if (!isRecord(value)) fail('backup', 'must be a JSON object');
  const exportedAt = value.exportedAt;
  const rawSessions = value.sessions;
  if (value.app !== BACKUP_APP_ID) fail('app', 'not a tote-calculator backup');
  if (value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    fail('schemaVersion', `unsupported version ${JSON.stringify(value.schemaVersion)}`);
  }
  if (!isIso(exportedAt)) fail('exportedAt', 'must be an ISO timestamp');
  if (!Array.isArray(rawSessions)) fail('sessions', 'must be an array');
  const sessions = rawSessions.map((s, i) => validateSession(s, `sessions[${i}]`));
  return { app: BACKUP_APP_ID, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt, sessions };
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new BackupError('backup: not valid JSON');
  }
  return validateBackup(data);
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

// local date, Gregorian year, e.g. tote-backup-2026-11-05.json
export function backupFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `tote-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export async function exportBackup(db: ToteDatabase, clock: Clock = systemClock): Promise<BackupFile> {
  const exportedAt = clock();
  // one read transaction = a consistent snapshot of both tables
  return db.transaction('r', db.sessions, db.entries, async () => {
    const sessions = await db.sessions.orderBy('id').toArray();
    const entries = await db.entries.orderBy('id').toArray();

    const bySession = new Map<number, BackupEntry[]>();
    for (const e of entries) {
      const list = bySession.get(e.sessionId) ?? [];
      list.push({
        columnMultiplier: e.columnMultiplier,
        number: e.number,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      });
      bySession.set(e.sessionId, list);
    }

    return {
      app: BACKUP_APP_ID,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt,
      sessions: sessions.map((s) => ({
        name: s.name,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        ...(sessionMode(s) === 4 ? { mode: 4 as const } : {}),
        entries: bySession.get(s.id) ?? [],
      })),
    };
  });
}

export async function importBackup(
  db: ToteDatabase,
  backup: unknown,
  mode: ImportMode,
): Promise<ImportResult> {
  if (mode !== 'merge' && mode !== 'replace') {
    throw new BackupError(`mode: unknown import mode ${JSON.stringify(mode)}`);
  }
  const valid = validateBackup(backup); // never trust the caller

  return db.transaction('rw', db.sessions, db.entries, async () => {
    if (mode === 'replace') {
      await db.entries.clear();
      await db.sessions.clear();
    }

    let entryCount = 0;
    for (const s of valid.sessions) {
      const sessionId = await db.sessions.add({
        name: s.name,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        mode: s.mode ?? DEFAULT_MODE,
      });
      if (s.entries.length > 0) {
        await db.entries.bulkAdd(s.entries.map((e) => ({ sessionId, ...e })));
      }
      entryCount += s.entries.length;
    }

    return { sessions: valid.sessions.length, entries: entryCount };
  });
}