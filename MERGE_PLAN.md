# Production Merge & Deployment Plan (`MERGE_PLAN.md`)

> [!IMPORTANT]
> **Current Live Production & `origin/main` Baseline (`cbf38da`, 2026-10-29)**:
> - **PR #71** (`hotfix/containment-authz-memory-ssrf`) merged to `main` at `5a642a0` (`2026-10-28T10:02:52Z` by `docgovinda-glitch`).
> - **PR #72** (`hotfix/db-storage-rpc-lockdown` — Hotfix 2 v1) merged to `main` at `206deb6` (`2026-10-28T10:03:17Z` by `docgovinda-glitch`).
> - **PR #80** (`fix/credential-encryption-and-honest-byok-ui` — consolidated `#73`–`#79` + reconciliation fixes, head `0d5b0df`) **merged to `main` at `cbf38da` (`cbf38da8934a6aa0d8e6654063bb253729b64e78`) on `2026-10-29T04:58:43Z` by `docgovinda-glitch` and deployed to Render**.
> - **Supabase Network Restrictions**: **ENABLED** (`2026-10-29`), allowing direct Postgres TCP connections (`5432`/`6543`) **only** from the owner's workstation IP (`/32`). Express, Edge Functions, and CI communicate exclusively over HTTPS (`PostgREST` / `GoTrue` / `Storage`).

> [!CAUTION]
> **Critical `MASTER_KEY` & `LLM_CHALLENGE_SECRET` Rules**:
> - **`MASTER_KEY` MUST remain set to the EXISTING production value** currently wrapping `public.platform_provider_credentials` (`server/src/aiEngine/credentialVault.ts:84-94`, `src/services/crypto/crypto.ts:104-115`). Setting a newly generated `MASTER_KEY` before running `scripts/rewrap-platform-credentials.ts` is **credential rotation** (deferred to project end per owner decision `F-01`) and **will make all existing `platform_provider_credentials` rows undecryptable (`DecryptionError`)**, breaking Premium AI requests.
> - **`LLM_CHALLENGE_SECRET` MUST be newly generated** (`openssl rand -hex 32`), because it is a brand-new ephemeral HMAC signing secret for `/api/ai/agent` → `/api/llm` challenge tokens (`server/utils/llm.ts:35-45`) with zero stored database ciphertexts. Set `LLM_CHALLENGE_SECRET` on Render **before** merging follow-up PR `#81` (which enforces fail-closed production refusal to fall back to `SUPABASE_SERVICE_ROLE_KEY`).

---

## 1. Ordered Merge & Deployment Matrix

