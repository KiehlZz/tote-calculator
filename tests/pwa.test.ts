// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPwa } from '../src/ui/pwa';

type Options = {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisterError?: (error: unknown) => void;
};

let options: Options;
let updateSW: ReturnType<typeof vi.fn>;
let register: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.replaceChildren();
  document.body.className = '';
  options = {};
  updateSW = vi.fn(async () => {});
  register = vi.fn((given: Options) => {
    options = given;
    return updateSW;
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mount = () => setupPwa({ register: register as never, body: document.body });
const bar = () => document.body.querySelector('.pwa-bar') as HTMLElement;
const text = () => bar().querySelector('.pwa-text')!.textContent;
const buttons = () => [...bar().querySelectorAll('button')] as HTMLButtonElement[];
const click = (label: string) => buttons().find((b) => b.textContent === label)!.click();
const hasPadding = () => document.body.classList.contains('has-pwa-bar');

describe('PWA notices', () => {
  it('registers once with immediate registration and starts hidden', () => {
    mount();
    expect(register).toHaveBeenCalledTimes(1);
    expect(options.immediate).toBe(true);
    expect(bar().hidden).toBe(true);
    expect(hasPadding()).toBe(false);
  });

  it('tells the user the app is ready offline, and the notice can be dismissed', () => {
    mount();
    options.onOfflineReady!();
    expect(bar().hidden).toBe(false);
    expect(text()).toContain('พร้อมใช้งานออฟไลน์แล้ว');
    expect(hasPadding()).toBe(true);
    click('ตกลง');
    expect(bar().hidden).toBe(true);
    expect(hasPadding()).toBe(false);
  });

  it('offers the update with both choices and warns about unfinished input', () => {
    mount();
    options.onNeedRefresh!();
    expect(text()).toContain('มีเวอร์ชันใหม่');
    expect(text()).toContain('ไม่ครบ 3 หลัก');
    expect(buttons().map((b) => b.textContent)).toEqual(['ไว้ทีหลัง', 'อัปเดตตอนนี้']);
    expect(updateSW).not.toHaveBeenCalled();
  });

  it('applies the update once even if the button is pressed twice', async () => {
    mount();
    options.onNeedRefresh!();
    click('อัปเดตตอนนี้');
    click('อัปเดตตอนนี้');
    await vi.waitFor(() => expect(updateSW).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(updateSW).toHaveBeenCalledTimes(1);
  });

  it('hides the notice without updating when the user chooses later', () => {
    mount();
    options.onNeedRefresh!();
    click('ไว้ทีหลัง');
    expect(bar().hidden).toBe(true);
    expect(hasPadding()).toBe(false);
    expect(updateSW).not.toHaveBeenCalled();
  });

  it('does not replace a pending update notice with the offline-ready one', () => {
    mount();
    options.onNeedRefresh!();
    options.onOfflineReady!();
    expect(text()).toContain('มีเวอร์ชันใหม่');
  });

  it('replaces the offline-ready notice when an update arrives', () => {
    mount();
    options.onOfflineReady!();
    options.onNeedRefresh!();
    expect(text()).toContain('มีเวอร์ชันใหม่');
  });

  it('shows an error when applying the update fails', async () => {
    updateSW = vi.fn(async () => {
      throw new Error('boom');
    });
    mount();
    options.onNeedRefresh!();
    click('อัปเดตตอนนี้');
    await vi.waitFor(() => expect(text()).toContain('อัปเดตไม่สำเร็จ'));
    expect(console.error).toHaveBeenCalled();
    click('ตกลง');
    expect(bar().hidden).toBe(true);
  });

  it('shows a short notice when registration fails, and the app keeps working', () => {
    mount();
    options.onRegisterError!(new Error('nope'));
    expect(text()).toContain('ใช้งานออฟไลน์ไม่ได้');
    expect(console.error).toHaveBeenCalled();
  });

  it('survives register() throwing', () => {
    register = vi.fn(() => {
      throw new Error('unsupported');
    });
    expect(() => mount()).not.toThrow();
    expect(text()).toContain('ใช้งานออฟไลน์ไม่ได้');
  });

  it('keeps a single bar however many messages arrive', () => {
    mount();
    options.onOfflineReady!();
    options.onNeedRefresh!();
    options.onRegisterError!(new Error('x'));
    expect(document.body.querySelectorAll('.pwa-bar')).toHaveLength(1);
  });
});