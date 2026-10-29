# Live Post-Deploy Verification Runbook for PR #80 (`POST_DEPLOY_80.md`)

**Target Commit on `origin/main`**: `cbf38da8934a6aa0d8e6654063bb253729b64e78` (`Merge pull request #80`, head `0d5b0df`)  
**Target Live Origin**: `https://scholar.gkshah.com.np` (Render Service `srv-d9lgbn710e5c73dl8sk0` behind Cloudflare)  
**Scope Rule**: Live HTTP and browser UI checks only — **zero production database queries**. Never paste or log secret values, access tokens, or refresh tokens into chat.

---

## 0. Baseline Health & Persistence Mode Check (Confirm Network Restrictions Compatibility)

Before running the 7 feature checks, confirm the container booted cleanly on the HTTPS Data API (`supabase-rest`) rather than direct TCP Postgres (`postgres`):

```bash
curl -sSi "https://scholar.gkshah.com.np/api/health"
```
- **Expected Result**: `HTTP/2 200` with JSON `"status": "healthy"`, `"persistenceMode": "supabase-rest"`, `"persistenceDurable": true` (`server/routes/health.ts:13,22-30`).
- **Failure Symptom**:
  - `"persistenceMode": "in-memory-EPHEMERAL"` or `"postgres"` → `VITE_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing in Render Dashboard → Environment (`src/services/store/projectStore.ts:136-147`).

---

## 1. Login by Email, Username, and Phone (`POST /api/auth/login` & Sign-In UI)

Code under test: `server/routes/auth.ts:99-270`, `src/services/supabaseAuthService.ts:461-540`.

### 1A. Positive Checks (Email, Username, and E.164 Phone)
- **Browser UI Click Path** *(recommended whenever Cloudflare Turnstile is enabled on Sign In)*:
  1. Open an incognito window at `https://scholar.gkshah.com.np` → **Sign In**.
  2. Sign in using your test account's **Email address** (`user@example.com`) + password → confirm Workspace loads (`200` on `POST /api/auth/login` in DevTools → Network), then **Sign Out**.
  3. Sign in using the same account's **User ID (`username`)** + password → confirm Workspace loads, then **Sign Out**.
  4. Sign in using the same account's **E.164 Mobile Number** (`+<country><number>`, e.g., `+97798...`) + password → confirm Workspace loads.
- **CLI Equivalent** *(works directly when `CLOUDFLARE_TURNSTILE_SECRET_KEY` / `CAPTCHA_SECRET_KEY` is unset; if Turnstile is active, supply a fresh single-use widget token in `captchaToken`)*:
  ```bash
  # Keep tokens in shell memory only; never echo $ACCESS_TOKEN
  ACCESS_TOKEN=$(curl -sS -X POST "https://scholar.gkshah.com.np/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"identifier":"<TEST_USERNAME_OR_EMAIL_OR_E164_PHONE>","password":"<TEST_PASSWORD>"}' \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("HTTP success:", d.get("success"), "hasToken:", bool(d.get("accessToken")), file=sys.stderr); print(d.get("accessToken",""))')
  ```
- **Expected Result**:
  - All 3 identifier types (`email`, `username`, `phone`) return `HTTP 200` with `{"success":true,"accessToken":"...","refreshToken":"...","user":{...}}`.
  - In DevTools → Network, the browser makes **zero** direct calls to `/rest/v1/rpc/email_for_username` or `/rest/v1/rpc/email_for_phone_e164`.

