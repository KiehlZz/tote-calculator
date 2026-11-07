import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDistBase, htmlProblems, manifestProblems, urlsIn } from '../scripts/base-check.mjs';

const BASE = '/tote-calculator/';

// shaped like the real dist/index.html (shortened)
const GOOD_HTML = `<!doctype html>
<html><head>
<link rel="icon" type="image/svg+xml" href="/tote-calculator/icons/icon.svg" />
<link rel="apple-touch-icon" href="/tote-calculator/icons/apple-touch-icon.png" />
<script type="module" crossorigin src="/tote-calculator/assets/index-abc.js"></script>
<link rel="stylesheet" crossorigin href="/tote-calculator/assets/index-abc.css">
<link rel="manifest" href="/tote-calculator/manifest.webmanifest"></head>
<body><div id="app"></div></body></html>`;

const BAD_HTML = GOOD_HTML.replaceAll('/tote-calculator/', '/');

const GOOD_MANIFEST = {
  start_url: './',
  scope: './',
  icons: [{ src: 'icons/icon-192.png' }, { src: 'icons/icon-512.png' }],
};

describe('urlsIn', () => {
  it('reads href and src values in order', () => {
    expect(urlsIn(GOOD_HTML)).toEqual([
      '/tote-calculator/icons/icon.svg',
      '/tote-calculator/icons/apple-touch-icon.png',
      '/tote-calculator/assets/index-abc.js',
      '/tote-calculator/assets/index-abc.css',
      '/tote-calculator/manifest.webmanifest',
    ]);
  });
});

describe('htmlProblems', () => {
  it('accepts a page whose rooted URLs all start with the base', () => {
    expect(htmlProblems(GOOD_HTML, BASE)).toEqual([]);
  });

  it('flags a rooted URL that is missing the base', () => {
    const html = GOOD_HTML.replace('/tote-calculator/icons/icon.svg', '/icons/icon.svg');
    expect(htmlProblems(html, BASE)).toEqual(['html: "/icons/icon.svg" does not start with /tote-calculator/']);
  });

  it('ignores external, protocol-relative, data and hash URLs', () => {
    const html =
      GOOD_HTML +
      '<a href="https://example.com/x"></a><script src="//cdn.example.com/a.js"></script>' +
      '<img src="data:image/png;base64,AAAA"><a href="#top"></a>';
    expect(htmlProblems(html, BASE)).toEqual([]);
  });

  it('accepts everything when the base is /', () => {
    expect(htmlProblems(BAD_HTML, '/')).toEqual([]);
  });

  it('complains when a non-root base is expected but no URL carries it', () => {
    const problems = htmlProblems('<link rel="icon" href="icons/icon.svg">', BASE);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no URL uses the base');
  });
});

describe('manifestProblems', () => {
  it('accepts relative start_url, scope and icons', () => {
    expect(manifestProblems(GOOD_MANIFEST, BASE)).toEqual([]);
  });

  it('flags rooted URLs that miss the base', () => {
    const manifest = { start_url: '/', scope: '/', icons: [{ src: '/icons/a.png' }] };
    expect(manifestProblems(manifest, BASE)).toHaveLength(3);
  });

  it('accepts rooted URLs that carry the base', () => {
    const manifest = {
      start_url: '/tote-calculator/',
      scope: '/tote-calculator/',
      icons: [{ src: '/tote-calculator/icons/a.png' }],
    };
    expect(manifestProblems(manifest, BASE)).toEqual([]);
  });
});

describe('checkDistBase', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tote-base-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeDist(html: string, manifest: unknown): Promise<void> {
    await writeFile(join(dir, 'index.html'), html);
    await writeFile(join(dir, 'manifest.webmanifest'), JSON.stringify(manifest));
  }

  it('passes for a dist built with the base', async () => {
    await writeDist(GOOD_HTML, GOOD_MANIFEST);
    expect(await checkDistBase(dir, BASE)).toEqual([]);
  });

  it('reports problems for a dist built without the base', async () => {
    await writeDist(BAD_HTML, GOOD_MANIFEST);
    const problems = await checkDistBase(dir, BASE);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.startsWith('html:'))).toBe(true);
  });

  it('fails when manifest.webmanifest is missing', async () => {
    await writeFile(join(dir, 'index.html'), GOOD_HTML);
    await expect(checkDistBase(dir, BASE)).rejects.toThrow();
  });
});