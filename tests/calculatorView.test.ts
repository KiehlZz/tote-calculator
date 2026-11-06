// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToteDatabase } from '../src/db/db';
import { createEntryRepo } from '../src/db/entryRepo';
import { createSessionRepo } from '../src/db/sessionRepo';
import { loadCalculator, mountCalculator } from '../src/ui/calculatorView';

let counter = 0;
let tick = 0;
let dbName: string;
let db: ToteDatabase;
let sessions: ReturnType<typeof createSessionRepo>;
let entries: ReturnType<typeof createEntryRepo>;
let main: HTMLElement;

const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();

beforeEach(() => {
  dbName = `tote-calc-test-${counter++}`;
  tick = 0;
  db = new ToteDatabase(dbName);
  sessions = createSessionRepo(db, clock);
  entries = createEntryRepo(db, clock);
  document.body.replaceChildren();
  main = document.createElement('main');
  document.body.append(main);
});

afterEach(async () => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  db.close();
  await Dexie.delete(dbName);
});

async function mountSession(id: number): Promise<void> {
  const data = await loadCalculator(sessions, entries, id);
  if (!data) throw new Error('session missing in test');
  mountCalculator(main, data, { entries });
}

const columnEl = (label: string) =>
  [...main.querySelectorAll('.column')].find((c) => c.querySelector('h3')?.textContent === label) as HTMLElement;
const inputOf = (label: string) => columnEl(label).querySelector('input') as HTMLInputElement;
const chipEls = (label: string) => [...columnEl(label).querySelectorAll('.entry-chip')] as HTMLButtonElement[];
const chipsOf = (label: string) => chipEls(label).map((c) => c.textContent);
const resultRows = () =>
  [...main.querySelectorAll('.result-table tbody tr')].map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent));
