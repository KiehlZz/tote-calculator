// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';
import { ToteDatabase } from '../src/db/db';
import { el } from '../src/ui/dom';

describe('DOM test environment', () => {
  it('builds elements with a class and text', () => {
    const node = el('div', 'box', 'hello');
    document.body.append(node);
    expect(document.querySelector('.box')?.textContent).toBe('hello');
    node.remove();
  });

  it('never parses string children as HTML', () => {
    const node = el('p', '', '<b>bold</b>');
    expect(node.querySelector('b')).toBeNull();
    expect(node.textContent).toBe('<b>bold</b>');
  });

  it('runs Dexie on fake-indexeddb inside the DOM environment', async () => {
    const name = 'tote-dom-env-test';
    const db = new ToteDatabase(name);
    try {
      const id = await db.sessions.add({ name: 'x', createdAt: 'a', updatedAt: 'a' });
      expect((await db.sessions.get(id))?.name).toBe('x');
    } finally {
      db.close();
      await Dexie.delete(name);
    }
  });
});