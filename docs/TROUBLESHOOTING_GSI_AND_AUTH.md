# Troubleshooting Google Sign-In & Supabase Auth Errors

This guide addresses the **`[GSI_LOGGER]: An unknown error occurred. m=transform_layer_library:88`** error and provides complete instructions for configuring Google OAuth, Supabase Auth, and syncing database migrations.

---

## 1. Root Cause Analysis: `[GSI_LOGGER]: An unknown error occurred`

### What is `GSI_LOGGER`?
`[GSI_LOGGER]` is the internal logging subsystem of **Google Identity Services (GSI)** (`https://accounts.google.com/gsi/client`). `m=transform_layer_library` is Google's minified authentication layer responsible for origin validation, cookie access, and cross-origin frame messaging (used in Google One Tap and Google Sign-In overlays).

### Why Does This Error Occur?
1. **Unregistered Authorized JavaScript Origins (Most Common)**:
   Google Identity Services strictly refuses to communicate with any origin not registered under **Authorized JavaScript origins** in your Google Cloud Console OAuth 2.0 Client credentials. If you access the application at `http://localhost:3000`, `http://localhost:5173`, or your production deployment URL (e.g. `https://scholar-agentic-os.onrender.com`), and that exact URL is missing in Google Cloud Console, Google throws:
   ```
   [GSI_LOGGER]: An unknown error occurred. m=transform_layer_library:88
   ```
2. **Third-Party Cookie / Tracking Protection Blocking**:
   Browsers blocking third-party cookies (Chrome Incognito, Brave Shields, Safari Intelligent Tracking Prevention) block `transform_layer_library` from reading Google account session cookies across origins.
3. **Browser Extensions or Google Password Manager / One Tap**:
   Chrome's built-in Google Account chooser or credential management extensions automatically attempt to initialize One Tap when loading pages with login fields. If the origin is unauthorized in Google Cloud Console, it logs this error in the developer console.

---

## 2. Step-by-Step Fix

### Step 1: Configure Google Cloud Console Credentials
1. Go to the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Select your Google Cloud project.
3. Under **OAuth 2.0 Client IDs**, click on your Web client credential.
4. **Authorized JavaScript origins**:
   Add every origin where your app runs (no trailing slashes):
   - `http://localhost:3000`
   - `http://localhost:5173`
   - `https://scholar-agentic-os.onrender.com` (or your custom domain)
5. **Authorized redirect URIs**:
   Add your Supabase Auth callback URL:
   - `https://gfjhsijrwodjvkisouzw.supabase.co/auth/v1/callback`
6. Click **Save**. *(Note: Google Cloud Console changes typically take 2–5 minutes to propagate globally).*

### Step 2: Configure Supabase Dashboard
1. Go to your [Supabase Project Dashboard](https://supabase.com/dashboard/project/gfjhsijrwodjvkisouzw).
2. Navigate to **Authentication** > **Providers** > **Google**.
3. Ensure **Enable Sign in with Google** is switched **ON**.
4. Paste your **Client ID** and **Client Secret** obtained from Google Cloud Console.
5. In **Redirect URLs** (under Authentication > URL Configuration), verify that your site URL and redirect wildcards include:
   - Site URL: `https://scholar-agentic-os.onrender.com` (or your domain)
   - Additional Redirect URLs:
     - `http://localhost:3000/**`
     - `http://localhost:5173/**`
     - `https://scholar-agentic-os.onrender.com/**`
6. Click **Save**.

### Step 3: Browser Cache Flush
If you recently migrated from older client-side Google Identity Services code:
- Clear your browser's site cache or perform a hard refresh:
  - Mac: `Cmd + Shift + R`
  - Windows/Linux: `Ctrl + F5`
- The application automatically unregisters any legacy Service Workers on boot (`src/main.tsx`).

---

## 3. Pushing Database Migrations to Supabase

The repository contains 25 database migrations under `supabase/migrations/`. To apply them to your live Supabase project (`gfjhsijrwodjvkisouzw`):

### Option A: Via Supabase Personal Access Token (Recommended)
1. Go to [Supabase Account Access Tokens](https://supabase.com/dashboard/account/tokens).
2. Click **Generate new token**, name it (e.g. `scholar-cli`), and copy the token.
3. Provide the token to Antigravity / run:
   ```bash
   npx supabase login --token <YOUR_SUPABASE_ACCESS_TOKEN>
   npx supabase db push
   ```

### Option B: Via Direct PostgreSQL Connection String
If you prefer using your database password, set `DATABASE_URL` in `.env`:
```bash
DATABASE_URL="postgresql://postgres:[YOUR_DB_PASSWORD]@db.gfjhsijrwodjvkisouzw.supabase.co:5432/postgres"
```
Then run:
```bash
npx supabase db push --db-url "$DATABASE_URL"
```

### Option C: Via Supabase SQL Editor
You can also copy the SQL from any pending migration file in `supabase/migrations/` and execute it directly in the [Supabase SQL Editor](https://supabase.com/dashboard/project/gfjhsijrwodjvkisouzw/sql/new).