const typeInto = (label: string, value: string) => {
  const input = inputOf(label);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const modal = () => document.body.querySelector('.modal');
const modalInput = () => document.body.querySelector('.modal input') as HTMLInputElement;
const buttonByText = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const dbNumbers = async (sessionId: number) => (await entries.listBySession(sessionId)).map((e) => e.number);

describe('Calculator screen', () => {
  it('returns undefined for an unknown session', async () => {
    expect(await loadCalculator(sessions, entries, 999)).toBeUndefined();
  });

  it('shows the session name, six empty columns and an empty results panel', async () => {
    const s = await sessions.create('รอบเช้า');
    await mountSession(s.id);
    expect(main.querySelector('.calc-title')?.textContent).toBe('รอบเช้า');
    expect([...main.querySelectorAll('.column h3')].map((h) => h.textContent)).toEqual([
      'x30', 'x60', 'x120', 'x150', 'x180', 'x210',
    ]);
    expect(main.querySelectorAll('.column input')).toHaveLength(6);
    expect(main.querySelector('.results')!.textContent).toContain('ยังไม่มีข้อมูล');
    expect(main.querySelector('.result-summary')!.textContent).toContain('รายการทั้งหมด: 0');
  });

  it('adds an entry automatically at the third digit, clears the input and keeps focus', async () => {
    const s = await sessions.create('S');
    await mountSession(s.id);
    const input = inputOf('x30');
    input.focus();
    typeInto('x30', '123');
    await vi.waitFor(() => expect(chipsOf('x30')).toEqual(['123']));
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(resultRows()).toEqual([['123', '30', '1']]);
    const saved = await entries.listBySession(s.id);
    expect(saved.map((e) => [e.number, e.columnMultiplier])).toEqual([['123', 30]]);
  });

  it('strips non-digits and waits for three digits before adding', async () => {
    const s = await sessions.create('S');
    await mountSession(s.id);
    typeInto('x60', 'a1b');
    expect(inputOf('x60').value).toBe('1');
    typeInto('x60', '12');
    expect(inputOf('x60').value).toBe('12');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await entries.listBySession(s.id)).toEqual([]);
    typeInto('x60', '123');
    await vi.waitFor(() => expect(chipsOf('x60')).toEqual(['123']));
  });

  it('keeps leading zeros', async () => {
    const s = await sessions.create('S');
    await mountSession(s.id);
    typeInto('x30', '007');
    await vi.waitFor(() => expect(chipsOf('x30')).toEqual(['007']));
    expect(await dbNumbers(s.id)).toEqual(['007']);
    expect(resultRows()).toEqual([['007', '30', '1']]);
  });

  it('counts every duplicate: 123 five times in x30 = 150', async () => {
    const s = await sessions.create('S');
    await mountSession(s.id);
    for (let i = 0; i < 5; i++) typeInto('x30', '123');
    await vi.waitFor(() => expect(chipsOf('x30')).toHaveLength(5));
    expect(resultRows()).toEqual([['123', '150', '5']]);
    expect(await dbNumbers(s.id)).toHaveLength(5);
  });

  it('merges permutations across columns: 123 (x30) + 321 (x60) + 132 (x30) = 120', async () => {
    const s = await sessions.create('S');
    await mountSession(s.id);
    typeInto('x30', '123');
    typeInto('x60', '321');
    typeInto('x30', '132');
    await vi.waitFor(() => expect(resultRows()).toEqual([['123', '120', '3']]));
  });

  it('shows totals, group counts and results sorted by total then number', async () => {
    const s = await sessions.create('S');
    await mountSession(s.id);
    typeInto('x30', '123');
    typeInto('x30', '321');
    typeInto('x60', '456');
    typeInto('x60', '654');
    await vi.waitFor(() => expect(resultRows()).toHaveLength(2));
    expect(resultRows()).toEqual([
      ['456', '120', '2'],
      ['123', '60', '2'],
    ]);
    const summary = main.querySelector('.result-summary')!.textContent;
    expect(summary).toContain('รายการทั้งหมด: 4');
    expect(summary).toContain('จำนวนกลุ่ม: 2');
  });

  it('loads existing entries, newest first in each column', async () => {
    const s = await sessions.create('S');
    await entries.add(s.id, '111', 30);
    await entries.add(s.id, '222', 30);
    await entries.add(s.id, '333', 60);
    await mountSession(s.id);
    expect(chipsOf('x30')).toEqual(['222', '111']);
    expect(chipsOf('x60')).toEqual(['333']);
  });

  it('edits a number from the dialog and recalculates', async () => {
    const s = await sessions.create('S');
    await entries.add(s.id, '123', 30);
    await mountSession(s.id);
    chipEls('x30')[0].click();
    expect(modalInput().value).toBe('123');
    modalInput().value = '456';
    buttonByText(document.body, 'บันทึก').click();
    await vi.waitFor(() => expect(chipsOf('x30')).toEqual(['456']));
    expect(modal()).toBeNull();
    expect(resultRows()).toEqual([['456', '30', '1']]);
    expect(await dbNumbers(s.id)).toEqual(['456']);
  });

  it('refuses an invalid number in the edit dialog', async () => {
    const s = await sessions.create('S');
    await entries.add(s.id, '123', 30);
    await mountSession(s.id);
    chipEls('x30')[0].click();
    modalInput().value = '12';
    buttonByText(document.body, 'บันทึก').click();
    expect(modal()).not.toBeNull();
    expect(modal()!.textContent).toContain('กรุณากรอกเลข 3 หลัก');
    expect(await dbNumbers(s.id)).toEqual(['123']);
  });

  it('leaves the entry unchanged when the edit dialog is cancelled', async () => {
    const s = await sessions.create('S');
    await entries.add(s.id, '123', 30);
    await mountSession(s.id);
    chipEls('x30')[0].click();
    modalInput().value = '999';
    buttonByText(document.body, 'ยกเลิก').click();
    expect(modal()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(chipsOf('x30')).toEqual(['123']);
    expect(await dbNumbers(s.id)).toEqual(['123']);
  });

  it('deletes an entry from the edit dialog, in the database too', async () => {
    const s = await sessions.create('S');
    await entries.add(s.id, '123', 30);
    await entries.add(s.id, '123', 30);
    await mountSession(s.id);
    chipEls('x30')[0].click();
    buttonByText(document.body, 'ลบ').click();
    await vi.waitFor(() => expect(chipsOf('x30')).toHaveLength(1));
    expect(resultRows()).toEqual([['123', '30', '1']]);
    expect(await db.entries.count()).toBe(1);
  });

  it('shows an error message with the number when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(db.entries, 'add').mockRejectedValue(new Error('boom'));
    const s = await sessions.create('S');
    await mountSession(s.id);
    typeInto('x30', '123');
    const banner = main.querySelector('.banner') as HTMLElement;
    await vi.waitFor(() => expect(banner.textContent).toContain('บันทึกเลข 123'));
    expect(banner.hidden).toBe(false);
    expect(chipsOf('x30')).toEqual([]);
    vi.restoreAllMocks();
    expect(await entries.listBySession(s.id)).toEqual([]);
  });

  it('keeps the typed order when numbers are entered quickly', async () => {
    const s = await sessions.create('S');
    await mountSession(s.id);
    typeInto('x30', '111');
    typeInto('x30', '222');
    typeInto('x30', '333');
    await vi.waitFor(() => expect(chipsOf('x30')).toHaveLength(3));
    expect(await dbNumbers(s.id)).toEqual(['111', '222', '333']);
    expect(chipsOf('x30')).toEqual(['333', '222', '111']);
  });
});