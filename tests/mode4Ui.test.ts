// @vitest-environment happy-dom
// เทสต์ Phase 10.3: หน้าหลักมีปุ่มสร้างชุด 4 ตัว และหน้าคิดเลขโหมด 4 ตัว (x24, x48)
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportBackup, importBackup, type BackupFile, type ImportMode } from '../src/db/backup';
import { ToteDatabase } from '../src/db/db';
import { createEntryRepo } from '../src/db/entryRepo';
import { createSessionRepo } from '../src/db/sessionRepo';
import { loadCalculator, mountCalculator } from '../src/ui/calculatorView';
import { renderHome } from '../src/ui/homeView';
import { groupByColumn, modeLabel, sanitizeDigits, validateEntryNumber } from '../src/ui/helpers';

let counter = 0;
let tick = 0;
let dbName: string;
let db: ToteDatabase;
let sessions: ReturnType<typeof createSessionRepo>;
let entries: ReturnType<typeof createEntryRepo>;
let main: HTMLElement;
let navigate: ReturnType<typeof vi.fn>;

const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();

beforeEach(() => {
  dbName = `tote-mode4ui-${counter++}`;
  tick = 0;
  db = new ToteDatabase(dbName);
  sessions = createSessionRepo(db, clock);
  entries = createEntryRepo(db, clock);
  navigate = vi.fn();
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

const backupDeps = {
  exportBackup: () => exportBackup(db, () => '2026-11-05T10:00:00.000Z'),
  importBackup: (data: BackupFile, mode: ImportMode) => importBackup(db, data, mode),
  saveFile: async () => true,
  pickFile: async () => null,
  now: () => new Date(2026, 10, 5, 12, 0),
};
const mountHome = () =>
  renderHome(main, { sessions, navigate, backup: backupDeps, storageStatus: Promise.resolve('persistent') });

async function mountSession(id: number): Promise<void> {
  const data = await loadCalculator(sessions, entries, id);
  if (!data) throw new Error('session missing in test');
  mountCalculator(main, data, { entries });
}

const buttonByText = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
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
const dbNumbers = async (id: number) => (await entries.listBySession(id)).map((e) => [e.number, e.columnMultiplier]);

describe('ui helpers by mode', () => {
  it('sanitizeDigits keeps 3 digits by default and 4 in mode 4', () => {
    expect(sanitizeDigits('12345')).toBe('123');
    expect(sanitizeDigits('12345', 3)).toBe('123');
    expect(sanitizeDigits('12345', 4)).toBe('1234');
    expect(sanitizeDigits('1a2-3 4x5', 4)).toBe('1234');
    expect(sanitizeDigits('๑๒๓๔', 4)).toBe('');
  });

  it('validateEntryNumber message and rule follow the mode', () => {
    expect(validateEntryNumber('1234', 4)).toBeNull();
    expect(validateEntryNumber('0012', 4)).toBeNull();
    expect(validateEntryNumber('123', 4)).toBe('กรุณากรอกเลข 4 หลัก');
    expect(validateEntryNumber('1234')).toBe('กรุณากรอกเลข 3 หลัก');
    expect(validateEntryNumber('123')).toBeNull();
  });

  it('groupByColumn returns two columns in mode 4 and six in mode 3', () => {
    expect(groupByColumn([], 4).map((g) => g.multiplier)).toEqual([24, 48]);
    expect(groupByColumn([]).map((g) => g.multiplier)).toEqual([15, 30, 60, 120, 150, 180]);
    expect(() => groupByColumn([{ columnMultiplier: 30 }], 4)).toThrow(/Unknown column multiplier/);
    expect(() => groupByColumn([{ columnMultiplier: 24 }], 3)).toThrow(/Unknown column multiplier/);
  });

  it('modeLabel', () => {
    expect(modeLabel(3)).toBe('3 ตัว');
    expect(modeLabel(4)).toBe('4 ตัว');
  });
});

describe('Home screen with 4-digit sessions', () => {
  it('has a "สร้างชุด 4 ตัว" button next to the existing create button', async () => {
    await mountHome();
    expect(buttonByText(main, 'สร้างชุดข้อมูลใหม่')).toBeTruthy();
    expect(buttonByText(main, 'สร้างชุด 4 ตัว')).toBeTruthy();
  });

  it('creates a 4-digit session and opens it', async () => {
    await mountHome();
    buttonByText(main, 'สร้างชุด 4 ตัว').click();
    expect(modal()!.textContent).toContain('สร้างชุดข้อมูล 4 ตัวใหม่');
    modalInput().value = '  รอบ 4 ตัว  ';
    buttonByText(document.body, 'สร้าง').click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    const [created] = await sessions.list();
    expect(created.name).toBe('รอบ 4 ตัว');
    expect(created.mode).toBe(4);
    expect(navigate).toHaveBeenCalledWith(`#/session/${created.id}`);
  });

  it('the existing button still creates a 3-digit session', async () => {
    await mountHome();
    buttonByText(main, 'สร้างชุดข้อมูลใหม่').click();
    modalInput().value = 'สามตัว';
    buttonByText(document.body, 'สร้าง').click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect((await sessions.list())[0].mode).toBe(3);
  });

  it('cancelling the 4-digit dialog creates nothing', async () => {
    await mountHome();
    buttonByText(main, 'สร้างชุด 4 ตัว').click();
    buttonByText(document.body, 'ยกเลิก').click();
    expect(await sessions.list()).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a mode badge on every row', async () => {
    await sessions.create('สาม', 3);
    await sessions.create('สี่', 4);
    await mountHome();
    const rows = [...main.querySelectorAll('.session-row')];
    const badgeOf = (name: string) =>
      rows.find((r) => r.querySelector('.session-name')?.textContent === name)!.querySelector('.badge')!.textContent;
    expect(badgeOf('สาม')).toBe('3 ตัว');
    expect(badgeOf('สี่')).toBe('4 ตัว');
  });

  it('mentions both create buttons in the empty state', async () => {
    await mountHome();
    expect(main.querySelector('.empty')!.textContent).toContain('สร้างชุด 4 ตัว');
  });
});

describe('Calculator screen in 4-digit mode', () => {
  it('shows two columns x24 and x48 with 4-digit inputs and a "4 ตัว" badge', async () => {
    const s = await sessions.create('สี่ตัว', 4);
    await mountSession(s.id);
    expect([...main.querySelectorAll('.column h3')].map((h) => h.textContent)).toEqual(['x24', 'x48']);
    expect(main.querySelectorAll('.column input')).toHaveLength(2);
    expect(inputOf('x24').placeholder).toBe('เลข 4 หลัก');
    expect(inputOf('x48').getAttribute('aria-label')).toBe('กรอกเลข 4 หลัก คอลัมน์ x48');
    expect(main.querySelector('.columns')!.classList.contains('columns-2')).toBe(true);
    expect(main.querySelector('.calc-toolbar .badge')!.textContent).toBe('4 ตัว');
    expect(main.querySelector('.results')!.textContent).toContain('ยังไม่มีข้อมูล');
  });

  it('a 3-digit session is unchanged: six columns, 3-digit inputs, "3 ตัว" badge', async () => {
    const s = await sessions.create('สามตัว');
    await mountSession(s.id);
    expect(main.querySelectorAll('.column input')).toHaveLength(6);
    expect(inputOf('x30').placeholder).toBe('เลข 3 หลัก');
    expect(main.querySelector('.columns')!.classList.contains('columns-2')).toBe(false);
    expect(main.querySelector('.calc-toolbar .badge')!.textContent).toBe('3 ตัว');
  });

  it('adds nothing until the fourth digit, then adds, clears the field and saves', async () => {
    const s = await sessions.create('สี่ตัว', 4);
    await mountSession(s.id);
    typeInto('x24', '123');
    expect(chipsOf('x24')).toEqual([]);
    expect(inputOf('x24').value).toBe('123');
    typeInto('x24', '1234');
    await vi.waitFor(() => expect(chipsOf('x24')).toEqual(['1234']));
    expect(inputOf('x24').value).toBe('');
    expect(await dbNumbers(s.id)).toEqual([['1234', 24]]);
  });

  it('cuts extra digits at 4 and ignores non-digits', async () => {
    const s = await sessions.create('สี่ตัว', 4);
    await mountSession(s.id);
    typeInto('x48', '12a3-45');
    await vi.waitFor(() => expect(chipsOf('x48')).toEqual(['1234']));
    expect(await dbNumbers(s.id)).toEqual([['1234', 48]]);
  });

  it('keeps leading zeros', async () => {
    const s = await sessions.create('สี่ตัว', 4);
    await mountSession(s.id);
    typeInto('x24', '0012');
    await vi.waitFor(() => expect(chipsOf('x24')).toEqual(['0012']));
    expect(resultRows()).toEqual([['0012', '24', '1']]);
  });

  it('shows the live result on the right: 1234 x24 + 4321 x48 = 72', async () => {
    const s = await sessions.create('สี่ตัว', 4);
    await mountSession(s.id);
    typeInto('x24', '1234');
    await vi.waitFor(() => expect(chipsOf('x24')).toEqual(['1234']));
    typeInto('x48', '4321');
    await vi.waitFor(() => expect(chipsOf('x48')).toEqual(['4321']));
    expect(resultRows()).toEqual([['1234', '72', '2']]);
    expect(main.querySelector('.result-summary')!.textContent).toBe('รายการทั้งหมด: 2 · จำนวนกลุ่ม: 1');
    expect(main.querySelector('.results')).not.toBeNull();
  });

  it('sorts groups by total, shows separators in big totals and counts duplicates', async () => {
    const s = await sessions.create('สี่ตัว', 4);
    for (let i = 0; i < 30; i++) await entries.add(s.id, '9876', 48); // 1,440
    await entries.add(s.id, '1234', 24);
    await entries.add(s.id, '1123', 48);
    await mountSession(s.id);
    expect(resultRows()).toEqual([
      ['6789', '1,440', '30'],
      ['1123', '48', '1'],
      ['1234', '24', '1'],
    ]);
  });

  it('shows entries that were saved earlier', async () => {
    const s = await sessions.create('สี่ตัว', 4);
    await entries.add(s.id, '1234', 24);
    await entries.add(s.id, '5678', 48);
    await mountSession(s.id);
    expect(chipsOf('x24')).toEqual(['1234']);
    expect(chipsOf('x48')).toEqual(['5678']);
  });

  it('edit dialog: 4-digit field, saves a new number', async () => {
    const s = await sessions.create('สี่ตัว', 4);
    await entries.add(s.id, '1234', 24);
    await mountSession(s.id);
    chipEls('x24')[0].click();
    expect(modal()!.textContent).toContain('แก้ไขเลข · x24');
    expect(modal()!.textContent).toContain('เลข 4 หลัก');
    expect(modalInput().value).toBe('1234');
    modalInput().value = '98765';
    modalInput().dispatchEvent(new Event('input', { bubbles: true }));
    expect(modalInput().value).toBe('9876');
    buttonByText(document.body, 'บันทึก').click();
    await vi.waitFor(() => expect(chipsOf('x24')).toEqual(['9876']));
    expect(await dbNumbers(s.id)).toEqual([['9876', 24]]);
    expect(resultRows()).toEqual([['6789', '24', '1']]);
  });

  it('edit dialog: refuses 3 digits with a 4-digit message and keeps the dialog open', async () => {
    const s = await sessions.create('สี่ตัว', 4);
    await entries.add(s.id, '1234', 24);
    await mountSession(s.id);
    chipEls('x24')[0].click();
    modalInput().value = '123';
    modalInput().dispatchEvent(new Event('input', { bubbles: true }));
    buttonByText(document.body, 'บันทึก').click();
    expect(modal()).not.toBeNull();
    expect(document.body.querySelector('.field-error')!.textContent).toBe('กรุณากรอกเลข 4 หลัก');
    expect(await dbNumbers(s.id)).toEqual([['1234', 24]]);
  });

  it('edit dialog: delete removes the entry and updates the result', async () => {
    const s = await sessions.create('สี่ตัว', 4);
    await entries.add(s.id, '1234', 24);
    await entries.add(s.id, '4321', 48);
    await mountSession(s.id);
    chipEls('x24')[0].click();
    buttonByText(document.body, 'ลบ').click();
    await vi.waitFor(() => expect(chipsOf('x24')).toEqual([]));
    expect(await dbNumbers(s.id)).toEqual([['4321', 48]]);
    expect(resultRows()).toEqual([['1234', '48', '1']]);
  });

  it('3-digit edit dialog still says 3 digits', async () => {
    const s = await sessions.create('สามตัว');
    await entries.add(s.id, '123', 30);
    await mountSession(s.id);
    chipEls('x30')[0].click();
    expect(modal()!.textContent).toContain('เลข 3 หลัก');
    modalInput().value = '1234';
    modalInput().dispatchEvent(new Event('input', { bubbles: true }));
    expect(modalInput().value).toBe('123');
  });

  it('a 4-digit session and a 3-digit session keep their own entries', async () => {
    const s3 = await sessions.create('สาม', 3);
    const s4 = await sessions.create('สี่', 4);
    await entries.add(s3.id, '123', 30);
    await entries.add(s4.id, '1234', 24);
    await mountSession(s4.id);
    expect(resultRows()).toEqual([['1234', '24', '1']]);
    await mountSession(s3.id);
    expect(resultRows()).toEqual([['123', '30', '1']]);
  });
});