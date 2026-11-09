import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DeskApp from './desk/DeskApp.tsx';
import './index.css';
import { warmServer } from './services/serverWarmup';

/**
 * Root Application Entry Point.
 *
 * Configures the top-level BrowserRouter routing between:
 * - /admin/*: Dedicated Admin AI Infrastructure panel (lazy-loaded chunk)
 * - /*: Main Desk application (auth, onboarding, projects, workspaces, vault, settings)
 */

// Hydrate saved theme across all environments
if (typeof document !== 'undefined') {
  // No saved choice yet: follow the device's light/dark setting (dark if it can't be read).
  const systemTheme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const savedTheme = localStorage.getItem('scholar-theme') || localStorage.getItem('theme') || systemTheme;
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
import { FeedbackProvider } from './components/ui/FeedbackSystem.tsx';

const AdminApp = lazy(() => import('./admin/AdminApp.tsx'));

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <FeedbackProvider>
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
        </FeedbackProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