### 1B. Negative Checks (Anti-Enumeration Uniform `401` & Malformed Identifier `400`)
```bash
# Negative 1: Unknown username vs. real username with wrong password (must return identical 401 body)
curl -sS -w "\nHTTP %{http_code} | time=%{time_total}s\n" \
  -X POST "https://scholar.gkshah.com.np/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"nonexistent_probe_user_9941","password":"WrongPassword!123"}'

curl -sS -w "\nHTTP %{http_code} | time=%{time_total}s\n" \
  -X POST "https://scholar.gkshah.com.np/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"<REAL_TEST_USERNAME>","password":"WrongPassword!123"}'

# Negative 2: Invalid identifier format -> HTTP 400
curl -sS -w "\nHTTP %{http_code}\n" \
  -X POST "https://scholar.gkshah.com.np/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"bad identifier!@#","password":"WrongPassword!123"}'
```
- **Expected Result**:
  - Both unknown-user and wrong-password attempts return `HTTP 401` with the exact uniform payload `{"success":false,"error":"Invalid credentials. Please check your User ID, email, or mobile number and try again."}` and never leak the resolved email (`server/routes/auth.ts:7-8,197-202`).
  - Malformed identifier returns `HTTP 400` `{"success":false,"error":"Invalid User ID, email, or mobile number format."}` (`server/routes/auth.ts:118-124`).
- **Failure Symptoms**:
  - `HTTP 503 {"success":false,"error":"Authentication service is not configured."}` → `VITE_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing on Render (`server/routes/auth.ts:134-140`).
  - **Valid credentials + valid Turnstile widget still return `HTTP 401 Invalid credentials...` in UI**: In `#80` (`cbf38da`), `server/routes/auth.ts:126` calls `verifyCaptchaToken()` before forwarding `captchaToken` to GoTrue (`server/routes/auth.ts:182`). If **both** Render (`CLOUDFLARE_TURNSTILE_SECRET_KEY`) and Supabase Auth Attack Protection CAPTCHA are enabled at the same time, Express consumes the single-use Turnstile token and GoTrue rejects the duplicate token with `401`. Follow-up PR `#81` removes the duplicate Express `siteverify` call on `/api/auth/login`.

---

## 2. Rate Limiter Behind Cloudflare (`trust proxy = 1` + Right-Most Hop Cloudflare CIDR Verification)

Code under test: `server.ts:55`, `server/src/middleware/rateLimit.ts:25-89,147-189`, `server/routes/auth.ts:33-37`.

> **Note**: Test against `POST /api/auth/verify-signup` (`max: 20` per `15 min`, `server/routes/auth.ts:33-37`) with `{}` so you verify the shared `rateLimit({ limitBy: "ip" })` engine **without** spending attempts against Supabase GoTrue's `30 / 5 min` sign-in quota or locking your own IP out of `/api/auth/login`.

### 2A. Positive Check (Normal Single Request Allowed)
```bash
curl -sSi -X POST "https://scholar.gkshah.com.np/api/auth/check-availability" \
  -H "Content-Type: application/json" \
  -d '{"username":"scholar_rate_check_probe"}'
```
- **Expected Result**: `HTTP/2 200` with JSON `{"available":true}` (or `false`).

