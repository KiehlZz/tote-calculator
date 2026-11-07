import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDist, compare, listFiles, precacheUrls } from '../scripts/precache-check.mjs';

// shaped like the real dist/sw.js produced by vite-plugin-pwa 2.0.0 (shortened)
const SW_SAMPLE =
  'define(["./workbox-2fbc6a65"],function(e){"use strict";e.precacheAndRoute([' +
  '{url:"index.html",revision:"84cee085b604f777d475736ed6b7bf74"},' +
  '{url:"assets/workbox-window.prod.es5-Bd17z0YL.js",revision:null},' +
  '{url:"icons/icon.svg",revision:"645fcba0f5c0477f7aca239c21cb0117"},' +
  '{url:"manifest.webmanifest",revision:"10cd1b92e110b4315c7eb590bb2e276e"}' +
  '],{}),e.cleanupOutdatedCaches(),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html")))});';

const BUILT = [
  'index.html',
  'assets/workbox-window.prod.es5-Bd17z0YL.js',
  'icons/icon.svg',
  'manifest.webmanifest',
];

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tote-dist-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function put(path: string, text = 'x'): Promise<void> {
  const full = join(dir, ...path.split('/'));
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, text);
}

describe('precacheUrls', () => {
  it('reads every url from the real sw.js format and ignores the navigation route', () => {
    expect(precacheUrls(SW_SAMPLE)).toEqual(BUILT);
  });

  it('returns nothing for text without a precache list', () => {
    expect(precacheUrls('console.log("hello")')).toEqual([]);
  });
});

describe('compare', () => {
  it('reports nothing when every built file is precached (sw.js and the workbox runtime are exempt)', () => {
    const files = [...BUILT, 'sw.js', 'workbox-2fbc6a65.js'];
    expect(compare(files, BUILT)).toEqual({ missing: [], stale: [] });
  });

  it('reports a built file that is not precached', () => {
    expect(compare([...BUILT, 'icons/new.png'], BUILT)).toEqual({ missing: ['icons/new.png'], stale: [] });
  });

  it('reports a precached url that was not built', () => {
    expect(compare(BUILT, [...BUILT, 'gone.js'])).toEqual({ missing: [], stale: ['gone.js'] });
  });
});

describe('listFiles', () => {
  it('lists nested files as sorted forward-slash paths', async () => {
    await put('b.txt');
    await put('sub/deep/a.txt');
    await put('a.txt');
    expect(await listFiles(dir)).toEqual(['a.txt', 'b.txt', 'sub/deep/a.txt']);
  });
});

describe('checkDist', () => {
  async function buildFakeDist(): Promise<void> {
    await put('sw.js', SW_SAMPLE);
    await put('workbox-2fbc6a65.js');
    for (const file of BUILT) await put(file);
  }

  it('passes when everything in dist is precached', async () => {
    await buildFakeDist();
    const result = await checkDist(dir);
    expect(result.urls).toHaveLength(4);
    expect(result.missing).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it('finds a file that was added to dist but not precached', async () => {
    await buildFakeDist();
    await put('icons/extra.png');
    expect((await checkDist(dir)).missing).toEqual(['icons/extra.png']);
  });

  it('fails when there is no sw.js', async () => {
    await put('index.html');
    await expect(checkDist(dir)).rejects.toThrow();
  });
});