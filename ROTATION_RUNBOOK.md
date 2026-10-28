# End-of-Project Credential Rotation & History Scrub Runbook (`ROTATION_RUNBOOK.md`)

**Purpose**: Complete, step-by-step runbook to rotate all leaked credentials (`F-01`) at project end, re-wrap encrypted platform credentials, force cloud OAuth reconnection, and scrub git history.  
**Security Rule**: This document uses `<PLACEHOLDERS>` only. Never paste real secret values into repo files or commit messages.

---

## 1. Complete Inventory of Leaked Credentials & Where Each Is Used

| # | Credential | Leaked Format in `01f851f` / `28cfaa5` | Render Env (`srv-d9lgbn710e5c73dl8sk0`) | GitHub Actions Secrets (`docgovinda-glitch/scholar-agentic-os`) | Supabase Edge Function Secrets (`gfjhsijrwodjvkisouzw`) | Vite Build Args (`Dockerfile` / `deploy.yml`) | Local `.env` & Scripts |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Supabase Secret / Service-Role Key** (`SUPABASE_SERVICE_ROLE_KEY`) | `sb_secret_<REDACTED>` (new API key architecture) | `SUPABASE_SERVICE_ROLE_KEY` | Not used in CI | Auto-injected by Supabase runtime (`SUPABASE_SERVICE_ROLE_KEY`) | Never passed to Vite | `.env`, `scripts/seedAiRegistry.ts`, `scripts/create_bucket.ts`, `scripts/reset-all-vaults.ts` |
| **2** | **Postgres Superuser Password** (`DATABASE_URL`) | `postgresql://postgres.gfjhsijrwodjvkisouzw:<DB_PASSWORD>@...` | `DATABASE_URL` *(optional fallback when `SUPABASE_SERVICE_ROLE_KEY` is set)* | `DATABASE_URL` *(in `deploy.yml:47`)* | Not used | Passed in `deploy.yml:47` (unused by Vite build) | `.env`, `scripts/apply-*.ts`, `scripts/rewrap-platform-credentials.ts` |
| **3** | **`ENCRYPTION_KEY` / `MASTER_KEY`** | 64-char hex (`ENCRYPTION_KEY`) | `MASTER_KEY` (32-byte base64 used by `credentialVault.ts`) / `ENCRYPTION_KEY` (legacy) | Not used | Not used | Never passed to Vite | `.env`, `scripts/rewrap-platform-credentials.ts` |
| **4** | **GitHub Personal Access Token (`GitHub PAT`)** | `ghp_<REDACTED>` (classic PAT) | Not used | Not used (Actions uses automatic `GITHUB_TOKEN`) | Not used | Never | Local git credential helper / operator CLI |
| **5** | **Cloudflare Global API Key** | 52-char hex/token + Zone ID | Not used at runtime | Not used | Not used | Never | Used manually on `2026-08-04` for DNS setup |
| **6** | **Resend API Key** (`RESEND_API_KEY`) | `re_<REDACTED>` | `RESEND_API_KEY` *(legacy)* | Not used | `RESEND_API_KEY` (used by `request-profile-update`) | Never | `.env` |
| **7** | **Render Deploy Key** (`RENDER_DEPLOY_KEY`) | 29-char alphanumeric hook key | Configured under Render Service → Settings → Deploy Hook | `RENDER_DEPLOY_KEY` (`deploy.yml:62`) | Not used | Never | None |
| **8** | **Supabase JWT Secret & Anon Key** (`SUPABASE_JWT_SECRET` / `VITE_SUPABASE_ANON_KEY`) | `VITE_SUPABASE_ANON_KEY` (`eyJ...`) in `deploy.yml` & source fallbacks (`F-07`) | `SUPABASE_JWT_SECRET`, `VITE_SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` | Auto-injected by Supabase runtime | **YES** (`VITE_SUPABASE_ANON_KEY` baked into client bundle at `vite build` time) | `.env` |

---

## 2. Supabase `SUPABASE_SERVICE_ROLE_KEY` Rotation: New `sb_secret_...` Keys vs. Legacy JWT Secret Rotation

