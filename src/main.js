// MOB RUSH — point d'entrée (CONTRACT §6.12) + capture d'erreurs runtime visible (aide au debug headless).
import { createApp } from './core/app.js';

function showError(label, err) {
  console.error(`[MOB RUSH] ${label}`, err);
  let box = document.getElementById('errbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'errbox';
    box.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:9999;max-height:45%;overflow:auto;' +
      'background:rgba(120,0,20,.95);color:#fff;font:12px/1.4 monospace;padding:10px;white-space:pre-wrap;';
    document.body.appendChild(box);
  }
  const msg = err && err.stack ? err.stack : String(err);
  box.textContent += `\n[${label}] ${msg}\n`;
}

addEventListener('error', (e) => showError('window.error', e.error || e.message));
addEventListener('unhandledrejection', (e) => showError('unhandledrejection', e.reason));

createApp()
  .then((app) => app.start())
  .catch((err) => showError('boot failed', err));
