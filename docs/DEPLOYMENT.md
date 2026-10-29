# Production Deployment & Infrastructure

This document specifies the deployment architecture, Docker containerization, platform configuration, environment variables, and database setup for **Scholar Core**.

---

## 1. Deployment Architecture Overview

Scholar Core is designed for deployment as a unified, production-ready containerized service on platforms such as **Render**, **Fly.io**, **AWS ECS**, or any standard Docker-compatible host.

```text
Incoming Web Traffic (HTTPS: 443)
             ↓
Cloudflare / CDN Edge (SSL termination, Turnstile CAPTCHA validation)
             ↓
Render / Cloud Container Service (Running Dockerfile, gated deploys)
             ↓
Node.js Express Server (dist/server.cjs on $PORT, Node 22)
  ├── Serves pre-built Vite client static assets (dist/*)
  ├── Handles API endpoints (/api/*)
  └── Proxies Supabase REST & WebSocket connections (strict allowlist)
             ↓
Remote Supabase Cloud (PostgreSQL 17 + Network Restrictions + RLS + S3 Storage)
```

---

## 2. Docker Containerization (`Dockerfile`)

The application includes an optimized multi-stage `Dockerfile`:

### 2.1 Multi-Stage Build Structure
- **Stage 1: Build Stage (`node:22-alpine`)**:
  - Installs npm dependencies.
  - Compiles client application via `vite build`.
  - Compiles server bundle via `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --define:import.meta.env=process.env --define:import.meta={} --outfile=dist/server.cjs`. Ensures `import.meta.env` mappings safely resolve to `process.env` in Node.js CJS runtime.
- **Stage 2: Production Runner (`node:22-alpine`)**:
  - Sets `NODE_ENV=production`.
  - Copies minimal production `node_modules` and compiled `dist/` directory.
  - Adheres to least-privilege security by creating and switching to a non-root system user (`nodejs`).
  - Exposes port specified by `$PORT`.
  - Launches container using `node dist/server.cjs`.

### 2.2 Local Docker Build & Test
```bash
# Build the Docker image
docker build -t scholar-agentic-os:latest .

# Run the container locally
docker run -p 3000:3000 --env-file .env scholar-agentic-os:latest
```

---

## 3. Render Deployment Configuration (`render.yaml`)

The repository includes a blueprint specification in `render.yaml`:

```yaml
services:
  - type: web
    name: scholar-agentic-os
    env: docker
    plan: starter
    region: frankfurt
    dockerfilePath: Dockerfile
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: PORT
        value: 3000
      - key: NODE_ENV
        value: production
      - key: VITE_SUPABASE_URL
        sync: false
      - key: VITE_SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: CLOUDFLARE_TURNSTILE_SECRET_KEY
        sync: false
      - key: VITE_CLOUDFLARE_TURNSTILE_SITE_KEY
        sync: false
```

---

## 4. Production Environment Variables Checklist

Ensure the following variables are configured in your hosting platform dashboard:

| Variable | Description | Required | Sensitive |
| :--- | :--- | :--- | :--- |
| `PORT` | Port for Express server to bind to (Render sets this dynamically). | Yes | No |
| `NODE_ENV` | Must be set to `production`. | Yes | No |
| `VITE_SUPABASE_URL` | Full URL to Supabase project (`https://<project-ref>.supabase.co`). | Yes | No |
| `VITE_SUPABASE_ANON_KEY` | Public anonymous key for client Supabase requests. | Yes | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Administrative service-role key for backend operations. | Yes | **Yes** |
| `SUPABASE_JWT_SECRET` | Secret for local HS256 JWT access token validation in Express. | Recommended | **Yes** |
| `MASTER_KEY` | 32-byte hexadecimal key for wrapping platform provider credentials and cloud OAuth tokens. | Yes | **Yes** |
| `LLM_CHALLENGE_SECRET` | 32-byte secret for domain-separated HMAC challenge token signing on `/api/ai/agent`. | Yes | **Yes** |
| `MAX_UPLOAD_MB` | Maximum upload ceiling for multipart parsing (hard-clamped to `10` in code). | Recommended (`10`) | No |
| `MAIN_ADMIN_EMAIL` | Administrator email address authorized to access `/api/admin/*`. | Yes | No |
| `GEMINI_API_KEY` | Google Gemini API key powering Smart Gateway and default prompts. | Optional (if BYOK used) | **Yes** |
| `CLOUDFLARE_TURNSTILE_SECRET_KEY` | Secret key for server-side CAPTCHA token verification. | Recommended | **Yes** |
| `VITE_CLOUDFLARE_TURNSTILE_SITE_KEY` | Public site key for client Turnstile widget rendering. | Recommended | No |

---

## 5. Supabase Database Setup & Migrations

### 5.1 Network Restrictions & HTTPS Rest API Architecture
- **Supabase Network Restrictions**: In production, direct Postgres TCP connections (`5432`/`6543`) are restricted to the owner's workstation `/32` IP.
- **Durable Persistence via REST**: The Express server communicates with Supabase exclusively over HTTPS (`PostgREST`, `GoTrue`, and `Storage` via `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`). `projectStore.ts` automatically selects `createRestProjectStore` whenever Supabase credentials are configured, avoiding any direct TCP dependencies.

### 5.2 Remote Database Synchronization & Safety Pre-Checks
All database schema definitions and security policies are version-controlled in `supabase/migrations/`.

> [!CAUTION]
> **Production Safety Rule (Count-Only Pre-Check & Backup)**:
> Before running `npx supabase db push` against production, verify the migration on a local Docker Supabase instance (`./scripts/verify-local-supabase.sh`), run the count-only query in [`HOTFIX2_DEPLOY.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/HOTFIX2_DEPLOY.md), and generate an encrypted database backup dump.

To inspect pending migrations without applying:
```bash
# Dry-run check for unapplied migrations
SUPABASE_ACCESS_TOKEN=<your-supabase-access-token> npx supabase db push --dry-run --project-ref <your-project-ref>
```

To apply pending migrations after verification and backup:
```bash
# Apply pending SQL migrations
SUPABASE_ACCESS_TOKEN=<your-supabase-access-token> npx supabase db push --project-ref <your-project-ref>
```

### 5.2 Storage Bucket Configuration
The platform requires an S3 storage bucket for project attachments and lecture slides:
- Bucket Name: `project-files`
- Privacy: Private (access controlled via signed URLs and RLS policies).
- Creation Script: `npx tsx scripts/create_bucket.ts`.

### 5.3 Authentication Settings in Supabase Dashboard
1. **Email Auth**:
   - Enable Email Provider.
   - Configure Site URL to production domain (e.g., `https://scholar-core.onrender.com`).
   - Add redirect URLs:
     - `https://your-domain.com/verify-email`
     - `https://your-domain.com/reset-password/confirm`
2. **Google OAuth (Optional)**:
   - Configure Google Client ID and Secret in Supabase Auth > Providers > Google.
   - Add authorized redirect URI from Supabase into Google Cloud Console.

---

## 6. Health Checks & Verification

After deployment, confirm operational status:
- **Liveness & Readiness**: Query `GET https://your-domain.com/health` (must return HTTP 200 with `{ "status": "ok" }`).
- **CSP Headers**: Confirm Content Security Policy headers allow Supabase and Gemini endpoints without browser console violations.
- **Signup Flow**: Test user registration with CAPTCHA verification to confirm end-to-end connectivity.
