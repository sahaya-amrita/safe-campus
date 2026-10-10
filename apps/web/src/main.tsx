// TEMPORARY BOOTSTRAP SCAFFOLD — integration-owned. See SCAFFOLD.md.
// Mounts a single feature with no router, shell or shared providers, and
// registers the service worker. The integration owner replaces this file.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { StudentApp } from './features/student';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <StudentApp />
  </StrictMode>,
);

// Production only (the plugin's dev mode is off). A waiting update is announced
// to features via an event; they decide when it is safe to reload.
const updateServiceWorker = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('sahaya:update-ready', { detail: () => updateServiceWorker(true) }));
  },
  onRegisterError(error: unknown) {
    console.error('Amrita Sahaya: offline support unavailable (service worker registration failed)', error);
  },
});
