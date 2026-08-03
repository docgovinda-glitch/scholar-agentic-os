import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './auth/authContext';
import { warmServer } from './services/serverWarmup';

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
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
