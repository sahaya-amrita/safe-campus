// TEMPORARY BOOTSTRAP SCAFFOLD — integration-owned. See SCAFFOLD.md.
// Mounts a single feature with no router, shell or shared providers.
// The integration owner replaces this with the real application shell.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <p>SAFE CAMPUS web scaffold is running. No feature is mounted yet.</p>
  </StrictMode>,
);
