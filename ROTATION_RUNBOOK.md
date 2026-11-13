# End-of-Project Credential Rotation & History Scrub Runbook (`ROTATION_RUNBOOK.md`)

> **Dated record.** This document captures a point in time (an incident, audit, plan or status ledger) and is not kept in sync with the code. For current behaviour read [`docs/README.md`](docs/README.md). Details here, such as `render.yaml` settings, file names, line numbers and counts, may no longer match `main`.

**Purpose**: Complete, step-by-step runbook to rotate all leaked credentials (`F-01`) at project end, re-wrap encrypted platform credentials, revoke/purge cloud OAuth tokens, remove `DATABASE_URL` from CI, and scrub git history.  
**Security Rule**: This document uses `<PLACEHOLDERS>` only. Never paste real secret values into repo files or commit messages.

---

## 1. Complete Inventory of Leaked Credentials & Where Each Is Used

| # | Credential | Leaked Format in `01f851f` / `28cfaa5` | Render Env (`srv-d9lgbn710e5c73dl8sk0`) | GitHub Actions Secrets (`docgovinda-glitch/scholar-agentic-os`) | Supabase Edge Function Secrets (`gfjhsijrwodjvkisouzw`) | Vite Build Args (`Dockerfile` / `deploy.yml`) | Local `.env` & Scripts |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Supabase Secret / Service-Role Key** (`SUPABASE_SERVICE_ROLE_KEY`) | `sb_secret_<REDACTED>` (new API key architecture) | `SUPABASE_SERVICE_ROLE_KEY` | Not used in CI | Auto-injected by Supabase runtime (`SUPABASE_SERVICE_ROLE_KEY`) | Never passed to Vite | `.env`, `scripts/seedAiRegistry.ts`, `scripts/create_bucket.ts`, `scripts/reset-all-vaults.ts` |
| **2** | **Postgres Superuser Password** (`DATABASE_URL`) | `postgresql://postgres.gfjhsijrwodjvkisouzw:<DB_PASSWORD>@...` | Remove from Render (app uses PostgREST over HTTPS) | **REMOVE from GitHub Actions Secrets** (`gh secret delete DATABASE_URL`; unused by `ci.yml` and `deploy.yml`) | Not used | Removed from `deploy.yml` in PR #72 | `.env`, `scripts/apply-*.ts`, `scripts/rewrap-platform-credentials.ts` |
| **3** | **`ENCRYPTION_KEY` / `MASTER_KEY`** | 64-char hex (`ENCRYPTION_KEY`) | `MASTER_KEY` (32-byte base64 used by `credentialVault.ts` & `vault.ts`) / `ENCRYPTION_KEY` (legacy) | Not used | Not used | Never passed to Vite | `.env`, `scripts/rewrap-platform-credentials.ts` |
| **4** | **GitHub Personal Access Token (`GitHub PAT`)** | `ghp_<REDACTED>` (classic PAT) | Not used | Not used (Actions uses automatic `GITHUB_TOKEN`) | Not used | Never | Local git credential helper / operator CLI |
| **5** | **Cloudflare Global API Key** | 52-char hex/token + Zone ID | Not used at runtime | Not used | Not used | Never | Used manually on `2026-08-04` for DNS setup |
| **6** | **Resend API Key** (`RESEND_API_KEY`) | `re_<REDACTED>` | `RESEND_API_KEY` *(legacy)* | Not used | `RESEND_API_KEY` (used by `request-profile-update`) | Never | `.env` |
| **7** | **Render Deploy Key** (`RENDER_DEPLOY_KEY`) | 29-char alphanumeric hook key | Configured under Render Service → Settings → Deploy Hook | `RENDER_DEPLOY_KEY` | Not used | Never | None |
| **8** | **Supabase JWT Secret & Anon Key** (`SUPABASE_JWT_SECRET` / `VITE_SUPABASE_ANON_KEY`) | `VITE_SUPABASE_ANON_KEY` (`eyJ...`) in `deploy.yml` & source fallbacks (`F-05`) | `SUPABASE_JWT_SECRET`, `VITE_SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` | Auto-injected by Supabase runtime | **YES** (`VITE_SUPABASE_ANON_KEY` baked into client bundle at `vite build` time) | `.env` |

---