### 2B. Negative Check (Spoofed `User-Agent`, `X-Forwarded-For`, and `CF-Connecting-IP` Blocked on Attempt 21)
```bash
for i in $(seq 1 21); do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "https://scholar.gkshah.com.np/api/auth/verify-signup" \
    -H "User-Agent: RotateAgent/$i" \
    -H "X-Forwarded-For: 198.51.100.$i" \
    -H "CF-Connecting-IP: 203.0.113.$i" \
    -H "Content-Type: application/json" \
    -d '{}')
  echo "Attempt $i -> HTTP $CODE"
done
```
*(Optional Direct-Origin Check: if your Render service's `https://<service>.onrender.com` URL is enabled, run the same 21-iteration loop against `https://<service>.onrender.com/api/auth/verify-signup` from a second network/IP; because the right-most `X-Forwarded-For` peer is not a Cloudflare IP, `rateLimit.ts:78-89` ignores the spoofed `CF-Connecting-IP` header and still returns `429` on Attempt 21.)*
- **Expected Result**:
  - Attempts `1..20` → `HTTP 400` (`{"success":false,"error":"CAPTCHA token is required"}`).
  - Attempt `21` → `HTTP 429` (`{"error":"Too many requests, please try again later."}`) with `Retry-After` response header.
- **Failure Symptoms**:
  - Attempt `21` still returns `HTTP 400` → spoofed headers or `User-Agent` rotation bypassed bucket keying (`F-09`).
  - Every user on different networks immediately gets `HTTP 429` after 20 total site-wide requests → Cloudflare peer IP check failed and collapsed all users onto one proxy IP.

---

## 3. AI Route Authentication (`requireAuth` & JWT `role`/`aud` Verification)

Code under test: `server/routes/ai.ts`, `server/src/middleware/auth.ts:135-142,264-305`.

### 3A. Negative Checks (Anonymous Request & Public `anon` Key Presented as User Bearer Token)
```bash
# Negative 1: Unauthenticated requests to all 3 previously open AI routes
for path in /api/ai/search /api/ai/deep-research /api/ai/agent; do
  echo "=== Anonymous POST $path ==="
  curl -sS -w "\nHTTP %{http_code}\n" -X POST "https://scholar.gkshah.com.np${path}" \
    -H "Content-Type: application/json" \
    -d '{"query":"crispr gene editing"}'
done

# Negative 2: Public Supabase anon JWT presented as Authorization: Bearer (role="anon" != "authenticated")
ANON_KEY="<YOUR_PUBLIC_VITE_SUPABASE_ANON_KEY>"
curl -sS -w "\nHTTP %{http_code}\n" -X POST "https://scholar.gkshah.com.np/api/ai/search" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query":"crispr gene editing"}'
```
- **Expected Result**:
  - All 3 anonymous calls return `HTTP 401` `{"error":"Missing or invalid authorization header"}` (`server/src/middleware/auth.ts:267`).
  - Presenting `VITE_SUPABASE_ANON_KEY` as a Bearer token returns `HTTP 401` `{"error":"Invalid or expired token"}` (`server/src/middleware/auth.ts:136-141,303`).

### 3B. Positive Check (Authenticated User Access Token Passes `requireAuth`)
```bash
curl -sS -w "\nHTTP %{http_code}\n" -X POST "https://scholar.gkshah.com.np/api/ai/search" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query":"crispr gene editing"}'
```
- **Expected Result**: Passes `requireAuth` — returns `HTTP 200` (if the user has active AI entitlement or BYOK headers) or an application-level `400`/`402`/`403` AI configuration/entitlement response, **never** `401` and **never** `500 {"error":"Auth service not configured"}`.
- **Failure Symptoms**:
  - Anonymous call returns `200` → `F-08` regression.
  - Authenticated call returns `500 {"error":"Auth service not configured"}` → `VITE_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_JWT_SECRET`) missing on Render (`server/src/middleware/auth.ts:293-296`).
  - Authenticated Premium AI call returns `500` mentioning `MASTER_KEY` or `Decryption failed` → `MASTER_KEY` on Render is missing or was set to a new value instead of the existing key (`src/services/crypto/crypto.ts:79,107`).

---

## 4. Hard `10 MB` Upload Clamp (`uploadGuard.ts`)

Code under test: `server/src/middleware/uploadGuard.ts:4-5,31-44,125-133`, `server/routes/vault.ts:64-66`.

### 4A. Positive Check (`< 10 MB` Valid Upload With Auth Succeeds)
```bash
printf "Scholar Core post-deploy upload verification sample.\n" > /tmp/scholar_ok.txt
curl -sS -w "\nHTTP %{http_code}\n" -X POST "https://scholar.gkshah.com.np/api/vault/parse-file" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -F "file=@/tmp/scholar_ok.txt;type=text/plain"
rm -f /tmp/scholar_ok.txt
```
- **Expected Result**: `HTTP 200` JSON containing extracted `"text"` (`"Scholar Core post-deploy upload verification sample."`).

