import './style.css';
import { startApp } from './ui/app';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app element');
}
void startApp(root);