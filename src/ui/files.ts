const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

type ShareNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

// Returns true when the file was handed to the system (share sheet or download),
// false when the user closed the share sheet without saving.
export async function saveTextFile(filename: string, text: string): Promise<boolean> {
  const file = new File([text], filename, { type: 'application/json' });
  const nav = navigator as ShareNavigator;
  const touchDevice = window.matchMedia?.('(pointer: coarse)').matches === true;

  if (touchDevice && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      // any other failure (for example the browser wants a fresher tap): fall back to a download
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

// Resolves with the file text, or null when the user cancels.
export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      if (file.size > MAX_BACKUP_BYTES) {
        reject(new Error('file too large'));
        return;
      }
      file.text().then(resolve, reject);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });

    document.body.append(input); // must be in the page for the picker to open on iPad
    input.click();
  });
}