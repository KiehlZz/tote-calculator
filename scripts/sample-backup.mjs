const COLUMNS = [15, 30, 60, 120, 150, 180];

// small deterministic random generator, so the same sample is produced every time
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the first three entries are fixed: a leading zero, a permutation of it, and a duplicate
const FIXED = ['007', '700', '007'];

export function makeSampleBackup(count = 300, seed = 1) {
  const random = createRandom(seed);
  const start = Date.UTC(2026, 10, 1, 3, 0, 0);
  const iso = (offsetSeconds) => new Date(start + offsetSeconds * 1000).toISOString();

  // a small pool of numbers makes duplicates and permutations common, like real use
  const pool = Array.from({ length: 60 }, () => String(Math.floor(random() * 1000)).padStart(3, '0'));

  const shuffle = (text) => {
    const digits = text.split('');
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.join('');
  };

  const entries = [];
  for (let i = 0; i < count; i++) {
    const base = pool[Math.floor(random() * pool.length)];
    const picked = random() < 0.5 ? shuffle(base) : base;
    const number = i < FIXED.length ? FIXED[i] : picked;
    const columnMultiplier = COLUMNS[Math.floor(random() * COLUMNS.length)];
    entries.push({ columnMultiplier, number, createdAt: iso(i), updatedAt: iso(i) });
  }

  return {
    app: 'tote-calculator',
    schemaVersion: 1,
    exportedAt: iso(count),
    sessions: [
      {
        name: `ตัวอย่าง ${count} รายการ`,
        createdAt: iso(0),
        updatedAt: iso(count),
        entries,
      },
    ],
  };
}