### 2.1 Least Disruptive Path: Rotate `sb_secret_...` API Key Only (Zero Session Downtime)
Because the leaked key in `INFRASTRUCTURE_REFERENCE.md` uses Supabase's new **Secret API Key** format (`sb_secret_<REDACTED>`):
- **How Supabase's New API Keys Work**:
  - `sb_secret_...` keys are managed in **Supabase Dashboard → Project Settings → API Keys → Secret keys**.
  - Unlike the legacy `service_role` JWT, `sb_secret_...` keys are **not** signed with `SUPABASE_JWT_SECRET`; Supabase's API Gateway validates them independently and translates them internally into a short-lived `service_role` Postgres session.
  - Multiple `sb_secret_...` keys can coexist during rotation!
- **Impact of Rotating `sb_secret_...`**:
  - **User sessions**: **Zero impact** — active signed-in users stay signed in.
  - **`VITE_SUPABASE_ANON_KEY` build arg**: **Zero impact** — no client rebuild needed.
  - **`verifyLocalJwt` / `SUPABASE_JWT_SECRET`**: **Zero impact** — `SUPABASE_JWT_SECRET` does not change.
- **Step-by-Step**:
  1. In **Supabase Dashboard → Project Settings → API Keys**, click **Create new secret key** (e.g., name: `render-prod-2026-10`). Copy `<NEW_SB_SECRET_KEY>`.
  2. Also verify in the **Legacy API Keys** tab whether the legacy `service_role` JWT is enabled; if the legacy `service_role` JWT was never leaked, disable legacy API keys (or leave `SUPABASE_JWT_SECRET` untouched unless performing Section 2.2).
  3. In **Render Dashboard → `scholar-agentic-os` → Environment**, update `SUPABASE_SERVICE_ROLE_KEY=<NEW_SB_SECRET_KEY>`, save, and wait ~90 seconds for the rolling restart to complete.
  4. In **Supabase Dashboard → Project Settings → API Keys**, click **Revoke / Delete** on the old leaked `sb_secret_<OLD>` key.
  5. **Confirm Old Key No Longer Works**:
     ```bash
     curl -i -s "https://gfjhsijrwodjvkisouzw.supabase.co/rest/v1/profiles?select=id&limit=1" \
       -H "apikey: <OLD_SB_SECRET_KEY>" \
       -H "Authorization: Bearer <OLD_SB_SECRET_KEY>"
     # Expected: HTTP/2 401 Unauthorized
     ```

### 2.2 Optional Full JWT Secret Rotation (Only If Rotating `SUPABASE_JWT_SECRET` / `VITE_SUPABASE_ANON_KEY`)
- **Impact**:
  - Immediately invalidates **all** active user sessions (`access_token`s), the legacy `anon` JWT (`VITE_SUPABASE_ANON_KEY`), and the legacy `service_role` JWT.
  - Requires updating `SUPABASE_JWT_SECRET` and `VITE_SUPABASE_ANON_KEY` on Render, updating `VITE_SUPABASE_ANON_KEY` in GitHub Actions Secrets, and running a full Docker/Vite build (`npm run build`) because `VITE_SUPABASE_ANON_KEY` is baked into the static frontend bundle at build time (`Dockerfile:30`).
  - Expected downtime: **~2–3 minutes** while the new frontend bundle builds and deploys on Render.

---

## 3. Ordered Rotation Procedure (All Other Leaked Credentials)

Execute in the order below to maintain **zero downtime** across steps 1–6 and **<90 seconds rolling restart** on step 7:

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