## 2. Supabase `SUPABASE_SERVICE_ROLE_KEY` Rotation: New `sb_secret_...` Keys vs. Legacy JWT Keys

### 2.1 Least Disruptive Path: Rotate `sb_secret_...` API Key Only (Zero Session Downtime)
Because the leaked key in `INFRASTRUCTURE_REFERENCE.md` uses Supabase's new **Secret API Key** format (`sb_secret_<REDACTED>`):
- **How Supabase's New API Keys Work**:
  - `sb_secret_...` keys are managed in **Supabase Dashboard → Project Settings → API Keys → Secret keys**.
  - Unlike the legacy `service_role` JWT, `sb_secret_...` keys are **not** signed with `SUPABASE_JWT_SECRET`; Supabase's API Gateway validates them independently and translates them internally into a `service_role` Postgres session.
  - Multiple `sb_secret_...` keys can coexist during rotation!
- **Impact of Rotating `sb_secret_...`**:
  - **User sessions**: **Zero impact** — active signed-in users stay signed in.
  - **`VITE_SUPABASE_ANON_KEY` build arg**: **Zero impact** — no client rebuild needed.
  - **`verifyLocalJwt` / `SUPABASE_JWT_SECRET`**: **Zero impact** — `SUPABASE_JWT_SECRET` does not change.

> [!CAUTION]
> **CRITICAL PREREQUISITE BEFORE DISABLING LEGACY JWT API KEYS**:
> In Supabase's API Keys settings, disabling **Legacy JWT-based API keys** (`anon` and `service_role` `eyJ...` JWTs) disables **both** the legacy `service_role` JWT **and** the legacy `anon` JWT (`eyJ...`) simultaneously!
> Because production currently passes the legacy `eyJ...` anon key as `VITE_SUPABASE_ANON_KEY`, disabling Legacy API Keys before migrating the frontend to a new **Publishable key** (`sb_publishable_...`) will **immediately break login and all browser Supabase requests**.
> - **If you only rotate `sb_secret_...`**: Leave Legacy API Keys enabled until you are ready to switch `VITE_SUPABASE_ANON_KEY`.
> - **If you want to disable Legacy JWT API Keys**:
>   1. First create a **Publishable key** (`sb_publishable_<NEW>`) in **Project Settings → API Keys**.
>   2. Set `VITE_SUPABASE_ANON_KEY=sb_publishable_<NEW>` in **Render Dashboard → Environment** and in **GitHub Actions Secrets** (`gh secret set VITE_SUPABASE_ANON_KEY`).
>   3. Trigger a full Render build & deploy (`Clear build cache & deploy`) so Vite bakes `sb_publishable_<NEW>` into the static client bundle.
>   4. Verify browser login and `/rest/v1/*` requests succeed using `sb_publishable_<NEW>`.
>   5. **Only after step 4 succeeds**, disable Legacy JWT-based API keys in the Supabase Dashboard.

- **Step-by-Step (`sb_secret_...` Rotation)**:
  1. In **Supabase Dashboard → Project Settings → API Keys**, click **Create new secret key** (e.g., name: `render-prod-2026-10`). Copy `<NEW_SB_SECRET_KEY>`.
  2. In **Render Dashboard → `scholar-agentic-os` → Environment**, update `SUPABASE_SERVICE_ROLE_KEY=<NEW_SB_SECRET_KEY>`, save, and wait ~90 seconds for the rolling restart to complete.
  3. In **Supabase Dashboard → Project Settings → API Keys**, click **Revoke / Delete** on the old leaked `sb_secret_<OLD>` key.
  4. **Confirm Old Key No Longer Works**:
     ```bash
     curl -i -s "https://gfjhsijrwodjvkisouzw.supabase.co/rest/v1/profiles?select=id&limit=1" \
       -H "apikey: <OLD_SB_SECRET_KEY>" \
       -H "Authorization: Bearer <OLD_SB_SECRET_KEY>"
     # Expected: HTTP/2 401 Unauthorized
     ```

### 2.2 Optional Full JWT Secret Rotation (Only If Rotating `SUPABASE_JWT_SECRET`)
- **Impact**:
  - Immediately invalidates **all** active user sessions (`access_token`s), the legacy `anon` JWT, and the legacy `service_role` JWT.
  - Requires updating `SUPABASE_JWT_SECRET` and `VITE_SUPABASE_ANON_KEY` on Render, updating `VITE_SUPABASE_ANON_KEY` in GitHub Actions Secrets, and running a full Docker/Vite build (`npm run build`) because `VITE_SUPABASE_ANON_KEY` is baked into the static frontend bundle at build time (`Dockerfile:30`).
  - Expected downtime: **~2–3 minutes** while the new frontend bundle builds and deploys on Render.

