import type { SessionRepo } from '../db/sessionRepo';
import type { Session } from '../db/types';
import { formatThaiDate, formatThaiDateTime } from '../utils/thaiDate';
import { confirmDialog, promptDialog } from './dialog';
import { button, el } from './dom';
import { validateSessionName } from './helpers';

export interface HomeDeps {
  sessions: SessionRepo;
  navigate: (hash: string) => void;
}

export async function renderHome(main: HTMLElement, deps: HomeDeps): Promise<void> {
  const { sessions, navigate } = deps;

  const banner = el('div', 'banner');
  banner.setAttribute('role', 'alert');
  banner.hidden = true;
  const list = el('div', 'session-list');

  function showError(message: string): void {
    banner.textContent = message;
    banner.hidden = false;
  }

  function clearError(): void {
    banner.textContent = '';
    banner.hidden = true;
  }

  async function attempt(action: () => Promise<void>, failMessage: string): Promise<void> {
    clearError();
    try {
      await action();
    } catch (error) {
      console.error(error);
      showError(failMessage);
    }
  }

  async function refresh(): Promise<void> {
    const all = await sessions.list();
    list.replaceChildren(...(all.length === 0 ? [buildEmptyState()] : all.map(buildRow)));
  }

  function buildEmptyState(): HTMLElement {
    return el(
      'div',
      'empty',
      el('p', '', 'ยังไม่มีชุดข้อมูล'),
      el('p', 'muted', 'กดปุ่ม “สร้างชุดข้อมูลใหม่” เพื่อเริ่มต้น'),
    );
  }

  function buildRow(session: Session): HTMLElement {
    const open = el('a', 'btn btn-primary', 'เปิด');
    open.setAttribute('href', `#/session/${session.id}`);
    open.setAttribute('aria-label', `เปิด ${session.name}`);

    const rename = button('เปลี่ยนชื่อ', 'btn', () => void onRename(session));
    rename.setAttribute('aria-label', `เปลี่ยนชื่อ ${session.name}`);

    const remove = button('ลบ', 'btn btn-danger', () => void onDelete(session));
    remove.setAttribute('aria-label', `ลบ ${session.name}`);

    return el(
      'article',
      'session-row',
      el(
        'div',
        'session-info',
        el('h3', 'session-name', session.name),
        el(
          'p',
          'muted',
          `สร้างเมื่อ ${formatThaiDate(session.createdAt)} · แก้ไขล่าสุด ${formatThaiDateTime(session.updatedAt)}`,
        ),
      ),
      el('div', 'session-actions', open, rename, remove),
    );
  }

  async function onCreate(): Promise<void> {
    const name = await promptDialog({
      title: 'สร้างชุดข้อมูลใหม่',
      label: 'ชื่อชุดข้อมูล',
      placeholder: 'เช่น รอบเช้า',
      confirmLabel: 'สร้าง',
      validate: validateSessionName,
    });
    if (name === null) return;
    await attempt(async () => {
      const created = await sessions.create(name);
      navigate(`#/session/${created.id}`);
    }, 'สร้างชุดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง');
  }

  async function onRename(session: Session): Promise<void> {
    const name = await promptDialog({
      title: 'เปลี่ยนชื่อชุดข้อมูล',
      label: 'ชื่อชุดข้อมูล',
      initialValue: session.name,
      confirmLabel: 'บันทึก',
      validate: validateSessionName,
    });
    if (name === null || name.trim() === session.name) return;
    await attempt(async () => {
      await sessions.rename(session.id, name);
      await refresh();
    }, 'เปลี่ยนชื่อไม่สำเร็จ กรุณาลองอีกครั้ง');
  }

  async function onDelete(session: Session): Promise<void> {
    const confirmed = await confirmDialog({
      title: 'ลบชุดข้อมูลนี้ใช่หรือไม่',
      message: `ชุด “${session.name}” และเลขทั้งหมดในชุดนี้จะถูกลบถาวร กู้คืนไม่ได้`,
      confirmLabel: 'ลบชุดข้อมูล',
      danger: true,
    });
    if (!confirmed) return;
    await attempt(async () => {
      await sessions.remove(session.id);
      await refresh();
    }, 'ลบไม่สำเร็จ กรุณาลองอีกครั้ง');
  }

  main.replaceChildren(
    el('div', 'toolbar', el('h2', '', 'ชุดข้อมูล'), button('สร้างชุดข้อมูลใหม่', 'btn btn-primary', () => void onCreate())),
    banner,
    list,
  );
  await refresh();
}