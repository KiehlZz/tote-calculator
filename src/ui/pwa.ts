import type { registerSW } from 'virtual:pwa-register';
import { button, el } from './dom';

export type RegisterFn = typeof registerSW;

export interface PwaDeps {
  register: RegisterFn;
  body: HTMLElement;
}

type Kind = 'offline' | 'update' | 'error';

// Shows one small bar at the bottom of the page for service worker events.
export function setupPwa({ register, body }: PwaDeps): void {
  const bar = el('div', 'pwa-bar');
  bar.setAttribute('role', 'status');
  bar.hidden = true;
  body.append(bar);

  let current: Kind | null = null;
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

  function show(kind: Kind, message: string, actions: HTMLElement[]): void {
    current = kind;
    bar.replaceChildren(el('p', 'pwa-text', message), el('div', 'pwa-actions', ...actions));
    bar.hidden = false;
    body.classList.add('has-pwa-bar');
  }

  function hide(): void {
    current = null;
    bar.replaceChildren();
    bar.hidden = true;
    body.classList.remove('has-pwa-bar');
  }

  function showError(message: string): void {
    show('error', message, [button('ตกลง', 'btn', hide)]);
  }

  function showOffline(): void {
    if (current === 'update') return; // never hide a pending update
    show('offline', 'พร้อมใช้งานออฟไลน์แล้ว เปิดแอปได้แม้ไม่มีอินเทอร์เน็ต', [button('ตกลง', 'btn', hide)]);
  }

  async function applyUpdate(): Promise<void> {
    try {
      if (!updateSW) throw new Error('service worker is not registered');
      await updateSW(true);
    } catch (error) {
      console.error(error);
      showError('อัปเดตไม่สำเร็จ กรุณาปิดแล้วเปิดแอปใหม่');
    }
  }

  function showUpdate(): void {
    const later = button('ไว้ทีหลัง', 'btn', hide);
    const update = button('อัปเดตตอนนี้', 'btn btn-primary', () => {
      if (update.disabled) return;
      update.disabled = true;
      later.disabled = true;
      void applyUpdate();
    });
    show(
      'update',
      'มีเวอร์ชันใหม่ของแอป อัปเดตแล้วหน้าจะโหลดใหม่ เลขที่ยังกรอกไม่ครบ 3 หลักจะหายไป',
      [later, update],
    );
  }

  function onRegisterError(error: unknown): void {
    console.error(error);
    showError('ใช้งานออฟไลน์ไม่ได้ในเบราว์เซอร์นี้ แต่ยังใช้แอปตามปกติได้');
  }

  try {
    updateSW = register({
      immediate: true,
      onNeedRefresh: showUpdate,
      onOfflineReady: showOffline,
      onRegisterError,
    });
  } catch (error) {
    onRegisterError(error);
  }
}