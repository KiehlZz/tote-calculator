import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { startApp } from './ui/app';
import { setupPwa } from './ui/pwa';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app element');
}
void startApp(root);

// only the built app registers a service worker; `npm run dev` never caches anything
if (import.meta.env.PROD) {
  setupPwa({ register: registerSW, body: document.body });
}