---

## 3. Ordered Rotation Procedure (All Other Leaked Credentials)

Execute in the order below to maintain **zero downtime** across steps 1–5 and **<90 seconds rolling restart** on step 6:

### Step 1 — GitHub Personal Access Token (`GitHub PAT`) — *0s Downtime*
1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)** (`https://github.com/settings/tokens`).
2. Delete the leaked token (`ghp_<OLD>`).
3. If you need a CLI token locally, generate a Fine-Grained PAT scoped strictly to `docgovinda-glitch/scholar-agentic-os` with 30-day expiration.
4. **Confirm Old Value Fails**:
   ```bash
   curl -i -s -H "Authorization: token <OLD_GITHUB_PAT>" https://api.github.com/user
   # Expected: HTTP/2 401 Bad credentials
   ```

### Step 2 — Cloudflare API Key / Token — *0s Downtime*
1. Go to **Cloudflare Dashboard → My Profile → API Tokens** (`https://dash.cloudflare.com/profile/api-tokens`).
2. Roll/Regenerate the **Global API Key** (and revoke any API Tokens created on `2026-08-04`).
3. **Confirm Old Value Fails**:
   ```bash
   curl -i -s "https://api.cloudflare.com/client/v4/user/tokens/verify" \
     -H "Authorization: Bearer <OLD_CF_KEY>"
   # Expected: HTTP 400 / 401 Invalid API Token
   ```

### Step 3 — Render Deploy Hook Key (`RENDER_DEPLOY_KEY`) — *0s Downtime*
1. In **Render Dashboard → `scholar-agentic-os` → Settings → Deploy Hook**, click **Regenerate Deploy Hook** and copy the new `?key=<NEW_RENDER_DEPLOY_KEY>` parameter.
2. Update the GitHub Actions repository secret:
   ```bash
   gh secret set RENDER_DEPLOY_KEY -R docgovinda-glitch/scholar-agentic-os
   # Paste <NEW_RENDER_DEPLOY_KEY>
   ```
3. **Confirm Old Value Fails**:
   ```bash
   curl -i -s -X POST "https://api.render.com/deploy/srv-d9lgbn710e5c73dl8sk0?key=<OLD_RENDER_DEPLOY_KEY>"
   # Expected: HTTP 401 Unauthorized (does NOT trigger a deploy)
   ```

### Step 4 — Resend API Key (`RESEND_API_KEY`) — *0s Downtime*
1. In **Resend Dashboard → API Keys** (`https://resend.com/api-keys`), click **Create API Key** (Sending access only, scoped to domain `gkshah.com.np`). Copy `<NEW_RESEND_API_KEY>`.
2. Update the Supabase Edge Function secret:
   ```bash
   npx supabase secrets set RESEND_API_KEY="<NEW_RESEND_API_KEY>" --project-ref gfjhsijrwodjvkisouzw
   ```
3. (If `RESEND_API_KEY` is also set in Render Environment, update or remove it in Render Dashboard.)
4. In **Resend Dashboard → API Keys**, click **Revoke** on the old leaked `re_<OLD>` key.
5. **Confirm Old Value Fails**:
   ```bash
   curl -i -s -X POST "https://api.resend.com/emails" \
     -H "Authorization: Bearer <OLD_RESEND_API_KEY>" \
     -H "Content-Type: application/json" \
     -d '{}'
   # Expected: HTTP 401 / 403 Invalid API key
   ```

