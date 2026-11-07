import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = resolve(root, 'public', 'icons');
const svg = await readFile(resolve(iconDir, 'icon.svg'));

// the maskable icon is the same full-bleed artwork: the digits sit inside the central safe zone
const outputs = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of outputs) {
  await sharp(svg).resize(size, size).png().toFile(resolve(iconDir, name));
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}