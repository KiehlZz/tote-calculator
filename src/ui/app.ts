import { db } from '../db/db';
import { exportBackup, importBackup } from '../db/backup';
import { createEntryRepo } from '../db/entryRepo';
import { createSessionRepo } from '../db/sessionRepo';
import { loadCalculator, mountCalculator } from './calculatorView';
import { el } from './dom';
import { pickTextFile, saveTextFile } from './files';
import { renderHome, type BackupDeps } from './homeView';
import { parseRoute } from './router';
import { requestPersistence } from '../utils/storage';

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

export async function startApp(root: HTMLElement): Promise<void> {
  try {
    await db.open();
  } catch (error) {
    renderFatal(root, error);
    return;
  }

  const sessions = createSessionRepo(db);
  const entries = createEntryRepo(db);
  // asked once per app launch, in the background
  const storageStatus = requestPersistence(navigator.storage);
  const backup: BackupDeps = {
    exportBackup: () => exportBackup(db),
    importBackup: (data, mode) => importBackup(db, data, mode),
    saveFile: saveTextFile,
    pickFile: pickTextFile,
    now: () => new Date(),
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

  window.addEventListener('hashchange', () => {
    void render();
  });
  await render();
}