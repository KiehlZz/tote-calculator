// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToteDatabase } from '../src/db/db';
import { createEntryRepo } from '../src/db/entryRepo';
import { createSessionRepo } from '../src/db/sessionRepo';
import { renderHome } from '../src/ui/homeView';
import { exportBackup, importBackup, parseBackup, type BackupFile, type ImportMode } from '../src/db/backup';

let counter = 0;
let tick = 0;
let dbName: string;
let db: ToteDatabase;
let sessions: ReturnType<typeof createSessionRepo>;
let entries: ReturnType<typeof createEntryRepo>;
let main: HTMLElement;
let navigate: ReturnType<typeof vi.fn>;

const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();

let saved: { filename: string; text: string }[] = [];
let saveResult = true;
let pickFile: () => Promise<string | null> = async () => null;

const backupDeps = {
  exportBackup: () => exportBackup(db, () => '2026-11-05T10:00:00.000Z'),
  importBackup: (data: BackupFile, mode: ImportMode) => importBackup(db, data, mode),
  saveFile: async (filename: string, text: string) => {
    saved.push({ filename, text });
    return saveResult;
  },
  pickFile: () => pickFile(),
  now: () => new Date(2026, 10, 5, 12, 0),
};

beforeEach(() => {
  dbName = `tote-home-test-${counter++}`;
  tick = 0;
  db = new ToteDatabase(dbName);
  sessions = createSessionRepo(db, clock);
  entries = createEntryRepo(db, clock);
  navigate = vi.fn();
  saved = [];
  saveResult = true;
  pickFile = async () => null;
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

const mount = () => renderHome(main, { sessions, navigate, backup: backupDeps });
const names = () => [...main.querySelectorAll('.session-name')].map((n) => n.textContent);
const modal = () => document.body.querySelector('.modal');
const modalInput = () => document.body.querySelector('.modal input') as HTMLInputElement;
const buttonByText = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const buttonByLabel = (label: string) => main.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
const openCreateDialog = () => buttonByText(main, 'สร้างชุดข้อมูลใหม่').click();

describe('Home screen', () => {
  it('shows an empty state when there are no sessions', async () => {
    await mount();
    expect(names()).toEqual([]);
    expect(main.textContent).toContain('ยังไม่มีชุดข้อมูล');
  });

  it('lists sessions newest-modified first with Thai Buddhist-era dates', async () => {
    await sessions.create('A');
    await sessions.create('B');
    await mount();
    expect(names()).toEqual(['B', 'A']);
    const firstRow = main.querySelector('.session-row')!;
    expect(firstRow.textContent).toContain('สร้างเมื่อ 1 ม.ค. 2569');
    expect(firstRow.textContent).toContain('แก้ไขล่าสุด 1 ม.ค. 2569 07:00 น.');
  });

  it('links each session to its calculator page', async () => {
    const session = await sessions.create('A');
    await mount();
    const link = main.querySelector('a.btn-primary') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`#/session/${session.id}`);
  });

  it('creates a session with a trimmed name and opens it', async () => {
    await mount();
    openCreateDialog();
    expect(modal()).not.toBeNull();
    modalInput().value = '  รอบเช้า  ';
    buttonByText(document.body, 'สร้าง').click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    const [created] = await sessions.list();
    expect(created.name).toBe('รอบเช้า');
    expect(navigate).toHaveBeenCalledWith(`#/session/${created.id}`);
    expect(modal()).toBeNull();
  });

  it('creates a session when Enter is pressed in the name field', async () => {
    await mount();
    openCreateDialog();
    modalInput().value = 'กด Enter';
    modalInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect((await sessions.list())[0].name).toBe('กด Enter');
  });

  it('keeps the dialog open with a message for a blank name, and cancel creates nothing', async () => {
    await mount();
    openCreateDialog();
    modalInput().value = '   ';
    buttonByText(document.body, 'สร้าง').click();
    expect(modal()).not.toBeNull();
    expect(modal()!.textContent).toContain('กรุณากรอกชื่อชุดข้อมูล');
    expect(await sessions.list()).toEqual([]);
    buttonByText(document.body, 'ยกเลิก').click();
    expect(modal()).toBeNull();
    expect(await sessions.list()).toEqual([]);
  });

  it('closes the dialog with Escape without creating anything', async () => {
    await mount();
    openCreateDialog();
    expect(modal()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal()).toBeNull();
    expect(await sessions.list()).toEqual([]);
  });

  it('creates only one session when the confirm button is pressed twice', async () => {
    await mount();
    openCreateDialog();
    modalInput().value = 'Once';
    const confirm = buttonByText(document.body, 'สร้าง');
    confirm.click();
    confirm.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await sessions.list()).toHaveLength(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('renames a session from a dialog prefilled with the current name', async () => {
    await sessions.create('A');
    await mount();
    buttonByLabel('เปลี่ยนชื่อ A').click();
    expect(modalInput().value).toBe('A');
    modalInput().value = 'A2';
    buttonByText(document.body, 'บันทึก').click();
    await vi.waitFor(() => expect(names()).toEqual(['A2']));
    expect((await sessions.list())[0].name).toBe('A2');
  });

  it('asks before deleting: cancel keeps the session and its entries, and focus starts on cancel', async () => {
    const session = await sessions.create('A');
    await entries.add(session.id, '123', 30);
    await mount();
    buttonByLabel('ลบ A').click();
    expect(modal()!.textContent).toContain('ลบชุดข้อมูล');
    expect(document.activeElement?.textContent).toBe('ยกเลิก');
    buttonByText(document.body, 'ยกเลิก').click();
    expect(modal()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50)); // give a wrongly started delete time to finish
    expect(await sessions.list()).toHaveLength(1);
    expect(await db.entries.count()).toBe(1);
  });

  it('deletes the session and its entries after confirmation', async () => {
    const session = await sessions.create('A');
    await entries.add(session.id, '123', 30);
    await mount();
    buttonByLabel('ลบ A').click();
    buttonByText(document.body, 'ลบชุดข้อมูล').click();
    await vi.waitFor(() => expect(main.textContent).toContain('ยังไม่มีชุดข้อมูล'));
    expect(await sessions.list()).toEqual([]);
    expect(await db.entries.count()).toBe(0);
  });

  it('shows an error message and does not navigate when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(db.sessions, 'add').mockRejectedValue(new Error('boom'));
    await mount();
    openCreateDialog();
    modalInput().value = 'X';
    buttonByText(document.body, 'สร้าง').click();
    const banner = main.querySelector('.banner') as HTMLElement;
    await vi.waitFor(() => expect(banner.textContent).toContain('สร้างชุดข้อมูลไม่สำเร็จ'));
    expect(banner.hidden).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(await sessions.list()).toEqual([]);
  });
});

const statusEl = () => main.querySelector('.status') as HTMLElement;
const bannerEl = () => main.querySelector('.banner') as HTMLElement;

const fileSession = {
  name: 'จากไฟล์',
  createdAt: '2026-11-01T01:00:00.000Z',
  updatedAt: '2026-11-02T01:00:00.000Z',
  entries: [
    { columnMultiplier: 30, number: '007', createdAt: '2026-11-01T01:00:00.000Z', updatedAt: '2026-11-01T01:00:00.000Z' },
    { columnMultiplier: 60, number: '123', createdAt: '2026-11-01T01:01:00.000Z', updatedAt: '2026-11-01T01:01:00.000Z' },
  ],
};
const backupText = (sessionList: unknown[] = [fileSession]) =>
  JSON.stringify({
    app: 'tote-calculator',
    schemaVersion: 1,
    exportedAt: '2026-11-05T10:00:00.000Z',
    sessions: sessionList,
  });

const startRestore = async () => {
  buttonByText(main, 'กู้คืนข้อมูล').click();
  await vi.waitFor(() => expect(modal()).not.toBeNull());
};

describe('Backup', () => {
  it('saves all sessions to a JSON file named after today', async () => {
    const s = await sessions.create('A');
    await entries.add(s.id, '007', 30);
    await entries.add(s.id, '007', 30);
    await mount();
    buttonByText(main, 'สำรองข้อมูล').click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].filename).toBe('tote-backup-2026-11-05.json');
    const parsed = parseBackup(saved[0].text);
    expect(parsed.sessions.map((x) => x.name)).toEqual(['A']);
    expect(parsed.sessions[0].entries.map((e) => e.number)).toEqual(['007', '007']);
    await vi.waitFor(() => expect(statusEl().hidden).toBe(false));
    expect(statusEl().textContent).toContain('tote-backup-2026-11-05.json');
    expect(statusEl().textContent).toContain('1 ชุด 2 รายการ');
  });

  it('does not create a file when there is no data', async () => {
    await mount();
    buttonByText(main, 'สำรองข้อมูล').click();
    await vi.waitFor(() => expect(bannerEl().hidden).toBe(false));
    expect(bannerEl().textContent).toContain('ยังไม่มีข้อมูลให้สำรอง');
    expect(saved).toEqual([]);
  });

  it('shows no success message when the user closes the share sheet', async () => {
    await sessions.create('A');
    saveResult = false;
    await mount();
    buttonByText(main, 'สำรองข้อมูล').click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(statusEl().hidden).toBe(true);
    expect(bannerEl().hidden).toBe(true);
  });

  it('shows an error when the export fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await sessions.create('A');
    await mount();
    vi.spyOn(db.sessions, 'orderBy').mockImplementation(() => {
      throw new Error('boom');
    });
    buttonByText(main, 'สำรองข้อมูล').click();
    await vi.waitFor(() => expect(bannerEl().textContent).toContain('สำรองข้อมูลไม่สำเร็จ'));
    expect(saved).toEqual([]);
  });
});