### 4B. Negative Checks (`11 MB` Oversized File Rejected With `413`; Anonymous Upload Rejected With `401`)
```bash
dd if=/dev/zero of=/tmp/scholar_11mb.pdf bs=1048576 count=11 status=none

# Negative 1: Anonymous upload rejected BEFORE buffering
curl -sS -w "\nHTTP %{http_code}\n" -X POST "https://scholar.gkshah.com.np/api/vault/parse-file" \
  -F "file=@/tmp/scholar_11mb.pdf;type=application/pdf"

# Negative 2: Authenticated 11 MB upload rejected by 10 MB hard ceiling
curl -sS -w "\nHTTP %{http_code}\n" -X POST "https://scholar.gkshah.com.np/api/vault/parse-file" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -F "file=@/tmp/scholar_11mb.pdf;type=application/pdf"

rm -f /tmp/scholar_11mb.pdf
```
- **Expected Result**:
  - Anonymous upload → `HTTP 401` `{"error":"Missing or invalid authorization header"}`.
  - Authenticated `11 MB` upload → `HTTP 413` `{"error":"File exceeds the 10 MB upload limit. Split the document or compress images and try again."}` (even if `MAX_UPLOAD_MB` in Render env is set `> 10`, because `HARD_MAX_UPLOAD_MB_CEILING = 10` clamps `Math.min(raw, 10)` at `server/src/middleware/uploadGuard.ts:34`).
- **Failure Symptom**:
  - `11 MB` upload returns `400`/`422`/`500` PDF parse error or crashes container (`502 Bad Gateway`) instead of `413` → `uploadGuard.ts` ceiling is not active.

---

## 5. `/api/supabase` Reverse Proxy Allowlist (`server/routes/supabaseProxy.ts`)

Code under test: `server/routes/supabaseProxy.ts:9-15,48-56,63-93`.

### 5A. Positive Check (Allowlisted Prefix `/auth/v1/settings` Proxies Cleanly Over Verified TLS)
```bash
curl -sS -w "\nHTTP %{http_code}\n" \
  "https://scholar.gkshah.com.np/api/supabase/auth/v1/settings" \
  -H "apikey: ${ANON_KEY}"
```
- **Expected Result**: `HTTP 200` JSON from Supabase GoTrue (`external`, `disable_signup`, etc.).

### 5B. Negative Checks (Non-Allowlisted Subpaths & Path Traversal Blocked With `403`)
```bash
curl -sS -w "\nHTTP %{http_code}\n" "https://scholar.gkshah.com.np/api/supabase/"
curl -sS -w "\nHTTP %{http_code}\n" "https://scholar.gkshah.com.np/api/supabase/admin/users"
curl -sS --path-as-is -w "\nHTTP %{http_code}\n" "https://scholar.gkshah.com.np/api/supabase/rest/v1/../../admin"
```
- **Expected Result**: All 3 return `HTTP 403` `{"error":"Forbidden","message":"Proxy path is not on the Supabase API allowlist (/auth/v1, /rest/v1, /storage/v1, /functions/v1)."}` (`server/routes/supabaseProxy.ts:87-92`).
- **Failure Symptoms**:
  - `HTTP 503 {"error":"Service Unavailable","message":"Supabase upstream URL is not configured (set VITE_SUPABASE_URL or SUPABASE_URL)."}` → `VITE_SUPABASE_URL` / `SUPABASE_URL` missing on Render (`server/routes/supabaseProxy.ts:65-70`).
  - `HTTP 404` from upstream Supabase instead of local `403 Forbidden` JSON → subpath allowlist (`F-10`) is not active.

---

## 6. Profile-Update `410` Notice (`TICKET-SEC-01`, `F-04`)

Code under test: `src/desk/account/AccountSettingsScreen.tsx:359-363`, `src/services/supabaseAuthService.ts:929-962`, `supabase/functions/request-profile-update/index.ts:16-48`.

### 6A. Positive Check (SPA Read-Only Identity Notice + Direct Full-Name Update Still Works)
- **Browser UI Click Path**:
  1. Sign in at `https://scholar.gkshah.com.np`.
  2. Open **Account Settings** (top-right profile menu) → **Personal Info** tab.
  3. Confirm **Email** and **User ID** are read-only (no edit button triggers `request-profile-update`) and the inline notice renders:
     > *"Note: Email and username change requests requiring administrator verification are temporarily paused during a security upgrade (TICKET-SEC-01). You can update your Full Name, Phone Number, Institution, and Academic Profile directly below."* (`src/desk/account/AccountSettingsScreen.tsx:361`)
  4. Edit **Full name**, click **Save Changes**, and reload → confirm the updated Full Name persists.

