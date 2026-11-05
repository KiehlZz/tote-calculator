const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;

// Thailand is UTC+7 all year (no daylight saving time)
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const BUDDHIST_ERA_OFFSET = 543;

interface BangkokParts {
  year: number;
  month: number; // 0-11
  day: number;
  hour: number;
  minute: number;
}

function toBangkokParts(iso: string): BangkokParts {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid date: ${JSON.stringify(iso)}`);
  }
  const shifted = new Date(ms + BANGKOK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// e.g. "5 พ.ย. 2569"
export function formatThaiDate(iso: string): string {
  const p = toBangkokParts(iso);
  return `${p.day} ${THAI_MONTHS_SHORT[p.month]} ${p.year + BUDDHIST_ERA_OFFSET}`;
}

// e.g. "5 พ.ย. 2569 17:00 น."
export function formatThaiDateTime(iso: string): string {
  const p = toBangkokParts(iso);
  return `${formatThaiDate(iso)} ${pad2(p.hour)}:${pad2(p.minute)} น.`;
}