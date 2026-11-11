import {
  BackupError,
  backupFileName,
  parseBackup,
  serializeBackup,
  type BackupFile,
  type ImportMode,
  type ImportResult,
} from '../db/backup';
import type { SessionRepo } from '../db/sessionRepo';
import { sessionMode, type Session } from '../db/types';
import type { Mode } from '../domain/columns';
import { formatThaiDate, formatThaiDateTime } from '../utils/thaiDate';
import { choiceDialog, confirmDialog, promptDialog } from './dialog';
import { button, el } from './dom';
import { modeLabel, validateSessionName } from './helpers';
import { STORAGE_CHECKING_MESSAGE, storageMessage, type StorageStatus } from '../utils/storage';
import { APP_VERSION } from '../version';

export interface BackupDeps {
  exportBackup: () => Promise<BackupFile>;
  importBackup: (backup: BackupFile, mode: ImportMode) => Promise<ImportResult>;
  // true when the file was handed to the system, false when the user cancelled
  saveFile: (filename: string, text: string) => Promise<boolean>;
  // the file text, or null when the user cancelled
  pickFile: () => Promise<string | null>;
  now: () => Date;
}

export interface HomeDeps {
  sessions: SessionRepo;
  navigate: (hash: string) => void;
  backup: BackupDeps;
  storageStatus: Promise<StorageStatus>;
}

function countEntries(data: BackupFile): number {
  return data.sessions.reduce((sum, s) => sum + s.entries.length, 0);
}

