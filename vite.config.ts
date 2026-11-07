import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './pwa.config.ts';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registered by our own code in step 7.3
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest,
    }),
  ],
});