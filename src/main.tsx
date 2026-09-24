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

// Hydrate saved theme across all environments
if (typeof document !== 'undefined') {
  const savedTheme = localStorage.getItem('scholar-theme') || localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// Start waking the server before rendering, not after the first user action.
void warmServer();

// Ensure all environments serve fresh assets by unregistering any stale Service Worker and clearing cache storage
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  }
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    });
  }

  // Intercept stale Vite dynamic import chunk errors caused by new deployments
  // and automatically reload the latest assets seamlessly.
  window.addEventListener('vite:preloadError', () => {
    window.location.reload();
  });
}

import ErrorBoundary from './components/ErrorBoundary.tsx';

const AdminApp = lazy(() => import('./admin/AdminApp.tsx'));

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <ErrorBoundary>
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
    </ErrorBoundary>
  </StrictMode>,
);
