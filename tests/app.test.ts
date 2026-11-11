// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToteDatabase } from '../src/db/db';
import { startApp, type AppDeps, type AppHandle } from '../src/ui/app';

interface Launched extends AppHandle {
  db: ToteDatabase;
  root: HTMLElement;
}

let counter = 0;
let dbNames: string[] = [];
let launched: Launched[] = [];
let saved: { filename: string; text: string }[] = [];
let pickFile: () => Promise<string | null> = async () => null;
let storage: AppDeps['storage'];

beforeEach(() => {
  document.body.replaceChildren();
  dbNames = [];
  launched = [];
  saved = [];
  pickFile = async () => null;
  storage = { persisted: async () => true };
  window.location.hash = '';
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const app of launched) {
    app.stop();
    app.db.close();
  }
  for (const name of dbNames) await Dexie.delete(name);
  document.body.replaceChildren();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const newDbName = () => {
  const name = `tote-e2e-${counter++}`;
  dbNames.push(name);
  return name;
};

const makeDeps = (db: ToteDatabase): AppDeps => ({
  db,
  storage,
  saveFile: async (filename, text) => {
    saved.push({ filename, text });
    return true;
  },
  pickFile: () => pickFile(),
  now: () => new Date(2026, 10, 5, 12, 0),
});

// "opens the app" the way main.ts does, on a database with the given name
async function launch(dbName: string, hash = '#/'): Promise<Launched> {
  window.location.hash = hash;
  const db = new ToteDatabase(dbName);
  const root = document.createElement('div');
  document.body.append(root);
  const handle = await startApp(root, makeDeps(db));
  const app = { ...handle, db, root };
  launched.push(app);
  return app;
}

// "closes the app": stops its listeners and closes the database connection
function close(app: Launched): void {
  app.stop();
  app.db.close();
  app.root.remove();
}

// some DOM implementations do not fire hashchange themselves, so the helper fires it too
function goTo(hash: string): void {
  window.location.hash = hash;
  window.dispatchEvent(new Event('hashchange'));
}

const buttonByText = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
const modalInput = () => document.body.querySelector('.modal input') as HTMLInputElement;
const columnEl = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('.column')].find((c) => c.querySelector('h3')?.textContent === label) as HTMLElement;
const chips = (root: ParentNode, label: string) =>
  [...columnEl(root, label).querySelectorAll('.entry-chip')].map((c) => c.textContent);
const chipButton = (root: ParentNode, label: string, value: string) =>
  [...columnEl(root, label).querySelectorAll('.entry-chip')].find((c) => c.textContent === value) as HTMLButtonElement;
const resultRows = (root: ParentNode) =>
  [...root.querySelectorAll('.result-table tbody tr')].map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent));
const sessionRows = (root: ParentNode) => [...root.querySelectorAll('.session-row')];

