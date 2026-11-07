import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

// files that are not meant to be in the precache list
const IGNORED = [/^sw\.js$/, /^workbox-[0-9a-f]+\.js$/];

// reads the urls out of  precacheAndRoute([{url:"...",revision:...}, ...])
export function precacheUrls(swText) {
  const start = swText.indexOf('precacheAndRoute(');
  if (start === -1) return [];
  const end = swText.indexOf('}]', start);
  const list = swText.slice(start, end === -1 ? undefined : end);
  return [...list.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]);
}

// every file under dir, as sorted forward-slash paths relative to dir
export async function listFiles(dir) {
  const found = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        found.push(relative(dir, full).split(sep).join('/'));
      }
    }
  }
  await walk(dir);
  return found.sort();
}

// missing = built files that are not precached; stale = precached urls that are not built
export function compare(files, urls) {
  const wanted = files.filter((file) => !IGNORED.some((pattern) => pattern.test(file)));
  const cached = new Set(urls);
  const present = new Set(files);
  return {
    missing: wanted.filter((file) => !cached.has(file)),
    stale: urls.filter((url) => !present.has(url)),
  };
}

export async function checkDist(distDir) {
  const swText = await readFile(join(distDir, 'sw.js'), 'utf8'); // throws when sw.js is missing
  const urls = precacheUrls(swText);
  const files = await listFiles(distDir);
  return { urls, ...compare(files, urls) };
}