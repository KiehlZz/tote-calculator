import { describe, expect, it, vi } from 'vitest';
import { requestPersistence, storageMessage, type StorageStatus } from '../src/utils/storage';

describe('requestPersistence', () => {
  it('reports unknown when the browser has no storage API', async () => {
    expect(await requestPersistence(undefined)).toBe('unknown');
  });

  it('reports unknown when persisted() is missing', async () => {
    expect(await requestPersistence({})).toBe('unknown');
  });

  it('does not ask again when storage is already persistent', async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistence({ persisted: async () => true, persist })).toBe('persistent');
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks once and reports persistent when the browser agrees', async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistence({ persisted: async () => false, persist })).toBe('persistent');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('asks once and reports not-persistent when the browser refuses', async () => {
    const persist = vi.fn(async () => false);
    expect(await requestPersistence({ persisted: async () => false, persist })).toBe('not-persistent');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('reports not-persistent when persist() does not exist', async () => {
    expect(await requestPersistence({ persisted: async () => false })).toBe('not-persistent');
  });

  it('reports unknown, and does not ask, when persisted() rejects', async () => {
    const persist = vi.fn(async () => true);
    const persisted = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await requestPersistence({ persisted, persist })).toBe('unknown');
    expect(persist).not.toHaveBeenCalled();
  });

  it('reports unknown when persisted() throws synchronously', async () => {
    const persisted = () => {
      throw new Error('boom');
    };
    expect(await requestPersistence({ persisted: persisted as never })).toBe('unknown');
  });

  it('reports not-persistent when persist() rejects', async () => {
    const persist = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await requestPersistence({ persisted: async () => false, persist })).toBe('not-persistent');
  });
});

describe('storageMessage', () => {
  it.each<StorageStatus>(['persistent', 'not-persistent', 'unknown'])(
    'mentions the storage and suggests a backup when %s',
    (status) => {
      const message = storageMessage(status);
      expect(message).toContain('ที่เก็บข้อมูล');
      expect(message).toContain('สำรอง');
    },
  );

  it('has a different, accurate message for each status', () => {
    expect(storageMessage('persistent')).toContain('ถาวร');
    expect(storageMessage('not-persistent')).toContain('อาจลบข้อมูล');
    const all = new Set([storageMessage('persistent'), storageMessage('not-persistent'), storageMessage('unknown')]);
    expect(all.size).toBe(3);
  });
});