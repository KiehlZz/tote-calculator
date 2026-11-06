import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registered by our own code in step 7.3
      manifest: {
        name: 'เครื่องคิดเลขโต๊ด',
        short_name: 'เลขโต๊ด',
        lang: 'th',
        display: 'standalone',
        theme_color: '#1f4e79',
        background_color: '#f4f6f8',
      },
    }),
  ],
});