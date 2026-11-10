import { exportBackup, importBackup } from '../db/backup';
import { db as defaultDb, type ToteDatabase } from '../db/db';
import { createEntryRepo } from '../db/entryRepo';
import { createSessionRepo } from '../db/sessionRepo';
import type { Clock } from '../db/types';
import { requestPersistence, type StorageApi } from '../utils/storage';
import { loadCalculator, mountCalculator } from './calculatorView';
import { el } from './dom';
import { pickTextFile, saveTextFile } from './files';
import { renderHome, type BackupDeps } from './homeView';
import { parseRoute } from './router';
import { resolveLegacyEntries } from './legacyGate';

const APP_NAME = 'เครื่องคิดเลขโต๊ด';

function buildHeader(): HTMLElement {
  return el('header', 'app-header', el('h1', '', APP_NAME));
}

function renderFatal(root: HTMLElement, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  root.replaceChildren(
    buildHeader(),
    el(
      'main',
      'screen',
      el('h2', '', 'เปิดแอปไม่สำเร็จ'),
      el('p', '', 'ไม่สามารถใช้ที่เก็บข้อมูลของเบราว์เซอร์นี้ได้ ลองปิดโหมดส่วนตัว หรือตรวจสอบการตั้งค่าที่เก็บข้อมูลของเบราว์เซอร์'),
      el('p', 'muted', detail),
    ),
  );
}

function notFoundView(id: number): HTMLElement[] {
  const back = el('a', 'btn', 'กลับหน้าหลัก');
  back.setAttribute('href', '#/');
  return [el('p', '', `ไม่พบชุดข้อมูลหมายเลข ${id}`), back];
}

function renderBlocked(root: HTMLElement): void {
  root.replaceChildren(
    buildHeader(),
    el(
      'main',
      'screen',
      el('h2', '', 'ยังใช้งานไม่ได้'),
      el('p', '', 'ต้องลบรายการของคอลัมน์ที่เลิกใช้แล้วก่อน ข้อมูลของคุณยังไม่ถูกเปลี่ยนแปลง ปิดแอปแล้วเปิดใหม่เพื่อเลือกอีกครั้ง'),
    ),
  );
}

// Everything the app needs from the outside world, so tests can swap it.
export interface AppDeps {
  db: ToteDatabase;
  storage: StorageApi | undefined;
  saveFile: BackupDeps['saveFile'];
  pickFile: BackupDeps['pickFile'];
  now: BackupDeps['now'];
  clock?: Clock;
}

export interface AppHandle {
  stop: () => void;
}

export function browserDeps(): AppDeps {
  return {
    db: defaultDb,
    storage: navigator.storage,
    saveFile: saveTextFile,
    pickFile: pickTextFile,
    now: () => new Date(),
  };
}

export async function startApp(root: HTMLElement, deps: AppDeps = browserDeps()): Promise<AppHandle> {
  const { db } = deps;

  try {
    await db.open();
  } catch (error) {
    renderFatal(root, error);
    return { stop: () => {} };
  }

  try {
    const gate = await resolveLegacyEntries({ db, saveFile: deps.saveFile, now: deps.now, clock: deps.clock });
    if (gate === 'blocked') {
      renderBlocked(root);
      return { stop: () => {} };
    }
  } catch (error) {
    renderFatal(root, error);
    return { stop: () => {} };
  }

  const sessions = createSessionRepo(db, deps.clock);
  const entries = createEntryRepo(db, deps.clock);

  // asked once per app launch, in the background
  const storageStatus = requestPersistence(deps.storage);

  const backup: BackupDeps = {
    exportBackup: () => exportBackup(db, deps.clock),
    importBackup: (data, mode) => importBackup(db, data, mode),
    saveFile: deps.saveFile,
    pickFile: deps.pickFile,
    now: deps.now,
  };

  const main = el('main', 'screen');
  root.replaceChildren(buildHeader(), main);

  const navigate = (hash: string): void => {
    window.location.hash = hash;
  };

  let token = 0;
  const render = async (): Promise<void> => {
    const mine = ++token;
    try {
      const route = parseRoute(window.location.hash);
      if (route.name === 'home') {
        await renderHome(main, { sessions, navigate, backup, storageStatus });
      } else {
        const data = await loadCalculator(sessions, entries, route.id);
        if (mine !== token) return; // a newer navigation started while we were reading
        if (data) {
          mountCalculator(main, data, { entries });
        } else {
          main.replaceChildren(...notFoundView(route.id));
        }
      }
    } catch (error) {
      if (mine === token) renderFatal(root, error);
    }
  };

  const onHashChange = (): void => {
    void render();
  };
  window.addEventListener('hashchange', onHashChange);
  await render();

  return {
    stop: () => {
      token += 1; // a render that is still reading must not draw any more
      window.removeEventListener('hashchange', onHashChange);
    },
  };
}