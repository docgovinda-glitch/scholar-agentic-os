import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import DeskApp from './desk/DeskApp.tsx';
import './index.css';
import { warmServer } from './services/serverWarmup';

/**
 * Desk (docs 20/21/22) is the main client — see docs
 * 61-CLIENT-CONSOLIDATION.md. It previously lived under /desk behind a
 * lazy-loaded pathname check, coexisting with the legacy client mounted at
 * "/". Legacy has been fully retired: every real feature it had that Desk
 * lacked was ported first (Vault upload/DOI lookup, PDF/ODT export,
 * submission tracking, Pocket's mobile companion), then legacy's code was
 * deleted outright rather than kept as a fallback.
 *
 * /admin is the one other real destination: the Admin AI Infrastructure
 * panel's own dedicated page (src/admin/AdminApp.tsx), not a button
 * anywhere inside Desk — no user-facing link ever points at it. A router
 * library would be overkill for two possible roots; this is the same
 * lazy pathname check Desk itself used to live behind.
 */

// Start waking the server before rendering, not after the first user action.
//
// On Render's free plan the instance idles out after ~15 minutes, and the
// request that wakes it waits tens of seconds for the container to boot. That
// cost cannot be removed, but it can be moved off the interaction path: by the
// time someone has read the page and clicked something, the container has
// usually finished starting. Fire-and-forget by design — warmServer() resolves
// to a state and never rejects, so nothing here can block or break rendering.
void warmServer();

const root = createRoot(document.getElementById('root')!);

if (window.location.pathname.startsWith('/admin')) {
  import('./admin/AdminApp.tsx').then(({ default: AdminApp }) => {
    root.render(
      <StrictMode>
        <AdminApp />
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <DeskApp />
    </StrictMode>,
  );
}
