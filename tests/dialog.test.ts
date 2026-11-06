// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmDialog } from '../src/ui/dialog';

const options = {
  title: 'ลบชุดข้อมูลนี้ใช่หรือไม่',
  message: 'ข้อความ',
  confirmLabel: 'ลบชุดข้อมูล',
  danger: true,
};

const modal = () => document.body.querySelector('.modal') as HTMLElement;
const buttonByText = (text: string) =>
  [...document.body.querySelectorAll('.modal button')].find((b) => b.textContent === text) as HTMLButtonElement;
const press = (key: string, shiftKey = false) => {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  // close any dialog a test left open, so its document listener is removed
  document.body.querySelector<HTMLButtonElement>('.modal button')?.click();
  document.body.replaceChildren();
});

describe('dialog accessibility and focus', () => {
  it('labels the dialog with its title', async () => {
    const result = confirmDialog(options);
    const card = modal();
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    const labelId = card.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelId)?.textContent).toBe(options.title);
    buttonByText('ยกเลิก').click();
    await result;
  });

  it('keeps Tab inside the dialog: from the last button back to the first', async () => {
    const result = confirmDialog(options);
    buttonByText('ลบชุดข้อมูล').focus();
    const event = press('Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttonByText('ยกเลิก'));
    buttonByText('ยกเลิก').click();
    await result;
  });

  it('keeps Shift+Tab inside the dialog: from the first button to the last', async () => {
    const result = confirmDialog(options);
    expect(document.activeElement).toBe(buttonByText('ยกเลิก'));
    const event = press('Tab', true);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttonByText('ลบชุดข้อมูล'));
    buttonByText('ยกเลิก').click();
    await result;
  });

  it('leaves normal Tab movement between the buttons to the browser', async () => {
    const result = confirmDialog(options);
    expect(document.activeElement).toBe(buttonByText('ยกเลิก'));
    expect(press('Tab').defaultPrevented).toBe(false);
    buttonByText('ยกเลิก').click();
    await result;
  });

  it('pulls focus back into the dialog when it is outside', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const result = confirmDialog(options);
    outside.focus();
    const event = press('Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttonByText('ยกเลิก'));
    buttonByText('ยกเลิก').click();
    await result;
  });

  it('gives focus back to the element that opened it', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const result = confirmDialog(options);
    expect(document.activeElement).toBe(buttonByText('ยกเลิก'));
    buttonByText('ยกเลิก').click();
    await result;
    expect(document.activeElement).toBe(opener);
  });

  it('resolves false on Escape and removes the dialog', async () => {
    const result = confirmDialog(options);
    press('Escape');
    expect(await result).toBe(false);
    expect(modal()).toBeNull();
  });

  it('resolves true on confirm and removes the dialog', async () => {
    const result = confirmDialog(options);
    buttonByText('ลบชุดข้อมูล').click();
    expect(await result).toBe(true);
    expect(modal()).toBeNull();
  });
});