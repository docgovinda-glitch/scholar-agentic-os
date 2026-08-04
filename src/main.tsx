import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './auth/authContext';
import { warmServer } from './services/serverWarmup';

// Desk (docs 20/21/22) — the new-architecture client — lives entirely under
// /desk, lazy-loaded so it costs nothing in the legacy app's bundle. This is
// a plain pathname check, not a router: Desk has exactly one entry point
// today (see DeskApp.tsx's own doc comment for why no router dependency
// was added for that).
const DeskApp = lazy(() => import('./desk/DeskApp.tsx'));
const isDesk = window.location.pathname.startsWith('/desk');

// Start waking the server before rendering, not after the first user action.
//
// On Render's free plan the instance idles out after ~15 minutes, and the
// request that wakes it waits tens of seconds for the container to boot. That
// cost cannot be removed, but it can be moved off the interaction path: by the
// time someone has read the page and clicked something, the container has
// usually finished starting. Fire-and-forget by design — warmServer() resolves
// to a state and never rejects, so nothing here can block or break rendering.
void warmServer();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDesk ? (
      <Suspense fallback={null}>
        <DeskApp />
      </Suspense>
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
);
