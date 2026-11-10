// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToteDatabase } from '../src/db/db';
import { createSessionRepo } from '../src/db/sessionRepo';
import { resolveLegacyEntries } from '../src/ui/legacyGate';

let counter = 0;
let name: string;
let db: ToteDatabase;
let saved: { filename: string; text: string }[] = [];
let saveFails = false;

beforeEach(() => {
  name = `tote-gate-${counter++}`;
  db = new ToteDatabase(name);
  saved = [];
  saveFails = false;
  document.body.replaceChildren();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  document.body.querySelector<HTMLButtonElement>('.modal button')?.click(); // first button is "cancel"
  vi.restoreAllMocks();
  db.close();
  await Dexie.delete(name);
  document.body.replaceChildren();
});

const deps = () => ({
  db,
  saveFile: async (filename: string, text: string) => {
    if (saveFails) throw new Error('boom');
    saved.push({ filename, text });
    return true;
  },
  now: () => new Date(2026, 10, 8, 12, 0),
});
const button = (label: string) =>
  [...document.body.querySelectorAll('.modal button')].find((b) => b.textContent === label) as HTMLButtonElement;
const modalText = () => document.body.querySelector('.modal')?.textContent ?? '';
const addRaw = (sessionId: number, number: string, columnMultiplier: number) =>
  db.entries.add({ sessionId, number, columnMultiplier, createdAt: 'x', updatedAt: 'x' });

// session A: one valid entry and one in x210; session B: one in x210
async function seed(withLegacy = true): Promise<void> {
  const sessions = createSessionRepo(db);
  const a = await sessions.create('A');
  const b = await sessions.create('B');
  await addRaw(a.id, '123', 30);
  if (withLegacy) {
    await addRaw(a.id, '321', 210);
    await addRaw(b.id, '555', 210);
  }
}

describe('resolveLegacyEntries', () => {
  it('returns ok without any dialog when no entry is in a retired column', async () => {
    await seed(false);
    await expect(resolveLegacyEntries(deps())).resolves.toBe('ok');
    expect(document.body.querySelector('.modal')).toBeNull();
  });

  it('states how many entries and sessions are affected, and removes only those after the user agrees', async () => {
    await seed();
    const result = resolveLegacyEntries(deps());
    await vi.waitFor(() => expect(button('ลบรายการ x210')).toBeTruthy());
    expect(modalText()).toContain('2 รายการใน 2 ชุด');
    button('ลบรายการ x210').click();
    expect(await result).toBe('ok');
    expect((await db.entries.toArray()).map((e) => e.number)).toEqual(['123']);
    expect(document.body.querySelector('.modal')).toBeNull();
  });

  it('keeps all data and reports blocked when the user declines', async () => {
    await seed();
    const result = resolveLegacyEntries(deps());
    await vi.waitFor(() => expect(button('ยังไม่ลบ')).toBeTruthy());
    button('ยังไม่ลบ').click();
    expect(await result).toBe('blocked');
    expect(await db.entries.count()).toBe(3);
  });

  it('saves a file that contains the retired entries, then asks again', async () => {
    await seed();
    const result = resolveLegacyEntries(deps());
    await vi.waitFor(() => expect(button('เก็บไฟล์ไว้ดู')).toBeTruthy());
    button('เก็บไฟล์ไว้ดู').click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].filename).toBe('tote-backup-2026-11-08.json');
    const retired = JSON.parse(saved[0].text).sessions.flatMap((s: { entries: { columnMultiplier: number }[] }) => s.entries);
    expect(retired.filter((e: { columnMultiplier: number }) => e.columnMultiplier === 210)).toHaveLength(2);
    await vi.waitFor(() => expect(modalText()).toContain('บันทึกไฟล์แล้ว'));
    button('ลบรายการ x210').click();
    expect(await result).toBe('ok');
    expect(await db.entries.count()).toBe(1);
  });

  it('says so when the file cannot be saved and keeps the dialog', async () => {
    await seed();
    saveFails = true;
    const result = resolveLegacyEntries(deps());
    await vi.waitFor(() => expect(button('เก็บไฟล์ไว้ดู')).toBeTruthy());
    button('เก็บไฟล์ไว้ดู').click();
    await vi.waitFor(() => expect(modalText()).toContain('บันทึกไฟล์ไม่สำเร็จ'));
    expect(await db.entries.count()).toBe(3);
    button('ยังไม่ลบ').click();
    expect(await result).toBe('blocked');
  });
});