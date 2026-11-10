import { backupFileName, exportBackup, serializeBackup } from '../db/backup';
import type { ToteDatabase } from '../db/db';
import { findLegacyEntries, removeLegacyEntries } from '../db/legacy';
import type { Clock } from '../db/types';
import { choiceDialog } from './dialog';
import { columnLabel } from './helpers';

export interface LegacyDeps {
  db: ToteDatabase;
  saveFile: (filename: string, text: string) => Promise<boolean>;
  now: () => Date;
  clock?: Clock;
}

// The app cannot run while entries of a retired column exist. The user decides what happens to them.
export async function resolveLegacyEntries(deps: LegacyDeps): Promise<'ok' | 'blocked'> {
  const found = await findLegacyEntries(deps.db);
  if (found.entries === 0) return 'ok';

  const labels = found.multipliers.map(columnLabel).join(', ');
  let prefix = '';
  for (;;) {
    const choice = await choiceDialog<'archive' | 'remove'>({
      title: `พบข้อมูลของคอลัมน์ที่เลิกใช้แล้ว (${labels})`,
      message:
        `${prefix}ในเครื่องนี้มี ${found.entries} รายการใน ${found.sessions} ชุดที่อยู่ในคอลัมน์ ${labels} ซึ่งไม่มีในเวอร์ชันนี้แล้ว ` +
        'ต้องลบรายการเหล่านี้จึงจะใช้งานต่อได้ (รายการในคอลัมน์อื่นไม่ถูกลบ) ' +
        'กด "เก็บไฟล์ไว้ดู" เพื่อบันทึกไฟล์ก่อนลบ ไฟล์นี้ใช้เปิดอ่านเท่านั้น กู้คืนเข้าแอปเวอร์ชันนี้ไม่ได้',
      choices: [
        { label: 'เก็บไฟล์ไว้ดู', value: 'archive' },
        { label: `ลบรายการ ${labels}`, value: 'remove', className: 'btn btn-danger' },
      ],
      cancelLabel: 'ยังไม่ลบ',
    });
    if (choice === null) return 'blocked';
    if (choice === 'remove') {
      await removeLegacyEntries(deps.db, deps.clock);
      return 'ok';
    }
    try {
      const data = await exportBackup(deps.db, deps.clock);
      await deps.saveFile(backupFileName(deps.now()), serializeBackup(data));
      prefix = 'บันทึกไฟล์แล้ว ';
    } catch (error) {
      console.error(error);
      prefix = 'บันทึกไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง ';
    }
  }
}