| Order | PR / Step | Branch → Base | State & Commit SHA | Depends On | Env Vars / Config Needed | Prod Changes |
| :---: | :--- | :--- | :---: | :--- | :--- | :--- |
| **Done** | **PR #71** | `hotfix/containment-authz-memory-ssrf` → `main` | **MERGED (`5a642a0`)** | — | `MAX_UPLOAD_MB=10` (optional) | Express App: `requireAuth` on `/api/vault/*` & `/api/search/live`, project ownership checks (`F-05`, `F-06`), heavy-parse concurrency guard, `ssrfGuard` |
| **Done** | **PR #72** | `hotfix/db-storage-rpc-lockdown` → `main` | **MERGED (`206deb6`)** | PR #71 | None | Express App v1 (`/api/auth/login`, `/api/auth/check-availability`, `/api/projects/:id/files/:fileId/signed-url`) + initial Hotfix 2 SQL in repo *(SQL NOT YET APPLIED)* |
| **Done** | **PR #80** | `fix/credential-encryption-and-honest-byok-ui` → `main` | **MERGED & DEPLOYED (`cbf38da` / `0d5b0df`)** | PR #72 + Section 3 Env Vars | Existing `MASTER_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `MAIN_ADMIN_EMAIL` | `10 MB` hard upload ceiling, `exceljs` + `npm audit` upgrades (`F-12`), `trust proxy = 1` + Cloudflare CIDR IP verification (`F-09`), timeouts & `SIGTERM` shutdown (`F-17`), remove Supabase fallbacks & `/api/supabase` subpath allowlist (`F-07`, `F-10`), `requireAuth` on `/api/ai/*` (`F-08`), `encryptCloudToken` (`F-11`) — **Verify live with `POST_DEPLOY_80.md`** |
| **Step 1** | **Follow-up PR #82** | `fix/post-80-verification-login-purge-notices` → `main` | **OPEN (Ready for Review)** | `origin/main` (`cbf38da`) + `LLM_CHALLENGE_SECRET` set on Render + Supabase Auth sign-in rate limit raised to `300 / 5m` | **NEW**: `LLM_CHALLENGE_SECRET` (`openssl rand -hex 32`) on Render | Single-use Turnstile passthrough on `POST /api/auth/login` (prevents double-spend `401` when both Render & GoTrue CAPTCHA are active), `5 req / 5 min` per-IP login cap + `Sb-Forwarded-For` + uniform upstream `429` handling, fail-closed `LLM_CHALLENGE_SECRET` in production (`F-13`), `/api/vault/cloud/connections` + `CredentialResetNotice` (`F-11`), `journalExportService.ts:106` CI timer guard, `STATUS.md`, `POST_DEPLOY_80.md`, `scripts/verify-local-supabase.sh` |
| **Step 2** | **Edge Function Deploy (`F-04`)** | `supabase/functions/request-profile-update/index.ts` | Ready in `main` (`cbf38da`) | None (SPA already shows `TICKET-SEC-01` notice) | Existing Edge Function secrets (`ADMIN_EMAIL`, `RESEND_API_KEY`) | Run `npx supabase functions deploy request-profile-update --project-ref gfjhsijrwodjvkisouzw` so direct HTTP calls return `HTTP 410 Gone` (`PROFILE_UPDATE_DISABLED`) and never leak `verificationKey` |
| **Step 3** | **DB Migrations (`F-02`, `F-03`, `F-11`, `F-14`)** *(Blocked on Section 3 Local Docker Verification)* | `20261028000000_hotfix2_...sql` + `20261028010000_purge_...sql` | **MARKED `UNVERIFIED`** *(do NOT apply until `./scripts/verify-local-supabase.sh` passes all 4 checks)* | Step 1 (PR #82 deployed) + Local Docker verification + Count-only `SELECT` + Encrypted `pg_dump` | Workstation `/32` IP allowed in Supabase Network Restrictions | **3a.** Run count-only `SELECT` & encrypted `pg_dump` (`HOTFIX2_DEPLOY.md`)<br>**3b.** Apply `20261028000000_hotfix2_db_storage_rpc_lockdown.sql` (`REVOKE`-only RPCs, private buckets, RLS on 3 tables)<br>**3c.** Apply `20261028010000_purge_plaintext_credentials.sql` (populates `security_credential_reset_notices` & purges plaintext `api_credentials` / `user_cloud_integrations`) |
| **Step 4** | **Credential Rotation & History Scrub (`F-01`)** | `ROTATION_RUNBOOK.md` | Scheduled at Project End | Steps 1–3 | Fresh rotated values for all 7 secrets | Migrate to `sb_publishable_...` / `sb_secret_...`, enable Supabase Auth `IP Address Forwarding`, rotate DB password + `MASTER_KEY` (`scripts/rewrap-platform-credentials.ts`) + Resend/Cloudflare/Render/GitHub keys, run `git filter-repo` |

---

## 2. Environment Variables Required by `#80` (`cbf38da`) & Follow-up `#82` (With Exact Failure Symptoms)

| Env Var Name | New or Existing? | Where to Set It | Exact Symptom / Error Message / Log Line If Missing (`origin/main` `cbf38da`) |
| :--- | :---: | :--- | :--- |
| **`VITE_SUPABASE_URL`** | **EXISTING** | **1.** Render Env *(also Docker build `ARG`, `Dockerfile:33-36`)*<br>**2.** GitHub Secrets (`deploy.yml:45`) | 1. **Build/Browser**: `isSupabaseConfigured()` returns `false` and `getSupabaseClient()` throws `"Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example)..."` (`src/services/supabaseClient.ts:64-70`).<br>2. **`/api/supabase/*` Proxy**: HTTP `503` `{"error":"Service Unavailable","message":"Supabase upstream URL is not configured (set VITE_SUPABASE_URL or SUPABASE_URL)."}` (`server/routes/supabaseProxy.ts:65-70`).<br>3. **`POST /api/auth/login`**: HTTP `503` `{"success":false,"error":"Authentication service is not configured."}` (`server/routes/auth.ts:134-140`).<br>4. **`requireAuth` (when `SUPABASE_JWT_SECRET` also unset)**: logs `console.error("auth: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set; refusing all authenticated requests")` and returns HTTP `500` `{"error":"Auth service not configured"}` (`server/src/middleware/auth.ts:293-296`).<br>5. **`getProjectStore()` in production (when `DATABASE_URL` also unset)**: throws `"[FATAL: Durable Persistence Required] Production cannot start with ephemeral in-memory project storage..."` (`src/services/store/projectStore.ts:149-155`). |
| **`VITE_SUPABASE_ANON_KEY`** | **EXISTING** | **1.** Render Env (`Dockerfile:34-37`)<br>**2.** GitHub Secrets (`deploy.yml:46`) | **Browser**: `isSupabaseConfigured()` returns `false` (`src/services/supabaseClient.ts:47-49`) and `getSupabaseClient()` throws `"Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY..."` (`src/services/supabaseClient.ts:64-70`), breaking SPA auth/session hydration. |
| **`SUPABASE_SERVICE_ROLE_KEY`** | **EXISTING** | Render Dashboard → `scholar-agentic-os` → Environment | 1. `getSupabaseRestConfig()` returns `null` (`server/src/supabaseRest.ts:37-41`): `POST /api/auth/login` & `/api/auth/check-availability` return HTTP `503` `{"success":false,"error":"Authentication service is not configured."}` (`server/routes/auth.ts:135-140,295-300`); `POST /api/projects/:id/files` and `GET .../signed-url` return HTTP `500` `{"error":"Supabase not configured"}` (`server/routes/project/files.ts:50-52,116-118`).<br>2. `GET /api/health` drops from `"persistenceMode": "supabase-rest"` to `"postgres"` or `"in-memory-EPHEMERAL"` (`server/routes/health.ts:13-15`), and if `DATABASE_URL` is set on Render, `projectStore.ts:144-146` falls through to direct Postgres (`createPgProjectStore`), which **fails to connect under Supabase Network Restrictions**. |
| **`SUPABASE_JWT_SECRET`** | **EXISTING** | Render Dashboard → `scholar-agentic-os` → Environment | `verifyAccessToken()` (`server/src/middleware/auth.ts:167-173`) skips local HS256 verification and makes a live HTTPS `GET ${supabaseUrl}/auth/v1/user` call on every uncached token (8s timeout; returns HTTP `503` `{"error":"Could not verify your session right now. Please retry."}` on any GoTrue blip, `server/src/middleware/auth.ts:298-301`). |
| **`MASTER_KEY`** | **EXISTING** *(MUST use existing value!)* | Render Dashboard → `scholar-agentic-os` → Environment | 1. **If missing**: `getMasterKeyFromEnv()` throws `MasterKeyNotConfiguredError("MASTER_KEY is not set. Generate one with services/crypto's generateMasterKeyBase64() and set it as a deployment secret — never commit it or paste it in chat.")` (`src/services/crypto/crypto.ts:105-111`), breaking all Premium AI routes (`server/src/aiEngine/credentialVault.ts:90`) and admin provider-key storage (`500`). Meanwhile `encryptCloudToken` (`server/routes/vault.ts:24-37`) falls back to `HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, ...)`.<br>2. **If set to a NEW value before rotation**: `decrypt()` throws `DecryptionError("Decryption failed — wrong key, or the ciphertext was tampered with.")` (`src/services/crypto/crypto.ts:79`) on every `platform_provider_credentials` row. |
| **`LLM_CHALLENGE_SECRET`** | **NEW** *(generate fresh `>=16` chars)* | Render Dashboard → `scholar-agentic-os` → Environment | 1. **In deployed `#80` (`cbf38da`)**: Does **not** error — `resolveLlmChallengeSecret()` (`server/utils/llm.ts:35-48`) silently falls back to `HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY || SUPABASE_JWT_SECRET, "scholar-core:llm-challenge-signing-key:v1")` (or ephemeral random bytes if both are unset).<br>2. **In follow-up PR `#81`**: Throws `Error("LLM_CHALLENGE_SECRET must be set (>= 16 chars) in production; refusing to fall back to SUPABASE_SERVICE_ROLE_KEY (F-13).")` (`server/utils/llm.ts:39-42`), returning HTTP `500` on `POST /api/ai/agent` and `POST /api/llm` (`requireChallenge: true`). **Set on Render before merging PR `#81`.** |
| **`MAIN_ADMIN_EMAIL`** *(or `ADMIN_EMAIL`)* | **EXISTING** | Render Dashboard → `scholar-agentic-os` → Environment | `mainAdminEmail()` returns `null` (`server/src/middleware/requireAdmin.ts:66-69`): unless the user has an explicit row in `public.admin_users`, all `/api/admin/*` routes return HTTP `403` `{"error":"Admin access required"}`. |
| **`CLOUDFLARE_TURNSTILE_SECRET_KEY`** *(or `CAPTCHA_SECRET_KEY`)* | **EXISTING / OPTIONAL** | Render Dashboard → `scholar-agentic-os` → Environment | `verifyCaptchaToken()` skips Turnstile verification (`{ success: true }`, `server/src/middleware/captchaVerify.ts:26-30`) on `POST /api/auth/verify-signup`. |
| **`MAX_UPLOAD_MB`** | **EXISTING / OPTIONAL** | Render Dashboard → `scholar-agentic-os` → Environment | Safe default: `getMaxUploadMb()` returns `10` (`DEFAULT_MAX_UPLOAD_MB = 10`, clamped at `HARD_MAX_UPLOAD_MB_CEILING = 10` in `server/src/middleware/uploadGuard.ts:4-5,31-37`). |

---

## 3. Spend-Cap & Billing Quota Checklist (Derived from Repo Provider Registry)

Because `F-01` rotation is deferred to project end and `platform_provider_credentials` + `RESEND_API_KEY` remain active until rotation, enforce hard monthly spend caps / prepaid-only billing (no auto-recharge) on **every provider configured in `public.platform_provider_credentials`** as well as external paid infrastructure.

Canonical source: **`CLOUD_PROVIDERS` in [`src/config/providerCatalog.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/config/providerCatalog.ts#L159-L815)** (seeded into `public.ai_providers` by [`scripts/seedAiRegistry.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/scripts/seedAiRegistry.ts#L20-L55)) defines **37 cloud AI providers**:

| # | Provider ID (`providerCatalog.ts`) | Display Name | API Base URL | Action Required (If Active in `platform_provider_credentials`) |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `gemini` | Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | Set GCP Billing budget + API quota cap on Generative Language API |
| 2 | `groq` | Groq | `https://api.groq.com/openai/v1` | Set monthly spend limit in Groq Console → Billing → Limits |
| 3 | `cerebras` | Cerebras | `https://api.cerebras.ai/v1` | Set spend limit / disable auto-topup in Cerebras Cloud |
| 4 | `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | Set per-key credit limit & disable auto-topup in OpenRouter → Keys |
| 5 | `mistral` | Mistral AI | `https://api.mistral.ai/v1` | Set monthly usage cap in Mistral La Plateforme → Billing |
| 6 | `zhipu` | Z.ai (GLM) | `https://open.bigmodel.cn/api/paas/v4` | Prepaid balance only; disable auto-recharge |
| 7 | `huggingface` | Hugging Face | `https://router.huggingface.co/v1` | Set Inference Providers monthly spend cap in HF Billing |
| 8 | `cloudflare` | Cloudflare Workers AI | *(account-scoped)* | Set Workers AI usage alert / cap (note: Cloudflare Global API Key leaked in `F-01`) |
| 9 | `together` | Together AI | `https://api.together.xyz/v1` | Set monthly spend limit & disable auto-reload in Together Billing |
| 10 | `fireworks` | Fireworks AI | `https://api.fireworks.ai/inference/v1` | Set monthly spend cap in Fireworks Account → Billing |
| 11 | `deepinfra` | DeepInfra | `https://api.deepinfra.com/v1/openai` | Set spend limit & disable auto-topup in DeepInfra Billing |
| 12 | `novita` | Novita AI | `https://api.novita.ai/v3/openai` | Disable auto-recharge on prepaid balance |
| 13 | `hyperbolic` | Hyperbolic | `https://api.hyperbolic.xyz/v1` | Disable auto-topup on prepaid balance |
| 14 | `nebius` | Nebius AI Studio | `https://api.studio.nebius.com/v1` | Set budget threshold limit in Nebius Billing |
| 15 | `sambanova` | SambaNova | `https://api.sambanova.ai/v1` | Set spend cap / prepaid balance only |
| 16 | `chutes` | Chutes AI | `https://llm.chutes.ai/v1` | Prepaid balance only |
| 17 | `ai21` | AI21 Labs | `https://api.ai21.com/studio/v1` | Set monthly spend cap in AI21 Studio |
| 18 | `moonshot` | Moonshot (Kimi) | `https://api.moonshot.ai/v1` | Prepaid balance only; disable auto-recharge |
| 19 | `xai` | xAI (Grok) | `https://api.x.ai/v1` | Set monthly postpaid spend limit & disable auto-topup in xAI Console → Billing |
| 20 | `deepseek` | DeepSeek | `https://api.deepseek.com` | Prepaid balance only; disable auto-topup in DeepSeek Platform |
| 21 | `qwen` | Qwen (Alibaba) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Set Alibaba Cloud Model Studio / DashScope consumption quota cap |
| 22 | `openai` | OpenAI | `https://api.openai.com/v1` | Set hard monthly budget limit & disable auto-recharge in OpenAI Platform → Limits |
| 23 | `claude` | Anthropic Claude | `https://api.anthropic.com/v1` | Set monthly spend limit & disable auto-reload in Anthropic Console → Plans & Billing |
| 24 | `cohere` | Cohere | `https://api.cohere.ai/v1` | Set billing spend limit in Cohere Dashboard |
| 25 | `perplexity` | Perplexity | `https://api.perplexity.ai` | Disable auto-topup on API credit balance in Perplexity Settings → API |
| 26 | `nvidia` | NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | Credit-capped NGC / NIM pool only |
| 27 | `scaleway` | Scaleway | `https://api.scaleway.ai/v1` | Set Scaleway Billing consumption alert / project quota |
| 28 | `nscale` | Nscale | `https://inference.api.nscale.com/v1` | Prepaid credit cap only |
| 29 | `inferencenet` | Inference.net | `https://api.inference.net/v1` | Prepaid credit cap; disable auto-reload |
| 30 | `arliai` | Arli AI | `https://api.arliai.com/v1` | Prepaid tier cap only |
| 31 | `upstage` | Upstage (Solar) | `https://api.upstage.ai/v1/solar` | Prepaid credit balance only |
| 32 | `stepfun` | StepFun | `https://api.stepfun.com/v1` | Prepaid balance only |
| 33 | `hunyuan` | Tencent Hunyuan | `https://api.hunyuan.cloud.tencent.com/v1` | Set Tencent Cloud billing cap / prepaid package |
| 34 | `baseten` | Baseten | `https://inference.baseten.co/v1` | Set workspace billing cap in Baseten Settings |
| 35 | `vercelgateway` | Vercel AI Gateway | `https://ai-gateway.vercel.sh/v1` | Set Spend Management hard pause limit in Vercel Team → Billing |
| 36 | `minimax` | MiniMax | `https://api.minimaxi.com/v1` | Prepaid balance only |
| 37 | `featherless` | Featherless AI | `https://api.featherless.ai/v1` | Fixed subscription tier (no metered overage) |

**Non-AI Paid / Quota-Bearing Services Referenced in Repo**:
1. **Supabase (`gfjhsijrwodjvkisouzw`)**: Enable **Spend Cap = ON** on Supabase Pro (**Organization / Project Billing → Spend Cap**) so storage/egress cannot bill unbounded overages while `SUPABASE_SERVICE_ROLE_KEY` remains unrotated.
2. **Resend (`RESEND_API_KEY` leaked in `F-01`, `supabase/functions/_shared/resend.ts:13`)**: Keep plan capped (or restrict sending domain / daily quota in Resend Dashboard) so an attacker holding `RESEND_API_KEY` cannot incur email overage charges or burn domain reputation.
3. **Tavily (`TAVILY_API_KEY`, `supabase/functions/search-proxy/index.ts:14`)**: Keep hard monthly credit limit enabled in Tavily Dashboard (`API Keys → Limit`).
4. **Render (`srv-d9lgbn710e5c73dl8sk0`, `render.yaml:6`)**: Locked on `plan: free` (`src/__tests__/render.costGuard.test.ts`).
