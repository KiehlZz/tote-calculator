import type { EntryRepo } from '../db/entryRepo';
import type { SessionRepo } from '../db/sessionRepo';
import { sessionMode, type Entry, type Session } from '../db/types';
import { calculate } from '../domain/calculation';
import { getColumns, getDigits } from '../domain/columns';
import { isValidNumber } from '../domain/validators';
import { editEntryDialog } from './dialog';
import { el } from './dom';
import { columnLabel, formatTotal, groupByColumn, modeLabel, sanitizeDigits, validateEntryNumber } from './helpers';

export interface CalculatorData {
  session: Session;
  entries: Entry[];
}

export interface CalculatorDeps {
  entries: EntryRepo;
}

// Reads everything first, so the screen is only drawn once the data is ready.
export async function loadCalculator(
  sessions: SessionRepo,
  entries: EntryRepo,
  sessionId: number,
): Promise<CalculatorData | undefined> {
  const session = await sessions.get(sessionId);
  if (!session) return undefined;
  return { session, entries: await entries.listBySession(sessionId) };
}

export function mountCalculator(main: HTMLElement, data: CalculatorData, deps: CalculatorDeps): void {
  const { session } = data;
  const mode = sessionMode(session);
  const digits = getDigits(mode);
  let items: Entry[] = [...data.entries];
  let queue: Promise<void> = Promise.resolve();

  const banner = el('div', 'banner');
  banner.setAttribute('role', 'alert');
  banner.hidden = true;

  function showError(message: string): void {
    banner.textContent = message;
    banner.hidden = false;
  }

  function clearError(): void {
    banner.textContent = '';
    banner.hidden = true;
  }

  // All writes run one after another, so numbers typed quickly keep their order.
  function enqueue(task: () => Promise<void>): void {
    queue = queue.then(task).catch((error) => console.error(error));
  }

  const lists = new Map<number, HTMLElement>();
  const counts = new Map<number, HTMLElement>();

  function addEntry(multiplier: number, number: string): void {
    enqueue(async () => {
      try {
        const created = await deps.entries.add(session.id, number, multiplier);
        items = [...items, created];
        clearError();
        renderAll();
      } catch (error) {
        console.error(error);
        showError(`บันทึกเลข ${number} (${columnLabel(multiplier)}) ไม่สำเร็จ กรุณากรอกใหม่`);
      }
    });
  }

  async function onEdit(entry: Entry): Promise<void> {
    const result = await editEntryDialog({
      title: `แก้ไขเลข · ${columnLabel(entry.columnMultiplier)}`,
      initialValue: entry.number,
      validate: (value) => validateEntryNumber(value, mode),
      mode,
    });
    if (result === null) return;
    enqueue(async () => {
      try {
        if (result.action === 'delete') {
          await deps.entries.remove(entry.id);
          items = items.filter((item) => item.id !== entry.id);
        } else if (result.number !== entry.number) {
          const updated = await deps.entries.update(entry.id, { number: result.number });
          items = items.map((item) => (item.id === updated.id ? updated : item));
        }
        clearError();
        renderAll();
      } catch (error) {
        console.error(error);
        showError('แก้ไขไม่สำเร็จ กรุณาลองอีกครั้ง');
      }
    });
  }

  // The inputs (six, or two in 4-digit mode) are created once and never redrawn, so focus (and the keyboard) stays put.
  const columnEls = getColumns(mode).map((multiplier) => {
    const input = el('input', 'number-input');
    input.type = 'text';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('pattern', '[0-9]*');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = `เลข ${digits} หลัก`;
    input.setAttribute('aria-label', `กรอกเลข ${digits} หลัก คอลัมน์ ${columnLabel(multiplier)}`);
    input.addEventListener('input', () => {
      const clean = sanitizeDigits(input.value, mode);
      if (clean !== input.value) input.value = clean;
      if (isValidNumber(clean, mode)) {
        input.value = ''; // cleared before anything async, so it can never be added twice
        addEntry(multiplier, clean);
      }
    });

    const list = el('div', 'entry-list');
    const count = el('span', 'muted', '0 รายการ');
    lists.set(multiplier, list);
    counts.set(multiplier, count);
    return el('section', 'column', el('header', 'column-head', el('h3', '', columnLabel(multiplier)), count), input, list);
  });

  const summary = el('p', 'result-summary');
  const resultBody = el('div', 'result-body');

  function renderLists(): void {
    for (const group of groupByColumn(items, mode)) {
      const chips = [...group.items].reverse().map((entry) => {
        const chip = el('button', 'entry-chip', entry.number);
        chip.type = 'button';
        chip.setAttribute('aria-label', `แก้ไขเลข ${entry.number} คอลัมน์ ${columnLabel(entry.columnMultiplier)}`);
        chip.addEventListener('click', () => void onEdit(entry));
        return chip;
      });
      lists.get(group.multiplier)!.replaceChildren(...chips);
      counts.get(group.multiplier)!.textContent = `${group.items.length} รายการ`;
    }
  }

  function renderResults(): void {
    const result = calculate(items, mode);
    summary.textContent = `รายการทั้งหมด: ${result.totalEntries} · จำนวนกลุ่ม: ${result.groupCount}`;
    if (result.groups.length === 0) {
      resultBody.replaceChildren(el('p', 'muted', 'ยังไม่มีข้อมูล'));
      return;
    }
    const rows = result.groups.map((group) =>
      el(
        'tr',
        '',
        el('td', 'key', group.key),
        el('td', 'num', formatTotal(group.total)),
        el('td', 'num', String(group.count)),
      ),
    );
    resultBody.replaceChildren(
      el(
        'table',
        'result-table',
        el('thead', '', el('tr', '', el('th', '', 'เลขโต๊ด'), el('th', 'num', 'ผลรวม'), el('th', 'num', 'รายการ'))),
        el('tbody', '', ...rows),
      ),
    );
  }

  function renderAll(): void {
    try {
      renderLists();
      renderResults();
    } catch (error) {
      console.error(error);
      showError('พบข้อมูลที่ไม่ถูกต้องในชุดนี้ จึงแสดงผลไม่ได้');
    }
  }

  const back = el('a', 'btn', '← หน้าหลัก');
  back.setAttribute('href', '#/');

  main.replaceChildren(
    el('div', 'calc-toolbar', back, el('h2', 'calc-title', session.name), el('span', 'badge', modeLabel(mode)), el('span', 'muted', 'บันทึกอัตโนมัติ')),
    banner,
    el(
      'div',
      'calc-layout',
      el('div', mode === 4 ? 'columns columns-2' : 'columns', ...columnEls),
      el('aside', 'results', el('h3', '', 'ผลลัพธ์'), summary, resultBody),
    ),
  );
  renderAll();
}