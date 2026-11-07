import type { ManifestOptions } from 'vite-plugin-pwa';

export const manifest: Partial<ManifestOptions> = {
  id: 'tote-calculator',
  name: 'เครื่องคิดเลขโต๊ด',
  short_name: 'เลขโต๊ด',
  description: 'คำนวณเลขโต๊ด 3 หลัก ใช้งานได้โดยไม่ต้องต่ออินเทอร์เน็ต',
  lang: 'th',
  display: 'standalone',
  orientation: 'any',
  theme_color: '#1f4e79',
  background_color: '#f4f6f8',
  // relative to the manifest file, so it works at the domain root and under /<repo>/
  start_url: './',
  scope: './',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};