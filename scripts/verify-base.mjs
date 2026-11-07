import { resolve } from 'node:path';
import { checkDistBase } from './base-check.mjs';

const base = process.argv[2] ?? '/';
const distDir = resolve(process.argv[3] ?? 'dist');

if (!base.startsWith('/') || !base.endsWith('/')) {
  console.error(`base must start and end with "/", got "${base}"`);
  process.exit(1);
}

try {
  const problems = await checkDistBase(distDir, base);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`base OK: every rooted URL in index.html and the manifest starts with ${base}`);
} catch (error) {
  console.error(`base check failed: ${error.message}`);
  process.exit(1);
}