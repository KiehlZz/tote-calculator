import { resolve } from 'node:path';
import { checkDist } from './precache-check.mjs';

const distDir = resolve(process.argv[2] ?? 'dist');

try {
  const result = await checkDist(distDir);
  if (result.urls.length === 0) {
    throw new Error('no precache list found in sw.js (did the plugin change its output format?)');
  }
  if (result.missing.length > 0 || result.stale.length > 0) {
    if (result.missing.length > 0) {
      console.error(`built but NOT precached (would be missing offline):\n  ${result.missing.join('\n  ')}`);
    }
    if (result.stale.length > 0) {
      console.error(`precached but NOT built:\n  ${result.stale.join('\n  ')}`);
    }
    process.exit(1);
  }
  console.log(`precache OK: ${result.urls.length} files, everything in dist is covered`);
} catch (error) {
  console.error(`precache check failed: ${error.message}`);
  process.exit(1);
}