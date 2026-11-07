export type StorageStatus = 'persistent' | 'not-persistent' | 'unknown';

export interface StorageApi {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

export const STORAGE_CHECKING_MESSAGE = 'ที่เก็บข้อมูล: กำลังตรวจสอบ...';

// Asks the browser to keep our data when the device runs low on space.
// Never throws, and calls persist() at most once per call.
export async function requestPersistence(storage: StorageApi | undefined): Promise<StorageStatus> {
  if (!storage || typeof storage.persisted !== 'function') return 'unknown';

  let already: boolean;
  try {
    already = await storage.persisted();
  } catch {
    return 'unknown';
  }
  if (already) return 'persistent';

  if (typeof storage.persist !== 'function') return 'not-persistent';
  try {
    return (await storage.persist()) ? 'persistent' : 'not-persistent';
  } catch {
    return 'not-persistent';
  }
}

export function storageMessage(status: StorageStatus): string {
  switch (status) {
    case 'persistent':
      return 'ที่เก็บข้อมูล: ถาวร เบราว์เซอร์จะไม่ลบข้อมูลเองเมื่อพื้นที่เครื่องเต็ม แต่การล้างข้อมูลเว็บไซต์ยังลบได้ ควรสำรองข้อมูลเป็นครั้งคราว';
    case 'not-persistent':
      return 'ที่เก็บข้อมูล: ปกติ เบราว์เซอร์อาจลบข้อมูลเมื่อพื้นที่เครื่องเต็ม ควรสำรองข้อมูลเป็นระยะ';
    case 'unknown':
      return 'ที่เก็บข้อมูล: ตรวจสอบสถานะไม่ได้ ควรสำรองข้อมูลเป็นระยะ';
  }
}