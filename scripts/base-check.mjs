import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// not a path on our own site: http:, data:, mailto:, //host, #hash
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

export function urlsIn(html) {
  return [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((match) => match[1]);
}

// URLs that start with "/" must start with the base, otherwise they point outside the site
export function htmlProblems(html, base) {
  const rooted = urlsIn(html).filter((url) => !EXTERNAL.test(url) && url.startsWith('/'));
  const problems = rooted
    .filter((url) => !url.startsWith(base))
    .map((url) => `html: "${url}" does not start with ${base}`);
  if (base !== '/' && rooted.length === 0) {
    problems.push(`html: no URL uses the base ${base} (was the build run with --base?)`);
  }
  return problems;
}

export function manifestProblems(manifest, base) {
  const urls = [manifest.start_url, manifest.scope, ...(manifest.icons ?? []).map((icon) => icon.src)].filter(
    (url) => typeof url === 'string',
  );
  return urls
    .filter((url) => !EXTERNAL.test(url) && url.startsWith('/') && !url.startsWith(base))
    .map((url) => `manifest: "${url}" does not start with ${base}`);
}

export async function checkDistBase(distDir, base) {
  const html = await readFile(join(distDir, 'index.html'), 'utf8'); // throws when missing
  const manifest = JSON.parse(await readFile(join(distDir, 'manifest.webmanifest'), 'utf8'));
  return [...htmlProblems(html, base), ...manifestProblems(manifest, base)];
}