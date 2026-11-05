import { db } from '../db/db';
import { createSessionRepo } from '../db/sessionRepo';
import { el } from './dom';
import { parseRoute } from './router';

const APP_NAME = 'เครื่องคิดเลขโต๊ด';

function shell(...content: (Node | string)[]): HTMLElement[] {
  return [
    el('header', 'app-header', el('h1', '', APP_NAME)),
    el('main', 'screen', ...content),
  ];
}

function link(href: string, label: string): HTMLAnchorElement {
  const a = el('a', 'btn', label);
  a.setAttribute('href', href);
  return a;
}

function renderFatal(root: HTMLElement, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  root.replaceChildren(
    ...shell(
      el('h2', '', 'เปิดแอปไม่สำเร็จ'),
      el('p', '', 'ไม่สามารถใช้ที่เก็บข้อมูลของเบราว์เซอร์นี้ได้ ลองปิดโหมดส่วนตัว หรือตรวจสอบการตั้งค่าที่เก็บข้อมูลของเบราว์เซอร์'),
      el('p', 'muted', detail),
    ),
  );
}

// TEMPORARY placeholder screens, replaced in steps 3 and 4
function homeView(sessionCount: number): HTMLElement[] {
  return shell(
    el('p', '', `จำนวนชุดข้อมูล: ${sessionCount}`),
    link('#/session/1', 'ทดสอบเปิดชุดที่ 1'),
  );
}

function sessionView(id: number, name: string | undefined): HTMLElement[] {
  const body = name === undefined ? el('p', '', `ไม่พบชุดข้อมูลหมายเลข ${id}`) : el('p', '', `ชุดที่ ${id}: ${name}`);
  return shell(body, link('#/', 'กลับหน้าหลัก'));
}

export async function startApp(root: HTMLElement): Promise<void> {
  try {
    await db.open();
  } catch (error) {
    renderFatal(root, error);
    return;
  }

  const sessions = createSessionRepo(db);
  let token = 0;

  const render = async (): Promise<void> => {
    const mine = ++token;
    try {
      const route = parseRoute(window.location.hash);
      if (route.name === 'home') {
        const count = (await sessions.list()).length;
        if (mine !== token) return; // a newer navigation started while we were reading
        root.replaceChildren(...homeView(count));
      } else {
        const session = await sessions.get(route.id);
        if (mine !== token) return;
        root.replaceChildren(...sessionView(route.id, session?.name));
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