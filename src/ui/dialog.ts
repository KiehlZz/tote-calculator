import { button, el } from './dom';
import { sanitizeDigits } from './helpers';

// Shows the card on a dimmed backdrop. Returns a function that removes it again.
let modalCounter = 0;

function focusableIn(card: HTMLElement): HTMLElement[] {
  return [...card.querySelectorAll<HTMLElement>('button, input, a[href]')].filter(
    (node) => !node.hasAttribute('disabled') && !node.hidden,
  );
}

// Shows the card on a dimmed backdrop. Returns a function that removes it again.
function mountModal(card: HTMLElement, onCancel: () => void): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const backdrop = el('div', 'modal-backdrop', card);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');

  const title = card.querySelector('.modal-title');
  if (title) {
    modalCounter += 1;
    title.id = `modal-title-${modalCounter}`;
    card.setAttribute('aria-labelledby', title.id);
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    // keep keyboard focus inside the dialog
    const nodes = focusableIn(card);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    const inside = active !== null && card.contains(active);
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  };
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) onCancel();
  });
  document.addEventListener('keydown', onKeyDown);
  document.body.append(backdrop);

  return () => {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
    previouslyFocused?.focus?.();
  };
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let unmount = (): void => {};
    const finish = (result: boolean): void => {
      if (done) return; // a second click or key press can never resolve twice
      done = true;
      unmount();
      resolve(result);
    };

    const cancel = button(options.cancelLabel ?? 'ยกเลิก', 'btn', () => finish(false));
    const confirm = button(
      options.confirmLabel,
      options.danger ? 'btn btn-danger-solid' : 'btn btn-primary',
      () => finish(true),
    );
    const card = el(
      'div',
      'modal',
      el('h2', 'modal-title', options.title),
      el('p', '', options.message),
      el('div', 'modal-actions', cancel, confirm),
    );

    unmount = mountModal(card, () => finish(false));
    cancel.focus(); // safe default: Enter or Space must not confirm a deletion
  });
}

export interface PromptOptions {
  title: string;
  label: string;
  confirmLabel: string;
  initialValue?: string;
  placeholder?: string;
  validate?: (value: string) => string | null;
}

// Resolves with the typed text, or null when cancelled.
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    let unmount = (): void => {};
    const finish = (value: string | null): void => {
      if (done) return;
      done = true;
      unmount();
      resolve(value);
    };

    const input = el('input', 'field-input');
    input.type = 'text';
    input.value = options.initialValue ?? '';
    input.placeholder = options.placeholder ?? '';
    input.autocomplete = 'off';

    const error = el('p', 'field-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const submit = (): void => {
      const message = options.validate ? options.validate(input.value) : null;
      if (message !== null) {
        error.textContent = message;
        error.hidden = false;
        input.focus();
        return;
      }
      finish(input.value);
    };

    // ignore Enter while a Thai/IME composition is still in progress
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        submit();
      }
    });

    const card = el(
      'div',
      'modal',
      el('h2', 'modal-title', options.title),
      el('label', 'field-label', options.label, input),
      error,
      el(
        'div',
        'modal-actions',
        button('ยกเลิก', 'btn', () => finish(null)),
        button(options.confirmLabel, 'btn btn-primary', submit),
      ),
    );

    unmount = mountModal(card, () => finish(null));
    input.focus();
    input.select();
  });
}

export type EditEntryResult = { action: 'save'; number: string } | { action: 'delete' } | null;

export interface EditEntryOptions {
  title: string;
  initialValue: string;
  validate: (value: string) => string | null;
}

// Resolves with save + new number, delete, or null when cancelled.
export function editEntryDialog(options: EditEntryOptions): Promise<EditEntryResult> {
  return new Promise((resolve) => {
    let done = false;
    let unmount = (): void => {};
    const finish = (result: EditEntryResult): void => {
      if (done) return; // a second click or key press can never resolve twice
      done = true;
      unmount();
      resolve(result);
    };

    const input = el('input', 'field-input number-input');
    input.type = 'text';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('pattern', '[0-9]*');
    input.autocomplete = 'off';
    input.value = options.initialValue;
    input.addEventListener('input', () => {
      const clean = sanitizeDigits(input.value);
      if (clean !== input.value) input.value = clean;
    });

    const error = el('p', 'field-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const submit = (): void => {
      const message = options.validate(input.value);
      if (message !== null) {
        error.textContent = message;
        error.hidden = false;
        input.focus();
        return;
      }
      finish({ action: 'save', number: input.value });
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        submit();
      }
    });

    const card = el(
      'div',
      'modal',
      el('h2', 'modal-title', options.title),
      el('label', 'field-label', 'เลข 3 หลัก', input),
      error,
      el(
        'div',
        'modal-actions',
        button('ลบ', 'btn btn-danger push-left', () => finish({ action: 'delete' })),
        button('ยกเลิก', 'btn', () => finish(null)),
        button('บันทึก', 'btn btn-primary', submit),
      ),
    );

    unmount = mountModal(card, () => finish(null));
    input.focus();
    input.select();
  });
}

export interface Choice<T> {
  label: string;
  value: T;
  className?: string;
}

export interface ChoiceOptions<T> {
  title: string;
  message: string;
  choices: Choice<T>[];
  cancelLabel?: string;
}

// Resolves with the chosen value, or null when cancelled.
export function choiceDialog<T>(options: ChoiceOptions<T>): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    let unmount = (): void => {};
    const finish = (value: T | null): void => {
      if (done) return;
      done = true;
      unmount();
      resolve(value);
    };

    const cancel = button(options.cancelLabel ?? 'ยกเลิก', 'btn', () => finish(null));
    const choiceButtons = options.choices.map((choice) =>
      button(choice.label, choice.className ?? 'btn', () => finish(choice.value)),
    );
    const card = el(
      'div',
      'modal',
      el('h2', 'modal-title', options.title),
      el('p', '', options.message),
      el('div', 'modal-actions', cancel, ...choiceButtons),
    );

    unmount = mountModal(card, () => finish(null));
    cancel.focus();
  });
}