describe('Restore', () => {
  it('adds the file sessions next to the existing ones', async () => {
    const existing = await sessions.create('Existing');
    await entries.add(existing.id, '111', 30);
    pickFile = async () => backupText();
    await mount();
    await startRestore();
    expect(modal()!.textContent).toContain('พบ 1 ชุด 2 รายการ');
    expect(modal()!.textContent).toContain('5 พ.ย. 2569');
    buttonByText(document.body, 'เพิ่มเข้าไป').click();
    await vi.waitFor(() => expect(names()).toEqual(['จากไฟล์', 'Existing']));
    expect(statusEl().textContent).toContain('กู้คืนสำเร็จ: 1 ชุด 2 รายการ');
    expect(await db.entries.count()).toBe(3);
    expect(modal()).toBeNull();
  });

  it('replaces everything only after a second confirmation', async () => {
    await sessions.create('Old1');
    await sessions.create('Old2');
    pickFile = async () => backupText();
    await mount();
    await startRestore();
    buttonByText(document.body, 'แทนที่ทั้งหมด').click();
    await vi.waitFor(() => expect(modal()?.textContent).toContain('ข้อมูลปัจจุบัน 2 ชุด'));
    expect(await sessions.list()).toHaveLength(2); // nothing is deleted before confirming
    expect(document.activeElement?.textContent).toBe('ยกเลิก');
    buttonByText(document.body, 'แทนที่ทั้งหมด').click();
    await vi.waitFor(() => expect(names()).toEqual(['จากไฟล์']));
    expect(await db.entries.count()).toBe(2);
    expect(statusEl().textContent).toContain('กู้คืนสำเร็จ');
  });

  it('keeps everything when the replace confirmation is cancelled', async () => {
    await sessions.create('Old1');
    pickFile = async () => backupText();
    await mount();
    await startRestore();
    buttonByText(document.body, 'แทนที่ทั้งหมด').click();
    await vi.waitFor(() => expect(modal()?.textContent).toContain('ข้อมูลปัจจุบัน 1 ชุด'));
    buttonByText(document.body, 'ยกเลิก').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(modal()).toBeNull();
    expect(names()).toEqual(['Old1']);
    expect(await sessions.list()).toHaveLength(1);
    expect(statusEl().hidden).toBe(true);
  });

  it('imports nothing when the choice dialog is cancelled', async () => {
    await sessions.create('Old1');
    pickFile = async () => backupText();
    await mount();
    await startRestore();
    buttonByText(document.body, 'ยกเลิก').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(modal()).toBeNull();
    expect(names()).toEqual(['Old1']);
    expect(await sessions.list()).toHaveLength(1);
  });

  it('does nothing when the file picker is cancelled', async () => {
    await mount();
    buttonByText(main, 'กู้คืนข้อมูล').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(modal()).toBeNull();
    expect(bannerEl().hidden).toBe(true);
  });

  it('rejects a file with an invalid number and changes nothing', async () => {
    await sessions.create('Old1');
    pickFile = async () =>
      backupText([{ ...fileSession, entries: [{ ...fileSession.entries[0], number: '12' }] }]);
    await mount();
    buttonByText(main, 'กู้คืนข้อมูล').click();
    await vi.waitFor(() => expect(bannerEl().hidden).toBe(false));
    expect(bannerEl().textContent).toContain('ไฟล์สำรองไม่ถูกต้อง');
    expect(bannerEl().textContent).toContain('sessions[0].entries[0].number');
    expect(modal()).toBeNull();
    expect(await sessions.list()).toHaveLength(1);
  });

  it('rejects a file that is not JSON', async () => {
    pickFile = async () => 'hello';
    await mount();
    buttonByText(main, 'กู้คืนข้อมูล').click();
    await vi.waitFor(() => expect(bannerEl().textContent).toContain('ไฟล์สำรองไม่ถูกต้อง'));
    expect(modal()).toBeNull();
  });

  it('rejects a backup that contains no data, so replace can never wipe everything', async () => {
    await sessions.create('Old1');
    pickFile = async () => backupText([]);
    await mount();
    buttonByText(main, 'กู้คืนข้อมูล').click();
    await vi.waitFor(() => expect(bannerEl().textContent).toContain('ไฟล์สำรองนี้ไม่มีข้อมูล'));
    expect(modal()).toBeNull();
    expect(await sessions.list()).toHaveLength(1);
  });

  it('shows an error and keeps the old data when the import fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await sessions.create('Existing');
    pickFile = async () => backupText();
    await mount();
    vi.spyOn(db.entries, 'bulkAdd').mockRejectedValue(new Error('boom'));
    await startRestore();
    buttonByText(document.body, 'เพิ่มเข้าไป').click();
    await vi.waitFor(() => expect(bannerEl().textContent).toContain('กู้คืนข้อมูลไม่สำเร็จ'));
    vi.restoreAllMocks();
    expect(names()).toEqual(['Existing']);
    expect(await db.sessions.count()).toBe(1); // the imported session was rolled back
  });

  it('shows an error when the file cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pickFile = async () => {
      throw new Error('read failed');
    };
    await mount();
    buttonByText(main, 'กู้คืนข้อมูล').click();
    await vi.waitFor(() => expect(bannerEl().textContent).toContain('อ่านไฟล์ไม่สำเร็จ'));
  });

  it('ignores a second click while the file picker is still open', async () => {
    let calls = 0;
    pickFile = () => {
      calls++;
      return new Promise<string | null>(() => {});
    };
    await mount();
    const restore = buttonByText(main, 'กู้คืนข้อมูล');
    restore.click();
    restore.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toBe(1);
  });
});