// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToteDatabase } from '../src/db/db';
import { createEntryRepo } from '../src/db/entryRepo';
import { createSessionRepo } from '../src/db/sessionRepo';
import { renderHome } from '../src/ui/homeView';

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
  dbName = `tote-home-test-${counter++}`;
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

const mount = () => renderHome(main, { sessions, navigate });
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