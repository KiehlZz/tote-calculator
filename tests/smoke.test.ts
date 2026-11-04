import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

describe('toolchain smoke test', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });

  it('provides indexedDB through fake-indexeddb', () => {
    expect(typeof indexedDB.open).toBe('function');
  });
});