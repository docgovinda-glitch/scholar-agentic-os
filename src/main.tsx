import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
 * anywhere inside Desk — no user-facing link ever points at it.
 *
 * A real router (react-router-dom) replaces what used to be a one-time,
 * unlistened `window.location.pathname` check here — that worked for
 * choosing between exactly two root trees, but every "page" inside each of
 * those trees (the whole auth flow, Account Settings, AI Access, Vault, an
 * open project, Admin's own tabs...) was still plain React state with no
 * URL/History awareness, which is why Back could skip straight out of the
 * app from the middle of, say, the signup flow. BrowserRouter here is the
 * single routing mechanism for the whole app now — DeskApp and AdminApp
 * both define their own nested <Routes> beneath the two top-level branches
 * below, rather than each inventing separate navigation state.
 *
 * AdminApp's dynamic import() is preserved exactly (still its own code-split
 * chunk) — only its trigger moved from an if/else to a <Route path="/admin/*">.
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

const AdminApp = lazy(() => import('./admin/AdminApp.tsx'));

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* fallback={null}: matches the prior behavior exactly — nothing
            rendered until the lazy chunk resolves, not a spinner. */}
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={null}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="/*" element={<DeskApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