export async function renderHome(main: HTMLElement, deps: HomeDeps): Promise<void> {
  const { sessions, navigate, backup, storageStatus } = deps;

  const banner = el('div', 'banner');
  banner.setAttribute('role', 'alert');
  banner.hidden = true;
  const status = el('div', 'status');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const list = el('div', 'session-list');

  function showError(message: string): void {
    banner.textContent = message;
    banner.hidden = false;
  }

  function showStatus(message: string): void {
    status.textContent = message;
    status.hidden = false;
  }

  function clearMessages(): void {
    banner.textContent = '';
    banner.hidden = true;
    status.textContent = '';
    status.hidden = true;
  }

  function fail(message: string, error: unknown): void {
    console.error(error);
    showError(message);
  }

  async function attempt(action: () => Promise<void>, failMessage: string): Promise<void> {
    clearMessages();
    try {
      await action();
    } catch (error) {
      fail(failMessage, error);
    }
  }

  // backup and restore never run at the same time, and a second tap is ignored
  let busy = false;
  async function exclusive(task: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await task();
    } finally {
      busy = false;
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
      el('p', 'muted', 'กดปุ่ม “สร้างชุด 3 ตัว” หรือ “สร้างชุด 4 ตัว” เพื่อเริ่มต้น'),
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
        el('span', 'badge', modeLabel(sessionMode(session))),
        el(
          'p',
          'muted',
          `สร้างเมื่อ ${formatThaiDate(session.createdAt)} · แก้ไขล่าสุด ${formatThaiDateTime(session.updatedAt)}`,
        ),
      ),
      el('div', 'session-actions', open, rename, remove),
    );
  }

  async function onCreate(mode: Mode = 3): Promise<void> {
    const name = await promptDialog({
      title: mode === 4 ? 'สร้างชุดข้อมูล 4 ตัวใหม่' : 'สร้างชุดข้อมูล 3 ตัวใหม่',
      label: 'ชื่อชุดข้อมูล',
      placeholder: 'เช่น รอบเช้า',
      confirmLabel: 'สร้าง',
      validate: validateSessionName,
    });
    if (name === null) return;
    await attempt(async () => {
      const created = await sessions.create(name, mode);
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

  async function onBackup(): Promise<void> {
    clearMessages();
    try {
      const data = await backup.exportBackup();
      if (data.sessions.length === 0) {
        showError('ยังไม่มีข้อมูลให้สำรอง');
        return;
      }
      const filename = backupFileName(backup.now());
      const saved = await backup.saveFile(filename, serializeBackup(data));
      if (saved) {
        showStatus(
          `สร้างไฟล์สำรอง ${filename} แล้ว (${data.sessions.length} ชุด ${countEntries(data)} รายการ) กรุณาตรวจสอบว่าไฟล์ถูกบันทึกในเครื่อง`,
        );
      }
    } catch (error) {
      fail('สำรองข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง', error);
    }
  }

  async function onRestore(): Promise<void> {
    clearMessages();

    let text: string | null;
    try {
      text = await backup.pickFile();
    } catch (error) {
      fail('อ่านไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง', error);
      return;
    }
    if (text === null) return;

    let data: BackupFile;
    try {
      data = parseBackup(text);
    } catch (error) {
      if (error instanceof BackupError) {
        showError(`ไฟล์สำรองไม่ถูกต้อง จึงไม่มีการเปลี่ยนแปลงข้อมูล (${error.message})`);
      } else {
        fail('อ่านไฟล์สำรองไม่สำเร็จ', error);
      }
      return;
    }
    if (data.sessions.length === 0) {
      showError('ไฟล์สำรองนี้ไม่มีข้อมูล จึงไม่มีการเปลี่ยนแปลง');
      return;
    }

    const mode = await choiceDialog<ImportMode>({
      title: 'กู้คืนข้อมูลจากไฟล์สำรอง',
      message: `พบ ${data.sessions.length} ชุด ${countEntries(data)} รายการ (สำรองเมื่อ ${formatThaiDateTime(data.exportedAt)}) ต้องการนำเข้าอย่างไร`,
      choices: [
        { label: 'เพิ่มเข้าไป', value: 'merge', className: 'btn btn-primary' },
        { label: 'แทนที่ทั้งหมด', value: 'replace', className: 'btn btn-danger' },
      ],
    });
    if (mode === null) return;

    if (mode === 'replace') {
      let current: number;
      try {
        current = (await sessions.list()).length;
      } catch (error) {
        fail('กู้คืนข้อมูลไม่สำเร็จ ข้อมูลเดิมไม่ถูกเปลี่ยนแปลง', error);
        return;
      }
      const confirmed = await confirmDialog({
        title: 'แทนที่ข้อมูลทั้งหมดใช่หรือไม่',
        message: `ข้อมูลปัจจุบัน ${current} ชุด จะถูกลบทั้งหมดแล้วแทนที่ด้วยข้อมูลจากไฟล์สำรอง กู้คืนไม่ได้`,
        confirmLabel: 'แทนที่ทั้งหมด',
        danger: true,
      });
      if (!confirmed) return;
    }

    let result: ImportResult;
    try {
      result = await backup.importBackup(data, mode);
    } catch (error) {
      fail('กู้คืนข้อมูลไม่สำเร็จ ข้อมูลเดิมไม่ถูกเปลี่ยนแปลง', error);
      return;
    }
    try {
      await refresh();
    } catch (error) {
      fail('กู้คืนแล้ว แต่แสดงรายการไม่สำเร็จ กรุณารีเฟรชหน้า', error);
      return;
    }
    showStatus(`กู้คืนสำเร็จ: ${result.sessions} ชุด ${result.entries} รายการ`);
  }

  const storageNote = el('p', 'muted storage-note', STORAGE_CHECKING_MESSAGE);
  storageNote.setAttribute('role', 'status');
  // deliberately not awaited: the list must never wait for the browser's answer
  storageStatus.then(
    (status) => {
      storageNote.textContent = storageMessage(status);
    },
    () => {
      storageNote.textContent = storageMessage('unknown');
    },
  );

  main.replaceChildren(
    el(
      'div',
      'toolbar',
      el('h2', '', 'ชุดข้อมูล'),
      el(
        'div',
        'toolbar-actions',
        button('สำรองข้อมูล', 'btn', () => void exclusive(onBackup)),
        button('กู้คืนข้อมูล', 'btn', () => void exclusive(onRestore)),
        button('สร้างชุด 3 ตัว', 'btn btn-primary', () => void onCreate(3)),
        button('สร้างชุด 4 ตัว', 'btn btn-primary', () => void onCreate(4)),
      ),
    ),
    banner,
    status,
    list,
    storageNote,
    el('p', 'muted version-note', `เวอร์ชัน ${APP_VERSION}`),
  );
  await refresh();
}