### 6B. Negative Check (Direct HTTP Call to `request-profile-update` Edge Function Never Leaks `verificationKey`)
```bash
curl -sS -w "\nHTTP %{http_code}\n" \
  -X POST "https://scholar.gkshah.com.np/api/supabase/functions/v1/request-profile-update" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"username":"probe_user","pendingEmail":"probe_new@example.com"}'
```
- **Expected Result** *(once the Edge Function is deployed to Supabase)*: `HTTP 410` (or `HTTP 503` if `ADMIN_EMAIL` / `RESEND_API_KEY` is unset in Edge Function secrets) with `"code": "PROFILE_UPDATE_DISABLED"` (or `"PROFILE_UPDATE_UNAVAILABLE"`), and **zero `verificationKey` field** anywhere in the JSON response.
- **Failure Symptom**:
  - **CRITICAL DEPLOYMENT BOUNDARY**: Merging `#80` and deploying Render updates Express + the SPA, **not** Supabase Edge Functions (`.github/workflows/deploy.yml` does not run `supabase functions deploy`). If this `curl` returns `HTTP 200` (or `500` from the old handler), the old Edge Function is still live on Supabase and must be updated via `npx supabase functions deploy request-profile-update --project-ref gfjhsijrwodjvkisouzw` (`HOTFIX2_DEPLOY.md` Step 2).

---

## 7. Cloud Token Encryption (`server/routes/vault.ts` & `src/services/vault/cloudDriveService.ts`)

Code under test: `server/routes/vault.ts:23-61,836-989`, `src/services/vault/cloudDriveService.ts:51-72,126-136,318-335`.

### 7A. Positive Check (Browser Never Reads or Writes Plaintext OAuth Tokens Over PostgREST)
- **Browser UI Click Path**:
  1. Sign in at `https://scholar.gkshah.com.np` and open DevTools → **Network** tab (filter: `user_cloud_integrations`).
  2. Open **Knowledge Vault** → **Add Source** → **Cloud Drive** tab.
  3. Inspect the request URL and response JSON for `/api/supabase/rest/v1/user_cloud_integrations`:
     - **Expected Result**: Query string is strictly `?select=id,provider,account_email,account_name,connected_at&user_id=eq.<uid>` (`src/services/vault/cloudDriveService.ts:69-71`) — `access_token` and `refresh_token` are **never** selected or returned to the browser. If an `upsert` occurs, its payload sets `"access_token":null,"refresh_token":null` (`src/services/vault/cloudDriveService.ts:59-60,132-133`).

### 7B. Negative Checks (Unauthenticated `401`, Disconnected `404`, and Bogus Provider Token `403` Without Token Echo)
```bash
# Negative 1: Unauthenticated Drive & OneDrive file listing -> HTTP 401
curl -sS -w "\nHTTP %{http_code}\n" "https://scholar.gkshah.com.np/api/vault/drive/files"
curl -sS -w "\nHTTP %{http_code}\n" "https://scholar.gkshah.com.np/api/vault/onedrive/files"

# Negative 2: Authenticated user with invalid x-provider-token exercises encryptCloudToken() path -> HTTP 403 needsReauth
curl -sS -w "\nHTTP %{http_code}\n" "https://scholar.gkshah.com.np/api/vault/drive/files" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-provider-token: invalid_probe_oauth_token"
```
- **Expected Result**:
  - Unauthenticated calls return `HTTP 401` `{"error":"Missing or invalid authorization header"}`.
  - Invalid `x-provider-token` call exercises `encryptCloudToken()` (`server/routes/vault.ts:858`) without throwing `500`, rejects upstream at Google Drive API, and returns `HTTP 403` `{"needsReauth":true,"error":"Google Drive file permission not granted. Please re-authenticate with Drive permissions.",...}` (`server/routes/vault.ts:881-888`) without echoing `invalid_probe_oauth_token`.
- **Failure Symptoms**:
  - `HTTP 500` on `/api/vault/drive/files` → `encryptCloudToken` / `SupabaseTable` runtime failure.
  - Browser Network tab shows `select=*` returning raw `access_token` / `refresh_token` values → old SPA bundle cached (hard-refresh or purge Cloudflare cache).

