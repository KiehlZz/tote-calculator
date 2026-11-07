import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifest } from '../pwa.config';

const root = resolve(__dirname, '..');
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const icons = manifest.icons ?? [];

describe('PWA manifest and icons', () => {
  it.each(icons.map((icon) => [icon.src, icon.sizes ?? '']))(
    'icon %s is a PNG of the declared size %s',
    (src, sizes) => {
      const file = resolve(root, 'public', src);
      expect(existsSync(file)).toBe(true);
      const { width, height } = pngSize(file);
      expect(`${width}x${height}`).toBe(sizes);
    },
  );

  it('has "any" icons at 192 and 512', () => {
    const anySizes = icons.filter((i) => i.purpose === 'any').map((i) => i.sizes);
    expect(anySizes).toContain('192x192');
    expect(anySizes).toContain('512x512');
  });

  it('has a maskable icon of at least 512 px', () => {
    const maskable = icons.filter((i) => i.purpose === 'maskable');
    expect(maskable.length).toBeGreaterThan(0);
    expect(maskable.some((i) => i.sizes === '512x512')).toBe(true);
  });

  it('declares the Thai name, standalone display and a relative scope', () => {
    expect(manifest.name).toBe('เครื่องคิดเลขโต๊ด');
    expect(manifest.lang).toBe('th');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
  });

  it('has a 180x180 apple-touch-icon', () => {
    const { width, height } = pngSize(resolve(root, 'public/icons/apple-touch-icon.png'));
    expect(`${width}x${height}`).toBe('180x180');
  });

  it('links the favicon and apple-touch-icon in index.html', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('rel="icon"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('/icons/apple-touch-icon.png');
  });
});