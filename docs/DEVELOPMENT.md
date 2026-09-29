# Developer Guide & Local Engineering Standards

This document specifies the setup procedures, engineering commands, development workflows, testing suites, and code quality standards in **Scholar Core**.

---

## 1. Prerequisites & Tooling

To develop locally on Scholar Core, ensure you have installed:
- **Node.js**: Version 20.x or higher (LTS recommended).
- **Package Manager**: `npm` version 10.x or higher.
- **Git**: Modern version with SSH or HTTPS authentication.
- **Supabase Account / Instance**: Cloud project reference or local Docker instance.
- *(Optional)* **Ollama / LM Studio**: If developing or testing Local AI inference.

---

## 2. Installation & Environment Configuration

### 2.1 Clone & Install Dependencies
```bash
git clone https://github.com/docgovinda-glitch/scholar-agentic-os.git
cd scholar-agentic-os
npm install
```

### 2.2 Environment Variables Configuration
Copy the example environment template:
```bash
cp .env.example .env
```

Configure the following essential variables in `.env`:

```env
# Server Binding
PORT=3000

# Supabase Credentials (Required for Auth & Database)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# AI Gateway Default Key (Optional if using BYOK)
GEMINI_API_KEY=your-gemini-api-key

# Bot Abuse Protection (Optional in local dev, bypassable)
CLOUDFLARE_TURNSTILE_SECRET_KEY=your-turnstile-secret
VITE_CLOUDFLARE_TURNSTILE_SITE_KEY=your-turnstile-site-key
```

---

## 3. Running the Development Server

Scholar Core runs as a unified fullstack application. A single command launches the Express backend which serves Vite middleware for hot module replacement (HMR):

```bash
npm run dev
```

- **Server URL**: `http://localhost:3000`
- **Frontend Assets**: Handled dynamically by Vite with HMR.
- **Backend API Routes**: Mounted under `/api/*`.
- **Health Check**: Available at `http://localhost:3000/health`.

---

## 4. Verification, Testing & Quality Commands

Always run these quality gates before committing code:

### 4.1 Type Checking
```bash
npx tsc --noEmit
```
Verifies strict TypeScript compliance across all client (`src/`) and server (`server/`, `server.ts`) files. The build requires 0 errors.

### 4.2 Automated Testing (Vitest)
```bash
# Run all unit and integration tests
npm test

# Run tests with test coverage reporting
npm run test:coverage

# Run a specific test suite (e.g. Assignment workflow)
npx vitest run src/desk/assignment/__tests__/
```

### 4.3 Linting & Design System Verification
```bash
npm run lint
```
Executes:
1. `tsc --noEmit` (Static type analysis).
2. `node scripts/verify-contrast.mjs` (Color contrast accessibility auditor).
3. `node scripts/verify-csp-hash.mjs` (Content Security Policy inline script hash check).

---

## 5. Production Build & Execution

### 5.1 Build Command
```bash
npm run build
```
Executes two sequential build steps:
1. **Client Bundling (`vite build`)**: Compiles client TypeScript and React components into optimized, code-split production assets in `dist/`.
2. **Server Bundling (`esbuild server.ts ...`)**: Compiles `server.ts` into a CommonJS production bundle (`dist/server.cjs`) with external packages resolved cleanly.

### 5.2 Local Production Run
```bash
npm start
```
Executes `node dist/server.cjs`, serving the compiled static assets and running API routes without Vite dev overhead.

---

## 6. Codebase Conventions

### 6.1 Architectural Rules
- **No Direct Hex Codes in Component Styles**: Always use CSS variables (`--surface-canvas`, `--surface-raised`, `--text-primary`, `--accent`) so Day/Night theme toggling works reliably.
- **Strict Separation of Phase State**: In the Coursework & Essay workspace, cross-phase state must be routed through `AssignmentContext.tsx` and synced atomically to `AssignmentProjectState`.
- **Zero Full-Text Retention**: Never write code that stores raw proprietary manuscript PDFs into database rows or public storage buckets. Store structured citation metadata only.
- **No Historical Comments**: Do not write comments describing previous implementations (e.g. `// We used to do X before changing to Y`). Document only *why* the current code works the way it does.
