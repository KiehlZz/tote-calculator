import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { makeSampleBackup } from './sample-backup.mjs';

const count = Number(process.argv[2] ?? 300);
if (!Number.isInteger(count) || count < 1 || count > 5000) {
  console.error('count must be an integer from 1 to 5000');
  process.exit(1);
}

const out = resolve(process.argv[3] ?? `sample-${count}.json`);
await writeFile(out, JSON.stringify(makeSampleBackup(count), null, 2), 'utf8');
console.log(`wrote ${out} (${count} entries)`);