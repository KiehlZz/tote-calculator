import { db } from '../db/db';
import { createSessionRepo } from '../db/sessionRepo';
import { el } from './dom';
import { renderHome } from './homeView';
import { parseRoute } from './router';

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

// TEMPORARY placeholder, replaced in step 4
function sessionPlaceholder(id: number, name: string | undefined): HTMLElement[] {
  const back = el('a', 'btn', 'กลับหน้าหลัก');
  back.setAttribute('href', '#/');
  const message = name === undefined ? `ไม่พบชุดข้อมูลหมายเลข ${id}` : `ชุดที่ ${id}: ${name}`;
  return [el('p', '', message), back];
}

export async function startApp(root: HTMLElement): Promise<void> {
  try {
    await db.open();
  } catch (error) {
    renderFatal(root, error);
    return;
  }

  const sessions = createSessionRepo(db);
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
        await renderHome(main, { sessions, navigate });
      } else {
        const session = await sessions.get(route.id);
        if (mine !== token) return; // a newer navigation started while we were reading
        main.replaceChildren(...sessionPlaceholder(route.id, session?.name));
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