### Step 5 — Postgres Database Password (`DATABASE_URL`) — *0s App Downtime*
Because the Express server uses PostgREST over HTTPS (`VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) whenever both are set ([`projectStore.ts:139-142`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/store/projectStore.ts#L139-L142)), rotating the Postgres password causes **zero application downtime**:
1. In **Supabase Dashboard → Project Settings → Database → Database password**, click **Reset database password** and generate a new strong password (`<NEW_DB_PASSWORD>`).
2. In **Render Dashboard → `scholar-agentic-os` → Environment**, either **remove** `DATABASE_URL` (recommended so only PostgREST is used) or update `DATABASE_URL` with `<NEW_DB_PASSWORD>`.
3. In **GitHub Actions Secrets**, update or remove `DATABASE_URL`:
   ```bash
   gh secret set DATABASE_URL -R docgovinda-glitch/scholar-agentic-os
   ```
4. **Confirm Old Password Fails**:
   ```bash
   PGPASSWORD="<OLD_DB_PASSWORD>" psql \
     "postgresql://postgres.gfjhsijrwodjvkisouzw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require" \
     -c "SELECT 1;"
   # Expected: FATAL: password authentication failed for user "postgres"
   ```

### Step 6 — `ENCRYPTION_KEY` / `MASTER_KEY` & Upstream AI Provider Keys
#### 6.1 Re-Wrap `platform_provider_credentials` Under a Fresh `MASTER_KEY`
1. Generate a fresh 32-byte base64 `MASTER_KEY` locally without printing it to terminal history:
   ```bash
   node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
   ```
2. Run [`scripts/rewrap-platform-credentials.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/scripts/rewrap-platform-credentials.ts) in **`--dry-run`** mode first:
   ```bash
   OLD_MASTER_KEY="<CURRENT_MASTER_KEY_OR_HEX_ENCRYPTION_KEY>" \
   NEW_MASTER_KEY="<NEW_MASTER_KEY_BASE64>" \
   DATABASE_URL="<NEW_DATABASE_URL>" \
     npx tsx scripts/rewrap-platform-credentials.ts --dry-run
   ```
   Confirm the JSON output reports `"mode": "dry-run"` and `"verifiedDecryptableRows"` equals `"totalRowsFound"`.
3. Execute the single-transaction re-wrap (`--execute`):
   ```bash
   OLD_MASTER_KEY="<CURRENT_MASTER_KEY_OR_HEX_ENCRYPTION_KEY>" \
   NEW_MASTER_KEY="<NEW_MASTER_KEY_BASE64>" \
   DATABASE_URL="<NEW_DATABASE_URL>" \
     npx tsx scripts/rewrap-platform-credentials.ts --execute
   ```
4. Immediately update `MASTER_KEY=<NEW_MASTER_KEY_BASE64>` (and remove legacy `ENCRYPTION_KEY`) in **Render Dashboard → Environment**.
5. **Confirm Old `MASTER_KEY` Fails**: Re-running `--dry-run` with `OLD_MASTER_KEY` now throws `DecryptionError: Decryption failed — wrong key`.

#### 6.2 Upstream LLM Provider Keys & Tavily Key to Rotate
Because anyone who held both the leaked `SUPABASE_SERVICE_ROLE_KEY` and `MASTER_KEY`/`ENCRYPTION_KEY` before rotation could have decrypted rows in `platform_provider_credentials` (or read `TAVILY_API_KEY`), rotate every configured platform key in its upstream dashboard and save the new key via the Scholar Core **Admin Panel → AI Infrastructure** (or `storeCredential`):
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

## 4. Plan to Revoke & Force Reconnection of OAuth Tokens in `user_cloud_integrations`

Because Google Drive and Microsoft OneDrive OAuth `access_token` and `refresh_token` rows in `public.user_cloud_integrations` were stored in plaintext during the exposure window (`F-11`):
1. **Server-Side Revocation & Table Wipe**:
   - For any existing rows in `public.user_cloud_integrations`:
     - Best-effort revoke each Google token via `POST https://oauth2.googleapis.com/revoke?token=<token>`.
     - Delete all pre-rotation rows in `public.user_cloud_integrations` so no pre-exposure token remains trusted:
       ```sql
       BEGIN;
       DELETE FROM public.user_cloud_integrations;
       COMMIT;
       ```
2. **User Experience on Next Vault Visit**:
   - [`src/services/vault/cloudDriveService.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/vault/cloudDriveService.ts) and `/api/vault/drive/files` / `/api/vault/onedrive/files` already return `404` (`"Google Drive not connected"` / `"OneDrive not connected"`) when no row exists in `user_cloud_integrations`, prompting the user in the Vault UI to click **Connect Google Drive** / **Connect OneDrive** again.
   - Once Task 4.7 lands, all newly connected OAuth tokens are envelope-encrypted at rest before storage.

---

## 5. Git History Rewrite Commands (Execute ONLY After All Rotations Above Are Complete)

> [!CAUTION]
> **Run only after all 7 credentials have been rotated**, and coordinate with any collaborators (`Aaditya Sah`) beforehand because `git filter-repo` rewrites commit SHAs across all branches.

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
