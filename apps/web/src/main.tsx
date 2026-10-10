// Amrita Sahaya web entry: mounts the unified, role-aware app shell and
// registers the service worker.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';

// The brand theme is light-only (Amrita maroon on white); shared modules honour this attribute.
document.documentElement.dataset.theme = 'light';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Production only (the plugin's dev mode is off). A waiting update is announced
// to features via an event; they decide when it is safe to reload.
const updateServiceWorker = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(
      new CustomEvent('sahaya:update-ready', { detail: () => updateServiceWorker(true) }),
    );
  },
  onRegisterError(error: unknown) {
    console.error(
      'Amrita Sahaya: offline support unavailable (service worker registration failed)',
      error,
    );
  },
});