async function createSession(app: Launched, name: string): Promise<void> {
  buttonByText(app.root, 'สร้างชุด 3 ตัว').click();
  modalInput().value = name;
  buttonByText(document.body, 'สร้าง').click();
  await vi.waitFor(() => expect(window.location.hash).toMatch(/^#\/session\/\d+$/));
  window.dispatchEvent(new Event('hashchange'));
  await vi.waitFor(() => expect(app.root.querySelector('.calc-title')?.textContent).toBe(name));
}

async function addNumber(app: Launched, column: string, value: string): Promise<void> {
  const before = chips(app.root, column).length;
  const input = columnEl(app.root, column).querySelector('input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(chips(app.root, column)).toHaveLength(before + 1));
}

async function showHome(app: Launched): Promise<void> {
  goTo('#/');
  // wait for the list (or the empty-state message) too, not just the toolbar
  await vi.waitFor(() =>
    expect(app.root.querySelector('.session-list')?.childElementCount ?? 0).toBeGreaterThan(0),
  );
}

async function seedRetiredColumn(dbName: string): Promise<void> {
  const seed = new ToteDatabase(dbName);
  const t = '2026-11-01T01:00:00.000Z';
  const sessionId = await seed.sessions.add({ name: 'เก่า', createdAt: t, updatedAt: t });
  await seed.entries.add({ sessionId, number: '123', columnMultiplier: 30, createdAt: t, updatedAt: t });
  await seed.entries.add({ sessionId, number: '321', columnMultiplier: 210, createdAt: t, updatedAt: t });
  seed.close();
}

async function openSession(app: Launched, name: string): Promise<void> {
  const row = sessionRows(app.root).find((r) => r.querySelector('.session-name')?.textContent === name)!;
  goTo((row.querySelector('a.btn-primary') as HTMLAnchorElement).getAttribute('href')!);
  await vi.waitFor(() => expect(app.root.querySelector('.calc-title')?.textContent).toBe(name));
}

describe('whole app', () => {
  it('opens on an empty Home screen with the app name', async () => {
    const app = await launch(newDbName());
    expect(app.root.querySelector('h1')?.textContent).toBe('เครื่องคิดเลขโต๊ด');
    await vi.waitFor(() => expect(app.root.textContent).toContain('ยังไม่มีชุดข้อมูล'));
  });

  it('full workflow: create a session, enter numbers, see the grouped totals', async () => {
    const app = await launch(newDbName());
    await createSession(app, 'รอบเช้า');
    await addNumber(app, 'x30', '123');
    await addNumber(app, 'x60', '321');
    await addNumber(app, 'x30', '007');
    expect(resultRows(app.root)).toEqual([
      ['123', '90', '2'],
      ['007', '30', '1'],
    ]);
    expect(app.root.querySelector('.result-summary')?.textContent).toContain('รายการทั้งหมด: 3');
  });

  it('keeps the data after the app is closed and opened again', async () => {
    const name = newDbName();
    const first = await launch(name);
    await createSession(first, 'รอบเช้า');
    await addNumber(first, 'x30', '123');
    await addNumber(first, 'x60', '321');
    await addNumber(first, 'x30', '007');
    close(first);

    const second = await launch(name);
    await vi.waitFor(() => expect(sessionRows(second.root)).toHaveLength(1));
    await openSession(second, 'รอบเช้า');
    expect(chips(second.root, 'x30')).toEqual(['007', '123']);
    expect(chips(second.root, 'x60')).toEqual(['321']);
    expect(resultRows(second.root)).toEqual([
      ['123', '90', '2'],
      ['007', '30', '1'],
    ]);
  });

  it('also saves edits and deletions across a restart', async () => {
    const name = newDbName();
    const first = await launch(name);
    await createSession(first, 'S');
    await addNumber(first, 'x30', '123');
    await addNumber(first, 'x30', '456');
    await addNumber(first, 'x60', '789');

    chipButton(first.root, 'x30', '123').click();
    modalInput().value = '999';
    buttonByText(document.body, 'บันทึก').click();
    await vi.waitFor(() => expect(chips(first.root, 'x30')).toEqual(['456', '999']));

    chipButton(first.root, 'x30', '456').click();
    buttonByText(document.body, 'ลบ').click();
    await vi.waitFor(() => expect(chips(first.root, 'x30')).toEqual(['999']));
    close(first);

    const second = await launch(name);
    await vi.waitFor(() => expect(sessionRows(second.root)).toHaveLength(1));
    await openSession(second, 'S');
    expect(chips(second.root, 'x30')).toEqual(['999']);
    expect(chips(second.root, 'x60')).toEqual(['789']);
    expect(resultRows(second.root)).toEqual([
      ['789', '60', '1'],
      ['999', '30', '1'],
    ]);
  });

  it('keeps two sessions separate after a restart', async () => {
    const name = newDbName();
    const first = await launch(name);
    await createSession(first, 'A');
    await addNumber(first, 'x30', '111');
    await showHome(first);
    await createSession(first, 'B');
    await addNumber(first, 'x60', '222');
    await addNumber(first, 'x60', '333');
    close(first);

    const second = await launch(name);
    await vi.waitFor(() => expect(sessionRows(second.root)).toHaveLength(2));
    await openSession(second, 'A');
    expect(resultRows(second.root)).toEqual([['111', '30', '1']]);

    await showHome(second);
    await vi.waitFor(() => expect(sessionRows(second.root)).toHaveLength(2));
    await openSession(second, 'B');
    expect(resultRows(second.root)).toEqual([
      ['222', '60', '1'],
      ['333', '60', '1'],
    ]);
  });

  it('backs up from one database and restores into a fresh one with identical results', async () => {
    const original = await launch(newDbName());
    await createSession(original, 'รอบเช้า');
    await addNumber(original, 'x30', '007');
    await addNumber(original, 'x30', '007');
    await addNumber(original, 'x60', '123');
    await showHome(original);
    buttonByText(original.root, 'สำรองข้อมูล').click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].filename).toBe('tote-backup-2026-11-05.json');
    close(original);

    const fresh = await launch(newDbName());
    await vi.waitFor(() => expect(fresh.root.textContent).toContain('ยังไม่มีชุดข้อมูล'));
    pickFile = async () => saved[0].text;
    buttonByText(fresh.root, 'กู้คืนข้อมูล').click();
    await vi.waitFor(() => expect(buttonByText(document.body, 'เพิ่มเข้าไป')).toBeTruthy());
    buttonByText(document.body, 'เพิ่มเข้าไป').click();
    await vi.waitFor(() => expect(sessionRows(fresh.root)).toHaveLength(1));

    await openSession(fresh, 'รอบเช้า');
    expect(chips(fresh.root, 'x30')).toEqual(['007', '007']);
    expect(chips(fresh.root, 'x60')).toEqual(['123']);
    expect(resultRows(fresh.root)).toEqual([
      ['007', '60', '2'],
      ['123', '60', '1'],
    ]);
  });

  it('shows a clear message when the database cannot be opened', async () => {
    const db = new ToteDatabase(newDbName());
    vi.spyOn(db, 'open').mockRejectedValue(new Error('blocked'));
    const root = document.createElement('div');
    document.body.append(root);
    await startApp(root, makeDeps(db));
    expect(root.textContent).toContain('เปิดแอปไม่สำเร็จ');
    expect(root.textContent).toContain('blocked');
  });

  it('shows a not-found message with a way back for an unknown session address', async () => {
    const app = await launch(newDbName(), '#/session/999');
    await vi.waitFor(() => expect(app.root.textContent).toContain('ไม่พบชุดข้อมูลหมายเลข 999'));
    const back = [...app.root.querySelectorAll('a')].find((a) => a.textContent === 'กลับหน้าหลัก')!;
    expect(back.getAttribute('href')).toBe('#/');
  });

  it('stop() removes the hashchange listener, so a closed app never redraws', async () => {
    const app = await launch(newDbName());
    await vi.waitFor(() => expect(app.root.textContent).toContain('ยังไม่มีชุดข้อมูล'));

    goTo('#/session/999'); // control: while running, the app reacts
    await vi.waitFor(() => expect(app.root.textContent).toContain('ไม่พบชุดข้อมูลหมายเลข 999'));
    await showHome(app);

    app.stop();
    const before = app.root.textContent;
    goTo('#/session/999');
    await sleep(50);
    expect(app.root.textContent).toBe(before);
    expect(app.root.textContent).not.toContain('ไม่พบ');
  });

  it('shows the storage status line from the browser storage API', async () => {
    const app = await launch(newDbName());
    await vi.waitFor(() => expect(app.root.textContent).toContain('ที่เก็บข้อมูล: ถาวร'));
  });

    it('asks before removing entries of a retired column, then runs normally', async () => {
    const name = newDbName();
    await seedRetiredColumn(name);
    const pending = launch(name); // waits for the user's answer, so it is not awaited yet
    await vi.waitFor(() => expect(buttonByText(document.body, 'ลบรายการ x210')).toBeTruthy());
    buttonByText(document.body, 'ลบรายการ x210').click();
    const app = await pending;
    await vi.waitFor(() => expect(sessionRows(app.root)).toHaveLength(1));
    await openSession(app, 'เก่า');
    expect(chips(app.root, 'x30')).toEqual(['123']);
    expect(resultRows(app.root)).toEqual([['123', '30', '1']]);
  });

  it('stays blocked with the data untouched when the user declines', async () => {
    const name = newDbName();
    await seedRetiredColumn(name);
    const pending = launch(name);
    await vi.waitFor(() => expect(buttonByText(document.body, 'ยังไม่ลบ')).toBeTruthy());
    buttonByText(document.body, 'ยังไม่ลบ').click();
    const app = await pending;
    expect(app.root.textContent).toContain('ยังใช้งานไม่ได้');
    expect(await app.db.entries.count()).toBe(2);
  });
});