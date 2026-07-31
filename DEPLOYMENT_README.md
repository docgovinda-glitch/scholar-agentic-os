# Production Deployment Guide — Scholar Agentic Operating System

**Status: Phase 1 of `docs/planning/hosting-and-topology.md` in progress.** This replaces the previous Render + self-hosted Postgres guide, which described a backend this project no longer runs for auth/user data. Auth, profiles, and admin-approval now run on Supabase. See `docs/planning/hosting-and-topology.md` §4 for the full reasoning and what's changed.

**Important interim reality, not a simplification**: `server.ts` still needs to run somewhere. Only the auth/user/admin routes moved to Supabase in this phase — AI generation (`/api/generate*`) and four "leftover bucket" routes (`/api/parse-file`, `/api/parse-external-link`, `/api/lookup-doi`, `/api/agents*`) are unchanged and still served by Express, pending Phase 2 (`docs/planning/ai-gateway.md`) and a resolution for the leftover bucket. **This is not yet a fully static, serverless deployment** — that's a later milestone, not this one.

---

## 1. Supabase Setup (new in Phase 1)

1. Create a free project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the project's SQL Editor.
3. Deploy the Edge Functions in [`supabase/functions/`](supabase/functions/) (`send-approval-email`, `approve-registration`, `request-password-reset`, `approve-password-reset`, `request-profile-update`) via the Supabase CLI: `supabase functions deploy <name>` for each.
4. Set these as **project secrets** (Supabase dashboard → Edge Functions → Secrets, or `supabase secrets set KEY=value`) — not in this repo's `.env`, and **not** as a Render/backend environment variable (these Edge Functions run in Supabase's own environment; `server.ts` no longer reads any of them — see the corrected §3 below):
   - `RESEND_API_KEY` — Resend API key for the admin-approval/reset emails the Edge Functions send.
   - `RESEND_FROM_EMAIL` *(optional)* — sender address, e.g. `Scholar Agentic <noreply@yourverifieddomain.com>`. Defaults to Resend's shared sandbox sender (`onboarding@resend.dev`) if unset, which only delivers to the Resend account owner's own verified email — set this once a custom domain is verified in Resend to actually deliver to arbitrary scholar/admin addresses.
   - `ADMIN_EMAIL` — recipient for registration/reset/profile-update notifications. This is a **separate** value from the `ADMIN_EMAIL` in this repo's `.env` — Edge Functions run in Supabase's environment, not this repo's, so both must be set independently.
   - `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are injected automatically by Supabase into every Edge Function's environment — no manual step needed for those two.
5. In the Supabase dashboard → Authentication → Providers → Email, **disable "Confirm email"** — this app's own admin-approval gate (`profiles.is_approved`) replaces that purpose; leaving both enabled would require scholars to clear two separate gates for no added benefit.
6. If migrating existing data from the old `users.json`-based system: run `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run migrate:users-to-supabase` once (see the script's own header comment for what it does and its limitations — notably, old passwords can't be carried over; migrated users get a real Supabase password-recovery link instead).

## 2. Frontend Environment Variables

Set these wherever the static frontend is hosted (Netlify/Vercel/Cloudflare Pages environment variable settings — see §4):

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | From the Supabase project's Settings → API page. |
| `VITE_SUPABASE_ANON_KEY` | Same page. Safe to expose client-side — Row Level Security (`supabase/schema.sql`) governs actual access, not secrecy of this key. |

## 3. Interim Backend (still required this phase)

`server.ts` still needs to run for AI generation and the leftover-bucket routes listed above.

| Variable | Scope | Description |
|---|---|---|
| `ADMIN_EMAIL` | Backend | `render.yaml` declares the key (`sync: false`) but **no Render service exists yet** — there's nothing to set in a dashboard until a service is actually created at deploy time; not a blocking to-do right now. Separate from the same-named Supabase secret, which the Edge Functions read instead. |
| `ENCRYPTION_KEY` | Backend | **Still needed — this repo's §5 previously said this would be removed once the old routes were deleted; it wasn't.** The old routes are gone, but `resolveApiKey`/`decryptServerKey` (server-stored provider API keys, a fallback path for `/api/generate*`) were deliberately kept and still read this at startup. |
| `GEMINI_API_KEY` | Backend | Primary Google Gemini key for AI generation — unchanged, still needed. |
| `GEMINI_API_KEY_BACKUP` | Backend | Secondary Gemini key — unchanged. |
| `PORT` | Backend | Defaults to `3000` — unchanged. |
| ~~`DATABASE_URL`~~ | — | **Removed.** The Postgres instance this pointed at is replaced by Supabase; nothing in `server.ts` reads this variable (it never actually connected to a live database in the first place — see `.claude/HANDOVER.md`'s ARCH-1/ARCH-2 findings). |
| ~~`RESEND_API_KEY`~~ | — | **Not read by `server.ts` at all** — the auth/user/admin routes that used it were already removed. If this is set on your Render service, it does nothing; the real Resend config lives in Supabase Edge Function secrets (§1). |

Deploy this interim backend the same way as before (Render Web Service, `npm install && npm run build`, `npm start`) — just without provisioning a database for it anymore.

## 4. Frontend (Static Hosting)

Unchanged in spirit from before, still via [`netlify.toml`](netlify.toml) (build command `npm run build`, publish directory `dist`, SPA redirect already configured) — Netlify, Vercel, or Cloudflare Pages all work equally well per `docs/planning/hosting-and-topology.md` §1. Add the two `VITE_SUPABASE_*` variables from §2 in whichever provider's dashboard is used.

---

## 5. Cleanup status

- **Done**: the superseded auth/user/admin routes (`/api/check-approval`, `/api/request-password-reset`, `/api/approve-reset`, `/api/register`, `/api/verify-and-sync-profile`, `/api/save-model-preferences`, `/api/save-api-keys`, `/api/approve`, `/api/request-profile-update`, `/api/approve-profile-update`) and their `writeUsersDb`/`encryptServerKey` helpers were removed from `server.ts`. `RESEND_API_KEY` is no longer read anywhere in `server.ts` — safe to remove from the interim backend's environment (§3).
- **Deliberately kept**: `readUsersDb`/`findUserByUsername`/`decryptServerKey`/`resolveApiKey` and the `UserRecord`/`USERS_DB_PATH` they use — still load-bearing for `/api/generate*`'s server-stored-API-key fallback, which is why `ENCRYPTION_KEY` (§3) is still required.
- **Still pending**: `request-password-reset` and `approve-password-reset` Edge Functions (superseded by Supabase Auth's own self-service `resetPasswordForEmail`/`updateUser` flow) and the `pending_password_resets` table are unused dead code, not yet removed. `users.json` and `database_schema.sql` are likewise unused but not yet retired.