### Step 5 — Postgres Database Password (`DATABASE_URL`) & Removal from CI — *0s App Downtime*
Because the Express server uses PostgREST over HTTPS (`VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) whenever both are set ([`projectStore.ts:139-142`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/store/projectStore.ts#L139-L142)), rotating the Postgres password causes **zero application downtime**:
1. In **Supabase Dashboard → Project Settings → Database → Database password**, click **Reset database password** and generate a new strong password (`<NEW_DB_PASSWORD>`).
2. In **Render Dashboard → `scholar-agentic-os` → Environment**, **delete** `DATABASE_URL` so the app never opens direct `pg.Pool` connections and relies purely on PostgREST over HTTPS.
3. **Delete `DATABASE_URL` from GitHub Actions Secrets** (neither `.github/workflows/ci.yml` nor `.github/workflows/deploy.yml` uses `DATABASE_URL`, and PR #72 removed the unused `DATABASE_URL` env reference from `deploy.yml`):
   ```bash
   gh secret delete DATABASE_URL -R docgovinda-glitch/scholar-agentic-os
   ```
4. **Confirm Old Password Fails**:
   ```bash
   PGPASSWORD="<OLD_DB_PASSWORD>" psql \
     "postgresql://postgres.gfjhsijrwodjvkisouzw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require" \
     -c "SELECT 1;"
   # Expected: FATAL: password authentication failed for user "postgres"
   ```

### Step 6 — `ENCRYPTION_KEY` / `MASTER_KEY` & Upstream AI Provider Keys
#### 6.1 Re-Wrap the Saved User Keys (`user_provider_keys`) Under a Fresh `MASTER_KEY`
> Update (the Premium removal, PR #196): `platform_provider_credentials` and its re-wrap script no longer exist. The only table the AI features keep encrypted under `MASTER_KEY` is `user_provider_keys` (users' saved API keys, including backup keys `provider#2` / `#3`). Cloud-drive OAuth tokens are wrapped under the same key by the vault route; check `server/routes/vault.ts` before rotating.

**Order matters: re-wrap first, then change `MASTER_KEY` on the server.** A row still wrapped under the old key becomes unreadable the moment the server starts with the new one, and that user's saved keys stop syncing.

1. Generate a fresh 32-byte base64 `MASTER_KEY` locally without printing it to terminal history:
   ```bash
   node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
   ```
2. Dry run (writes nothing). The output must show `"unreadableWithOldKey": 0` and `"readableWithOldKey"` equal to `"totalRows"`:
   ```bash
   OLD_MASTER_KEY="<CURRENT_MASTER_KEY>" \
   NEW_MASTER_KEY="<NEW_MASTER_KEY_BASE64>" \
   DATABASE_URL="<DATABASE_URL>" \
     npx tsx scripts/rewrap-user-keys.ts
   ```
   If some rows are unreadable with the old key, stop: they were already lost (an earlier key change) or `OLD_MASTER_KEY` is wrong. `--skip-unreadable` leaves those rows as they are.
3. Execute (one transaction; refuses to run while unreadable rows exist unless `--skip-unreadable`):
   ```bash
   OLD_MASTER_KEY="<CURRENT_MASTER_KEY>" NEW_MASTER_KEY="<NEW_MASTER_KEY_BASE64>" DATABASE_URL="<DATABASE_URL>" \
     npx tsx scripts/rewrap-user-keys.ts --execute
   ```
4. Immediately update `MASTER_KEY=<NEW_MASTER_KEY_BASE64>` (and remove legacy `ENCRYPTION_KEY`) in **Render Dashboard → Environment**, and redeploy.
5. **Check:** sign in, open AI Access, and confirm saved keys sync. The server logs `userKeyVault: N saved key row(s) could not be decrypted` and `GET /api/ai-access/keys/sync` returns `unreadable: N` if any row is left behind. Re-running the dry run with `OLD_MASTER_KEY` as `NEW_MASTER_KEY` and the new key as `OLD_MASTER_KEY` must report `unreadableWithOldKey: 0`.

#### 6.2 Upstream LLM Provider Keys & Tavily Key to Rotate
Because anyone who held both the leaked `SUPABASE_SERVICE_ROLE_KEY` and `MASTER_KEY`/`ENCRYPTION_KEY` before rotation could have decrypted saved user keys (or read `TAVILY_API_KEY`), rotate every configured platform key in its upstream dashboard and save the new key via the Scholar Core **Admin Panel → AI Infrastructure** (or `storeCredential`):
1. **Tavily Search API** (`TAVILY_API_KEY` — update in both Render Environment and Supabase Edge Function secrets: `npx supabase secrets set TAVILY_API_KEY="<NEW_TAVILY_KEY>" --project-ref gfjhsijrwodjvkisouzw`)
2. **Google Gemini** (`gemini` — Google AI Studio)
3. **OpenAI** (`openai` — OpenAI Platform)
4. **Anthropic** (`anthropic` — Anthropic Console)
5. **Groq** (`groq` — GroqCloud Console)
6. **Mistral AI** (`mistral` — Mistral Console)
7. **Cohere** (`cohere` — Cohere Dashboard)
8. **xAI (Grok)** (`xai` — xAI Console)
9. **OpenRouter** (`openrouter` — OpenRouter Keys)
10. **Together AI** (`together` — Together Settings)
11. **DeepSeek** (`deepseek` — DeepSeek Platform)
12. **Alibaba Qwen (DashScope)** (`qwen` — DashScope Console)

---

## 4. Plan to Revoke & Force Reconnection of OAuth Tokens in `user_cloud_integrations` (Google Drive & Microsoft OneDrive)

Because Google Drive, Microsoft OneDrive, Zotero, and Mendeley OAuth `access_token` and `refresh_token` rows in `public.user_cloud_integrations` were stored in plaintext prior to PR #79 (`F-08`), and because PR #79's `encryptCloudToken` uses `MASTER_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (which is leaked until Step 6 above completes):

1. **Google Drive Token Revocation (`provider = 'google_drive'`)**:
   - Before deleting rows, best-effort revoke each Google OAuth token via Google's RFC 7009 revocation endpoint:
     ```bash
     curl -sS -X POST "https://oauth2.googleapis.com/revoke" \
       -H "Content-Type: application/x-www-form-urlencoded" \
       -d "token=<GOOGLE_ACCESS_OR_REFRESH_TOKEN>"
     ```
2. **Microsoft OneDrive Token Invalidations (`provider = 'onedrive'`)**:
   - **Important Protocol Difference**: Unlike Google, the Microsoft identity platform (`login.microsoftonline.com/common/oauth2/v2.0`) does **not** provide an RFC 7009 single-token revocation endpoint for delegated `Files.Read` access/refresh tokens (Microsoft Graph's `POST /me/revokeSignInSessions` revokes all Microsoft sessions for the user and requires `User.ReadWrite.All` scope, which Scholar Core does not request).
   - **How to Invalidate All Issued OneDrive Refresh Tokens Centrally**:
     1. Open **Microsoft Entra Admin Center (`https://entra.microsoft.com`) → Applications → App registrations → Scholar Core → Certificates & secrets**.
     2. Create a new **Client secret** (`<NEW_MICROSOFT_CLIENT_SECRET>`), update `MICROSOFT_CLIENT_SECRET` in **Render Dashboard → Environment**, and **delete the old Client secret**. Any attacker attempting to exchange a leaked OneDrive `refresh_token` without the valid `MICROSOFT_CLIENT_SECRET` (for confidential web clients) is rejected by Microsoft's token endpoint.
     3. Instruct OneDrive users in `USER_NOTICE.md` to revoke app consent directly at `https://account.live.com/consent/Manage` (personal Microsoft accounts) or `https://myapps.microsoft.com` (work/school Entra ID accounts), which immediately invalidates both access and refresh tokens at Microsoft.
3. **Database Purge Migration (`20261028010000_purge_plaintext_credentials.sql`) & Post-Rotation Wipe**:
   - Migration [`supabase/migrations/20261028010000_purge_plaintext_credentials.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20261028010000_purge_plaintext_credentials.sql) deletes all existing plaintext rows in `public.api_credentials` and `public.user_cloud_integrations` and drops direct client `SELECT`/`INSERT`/`UPDATE` policies on `public.user_cloud_integrations`.
   - When Step 6 (`MASTER_KEY` rotation) is executed at project end, run:
     ```sql
     BEGIN;
     DELETE FROM public.user_cloud_integrations;
     DELETE FROM public.api_credentials;
     COMMIT;
     ```
     so any tokens encrypted under the old `MASTER_KEY` are also purged and re-issued under `<NEW_MASTER_KEY_BASE64>`.
4. **User Experience on Next Vault Visit**:
   - [`src/services/vault/cloudDriveService.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/vault/cloudDriveService.ts) and `/api/vault/drive/files` / `/api/vault/onedrive/files` return `404` (`"Google Drive not connected"` / `"OneDrive not connected"`) when no row exists in `user_cloud_integrations`, prompting the user in the Vault UI to click **Connect Google Drive** / **Connect OneDrive** again.

---

## 5. Git History Rewrite Commands (Execute ONLY After All Rotations Above Are Complete)

> [!CAUTION]
> **Run only after all leaked credentials have been rotated**, and coordinate with any collaborators (`Aaditya Sah`) beforehand because `git filter-repo` rewrites commit SHAs across all branches.

```bash
# 1. Install git-filter-repo (if not already installed)
pip3 install git-filter-repo

# 2. Clone a fresh mirror of the repository as a backup AND working copy
cd "$HOME/Documents/Scholar Core"
git clone --mirror https://github.com/docgovinda-glitch/scholar-agentic-os.git scholar-agentic-os-backup.git
cp -R scholar-agentic-os-backup.git scholar-agentic-os-scrub.git
cd scholar-agentic-os-scrub.git

# 3. Purge the two files that contained the 7 leaked credentials across all history
git filter-repo \
  --invert-paths \
  --path INFRASTRUCTURE_REFERENCE.md \
  --path scripts/setup-infrastructure.md \
  --force

# 4. Verify neither file nor any secret prefix exists anywhere in git history
git log --all --full-history -- INFRASTRUCTURE_REFERENCE.md scripts/setup-infrastructure.md
# Expected: empty output (0 commits)

# 5. Force-push rewritten history to GitHub (Owner executes this step)
git remote add origin https://github.com/docgovinda-glitch/scholar-agentic-os.git
git push origin --force --all
git push origin --force --tags
```

After force-pushing:
- Open a ticket with GitHub Support (or use **Settings → Security → Secret scanning**) requesting cache eviction of unreachable commit objects `01f851fe90170a8abcac8faef3745825336b0165` and `28cfaa5a39218499807e1762c721ab73a3245f89`.

---

## 6. Owner decision (2026-10-30)

The owner will rotate the database password (§3 Step 5) **after the project is complete** and accepts that, until then, the old password stays in git history and Network Restrictions stay off. Do the rotations in this runbook, then §7, at handover.

## 7. Credentials given to the autonomous agent (revoke at handover)

During the completion loop (2026-10-29 → 30), the agent kept the credentials below in `~/.scholar-agent.env` on its own sandbox (`chmod 600`, outside the repo, never committed or printed). Revoke or rotate each one once the agent's work ends, even if nothing leaked.

| Name in the env file | What it is | How to revoke / rotate |
| :--- | :--- | :--- |
| `SUPABASE_ACCESS_TOKEN` | Supabase **personal access token** (Management API: SQL, auth config) | Supabase dashboard → Account → Access Tokens → revoke the agent's token. |
| `RENDER_API_KEY` | Render **API key** (env vars, deploys, service settings) | Render dashboard → Account Settings → API Keys → revoke. |
| `SUPABASE_SERVICE_ROLE_KEY` | Project service key (same value as on Render) | §2: rotate the `sb_secret_…` key, then update Render. |
| `SUPABASE_DB_PASSWORD` (+ `SUPABASE_DB_HOST`, `SUPABASE_DB_USER`) | Postgres password | §3 Step 5 (deferred by the owner, §6). |
| `SMOKE_A_EMAIL` / `SMOKE_A_PASSWORD`, `SMOKE_B_EMAIL` / `SMOKE_B_PASSWORD` | Two production **test accounts** used by `scripts/smoke-prod.sh` | Keep them if you'll run the smoke suite (change their passwords), or delete them in Supabase → Authentication → Users. They own no data between runs, because the suite deletes what it creates. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF`, `RENDER_SERVICE_ID` | Identifiers and the public anon key | Not secret; nothing to revoke. |
| *(not in the env file)* | GitHub access, through the Claude GitHub App connected to the owner's account (branches, PRs, merges) | GitHub → Settings → Applications → Installed GitHub Apps → Claude: remove the repository or uninstall if no longer wanted. |

Also generated by the agent: `LLM_CHALLENGE_SECRET` on Render (2026-10-29, a new random value). It is not in the env file. Rotating it only invalidates in-flight browser-AI challenge tokens (15-minute lifetime).

Finally, **delete the agent's env file**. If the sandbox still exists, run:

```bash
shred -u ~/.scholar-agent.env 2>/dev/null || rm -f ~/.scholar-agent.env
```

If the session has already ended, revoking the tokens above is enough: the sandbox is discarded.
