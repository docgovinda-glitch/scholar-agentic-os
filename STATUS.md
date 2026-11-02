# Scholar Core (`scholar-agentic-os`) — Production Deployment Status Ledger (`STATUS.md`)

**Single Source of Truth Rule (Standing Rule 0)**:
1. Re-read `STATUS.md` and the relevant source/doc files at the start of every task and before writing any report.
2. Every factual claim in any report must cite `file:line` or paste raw command output. Anything not verified directly from code or command output must be labeled **`unverified`**.
3. Production changes follow the Production Change Protocol (backup/snapshot → apply → verify → record here). No force-pushes; never print secret values.

---

## OWNER ATTENTION (2026-10-29)

1. **Supabase database password reset: deferred by the owner** (2026-10-30) until the project is complete. The old password is in git history (`F-01`) and Network Restrictions are off; the owner accepts that until then.
2. **Auth rate limit raised: DONE** (2026-10-30 02:30Z, owner-approved). `rate_limit_otp` 30 → 300 per 5 min via the Management API. Supabase Auth's own code (`internal/api/apilimiter/apilimiter.go`) counts sign-ups, OTP, magic links and password-reset requests against `rate_limit_otp`, which is the dashboard's "sign-ups and sign-ins" box. Password sign-ins use `rate_limit_token_refresh` (150, unchanged). Emails stay capped separately by `rate_limit_email_sent` (30, unchanged).
3. No compromise indicators found in T5 (see below). No F1 containment beyond the reversible `is_username_approved` revoke.
4. Full encrypted `pg_dump` backups are impossible from the agent sandbox (HTTPS-only egress, no raw TCP to Postgres). Prod changes on 2026-10-29 were preceded by policy/grant/RLS snapshots only (`~/backups/*-20261029T104243Z.json`, agent machine). Supabase Pro daily backups are the restore path.
5. **Deploy smoke secrets (optional): not set.** `deploy.yml` runs the production smoke suite after each deploy only when the `SMOKE_*` GitHub secrets exist. This session has no tool that can write repository secrets, so the step stays skipped. The suite is run by hand after deploys (`scripts/smoke-prod.sh`).

## 0. Task checklist (status as of 2026-10-30 18:30Z, handover)

| Task | Status | Evidence |
| :--- | :--- | :--- |
| T0 Bootstrap | DONE | this file; `~/.scholar-agent.env` (chmod 600, outside repo) |
| T1 Post-#80 verification | DONE | `scripts/smoke-prod.sh` (#85): production 35/35 after #85 |
| T2 Doc corrections | DONE (#82) | |
| T3 Local Supabase proof | DONE | `scripts/db/replay-migrations.sh` rebuilds a fresh DB from the repo (#91, used by CI) |
| T4 Auth rate limits | DONE | server cap 5/5 min (#82); limiter isolation bug fixed (#90); Supabase `rate_limit_otp` 30 → 300 (2026-10-30) |
| T5 Prod read-only checks | DONE (#84) | no compromise indicators; legacy `is_username_approved` revoked |
| T6 Hotfix 2 | DONE | |
| T7 Edge Function | DONE | v11 |
| T8 Purge | DONE (order deviation) | |
| T9 Migration reconciliation | DONE (applied to production 2026-11-02, §1) | `scripts/db/schema-diff.sh` compares production (read-only fingerprint over the Management API) with a fresh replay on plain Postgres (`scripts/db/supabase-stub.sql`). Found 2026-11-02: 5 production-only tables used by no code and empty (`pending_password_resets` with a plain-text `new_password` column, 4 `pocket_*` tables writable by any signed-in user), and ID-document objects that only the replay creates. `20261102000000_reconcile_schema_with_production` drops the tables only while empty and removes the ID-document leftovers. Remaining known differences: `profiles.is_approved` and `is_username_approved()` (legacy, production-only), pgvector in `public` vs `extensions`, Supabase platform objects |
| T10 Production readiness | DONE (agent side) | PR CI + audit gate, deploy waits for live commit + deep health + smoke, uptime workflow, Render health check path (#86); deploy check accepts a newer live commit that contains the run's commit (#99). Owner-only: branch protection, error tracking account, rollback drill (§5) |
| T11 AUDIT findings | PARTIAL | see section 3 |
| B1 Product audit | FIRST PASS + AI map | `PRODUCT_AUDIT.md`; area g mapped in `docs/AI-CALL-MAP.md` (#94) |
| P0 fabricated content / broken flows | DONE (P0-1…P0-21) | #87–#89 (Coursework, Journal); #100, #101 (Thesis/Proposal); #104 (citations never invent year/author/venue, P0-7); #108 (audience Q&A, P0-11); #109 (journal titles); #110–#112 (Journal review, demo manuscripts, sub-section drafter); #113, #114 (slide copilot, theme picker that replaced decks); #115 (landing page, Swiss sample deck, coursework prompt); #121 (Presentation sidebar demo projects and "Aaditya" account); #130 (Coursework drafting wrote template text instead of the user's AI, P0-20); #132 (Journal re-draft failed on a duplicate key, P0-21); #137 (unused template-draft generators removed). Details in `PRODUCT_AUDIT.md` |
| B2 E2E harness | DONE | #91: Playwright, local Supabase in CI, smoke on every PR; 60 tests by #136, including a stand-in AI service for AI steps (#129), axe on signed-in screens (#134) and a keyboard spec (#135) |
| B3 One Brain | IN PROGRESS | map (#94); BYOK headers only on AI routes (#93); one header parser (#95); one Premium pipeline (#98); unused `/agent/literature` removed (#97); typed AI errors for Thesis/Proposal (#100). local model never called from the server (#106); scholarBrain routes hand off to browser-local AI with signed challenges (#116, step 2); Ask Scholar challenge bound to its prompt (#118, P1-10). Not done (see §5): deep-research browser hand-off, output guardrails in `server/utils/llm.ts`, a single `brain.ts` contract |
| B4 AI Access | IN PROGRESS | Premium scope stated truthfully (#96); every catalog provider has a working adapter, tested (#123); credit balance = ledger and limits enforced, checked against a real DB in CI (#125, P1-11 negative grant noted); premium requests act only on a pending request (#126, P1-12); platform keys encrypted with MASTER_KEY, never returned (#127); credit functions refuse zero/negative amounts, applied to production (#136, P1-11). Not done: admin providers/models/budgets CRUD tests; BYOK per real provider needs real keys (UNVERIFIED) |
| B5 Workspaces | IN PROGRESS | real routes + honest errors (#100), practice room/worksheet (#101), starter no longer invents budget (#102); E2E per workspace: open, saved answers survive reload, no demo data, private (#128); each drafting step runs through the real AI path (#129); Coursework drafting uses the user's AI (#130); Journal re-draft keeps the previous version, Markdown/Word export, owner-only (#132). Not done: export E2E for Coursework/Thesis/Proposal; no screen shows saved versions (backlog) |
| B7 UI/UX pass | DONE | every chunk < 500 kB, enforced in the build (#119: 918 → 379 kB); no pure #000000, lint-checked (#120); axe WCAG 2.1 A/AA + no sideways scroll at 375/768/1280 px with screenshots in CI (#121); phone layout fixes (#121, #122); no runtime-built Tailwind classes (checked); colour tokens instead of raw hex in app chrome, lint-checked (#133); axe on signed-in screens and all four workspaces, with fixes (#134); keyboard focus visible everywhere Tab reaches, failed loads show an error with retry (#135) |
| B8 Final verification | DONE | CI E2E 60/60 and unit suites green on #136; production smoke 35/35 on `031ff13` (2026-10-30 18:16Z) and 35/35 again on `afcba5d` after the final deploy (§1); final per-area status in `PRODUCT_AUDIT.md` |
| B6 Presentation | DONE except One Brain (B3); decks persist (#85) | |
| T12 Handover | DONE (#138) | this file §4–§5; `RUNBOOK.md`, `CHANGELOG.md`, `ROTATION_RUNBOOK.md`, `USER_NOTICE.md` (draft, not sent), `PRODUCT_AUDIT.md`, `PRODUCT_BACKLOG.md` |

## 1. Deploy & production change ledger

| When (UTC) | Change | Before | Verification | Rollback |
| :--- | :--- | :--- | :--- | :--- |
| 10:44 | SQL `20261028000000_hotfix2` | policy/grant/RLS snapshot | anon `email_for_username` execute = false; RLS on 3 tables; `/rest/v1/rpc/email_for_username` anon → 404 | re-grant per migration header |
| 10:44 | SQL `20261028010000_purge` (main version) | counts: api_credentials 0, user_cloud_integrations 1 | both 0 after | none (deletion approved, T8) |
| 10:46 | Render env `LLM_CHALLENGE_SECRET` added (new random) | name absent | name present | delete var |
| 10:48 | PR #81 merged `ff330c3` → CI green → Render live `ff330c3` 11:00 | live `cbf38da` | `/api/health` 200; `/presentation` 200; anon `/api/presentations` 401 | redeploy `cbf38da` |
| 11:00 | PR #82 merged `a8771bd`; 11:01 PR #83 merged `efa5187` → Render live `efa5187` 11:15 | live `ff330c3` | health 200; anon `/api/vault/cloud/connections` 401; login without CAPTCHA → 400 | redeploy `ff330c3` |
| 11:10 | SQL `20261029000000_reapply_premium_request_integrity` | already strict | 3 policies, unchanged | n/a |
| 11:10 | SQL `20261029010000_credential_reset_notices` | table absent | RLS on, 2 policies; `user_cloud_integrations` 0 client policies | drop table |

| 11:55 | SQL `20261029020000_revoke_legacy_is_username_approved` (#84) | anon could execute | anon execute false | re-grant (in file header) |
| 12:35 | SQL `20261029030000_presentation_decks` (#85) | table absent; deck saves 503 | smoke 35/35 | drop table while empty |
| 12:40 | Render health check path set to `/api/health` | empty | API read-back | clear field |
| 13:10 → 15:05 | Deploys #86 (`d998166`), #87 (`33bd6e3`), #88 (`fc7085a`), #89+#90 (`823d11d`) | | health `commit` matches; `?deep=1` database ok | redeploy previous |
| 15:14 → 15:50 | Deploys #91 (`5275aff`), #92 (`8193c6c`) | | deploy workflow green | redeploy previous |
| 2026-10-29 16:56 → 2026-10-30 01:10 | Deploys #93–#101 (code only, no SQL, no env changes). Runs for #93–#96 were superseded by newer merges; production went straight to the newest `main` | | `/api/health?deep=1` healthy, database ok, commit `65bc226` (#100) at 01:07; #101 deploying | redeploy previous |
| 2026-10-30 01:20 → 02:20 | Deploys #102, #103, #104 (code/docs only) | | health `commit` `d625217`; smoke 35/35 | redeploy previous |
| 2026-10-30 02:30 | Supabase Auth `rate_limit_otp` 30 → 300 (Management API PATCH `config/auth`, owner-approved) | 30 | read-back 300; other `rate_limit_*` unchanged; smoke 35/35 | PATCH back to 30 |
| 2026-10-30 18:15Z | SQL `20261030170000_credit_amount_must_be_positive` (#136) via Management API; recorded in `schema_migrations` | function defs snapshot `~/backups/credit-functions-20261030T181524Z.json` (agent machine) | `grant_credits(-1)` and `deduct_credits(0)` → 22023, no ledger rows; anon/authenticated execute still false | re-create both functions from the snapshot |
| 2026-10-30 18:47Z | Final check after #137 deployed (live `afcba5d`; #138 is docs only) | — | production smoke 35/35 (`scripts/smoke-prod.sh`); `/api/health` healthy | n/a |
| 2026-10-31 → 2026-11-02 | Deploys #140–#144, the AI router (code only, no SQL, no env changes) | live `4b54a0e` (#139) | `/api/health` commit `30cc719` (#144); production smoke 38/38, including the 3 new AI router checks (the cloud-metadata endpoint is refused) | redeploy previous |
| 2026-11-02 09:14Z | SQL `20261102000000_reconcile_schema_with_production` (#149) via Management API, recorded in `schema_migrations` | 5 empty, unused tables (`pending_password_resets`, 4 `pocket_*`); definitions and row counts (all 0) in `~/backups/dead-tables-20261102T091312Z.txt` (agent machine) | tables gone; `scripts/db/schema-diff.sh` shows only the documented differences (T9); production smoke 38/38 | re-create from the snapshot definitions (tables were empty) |

## T5 results (2026-10-29, read-only, `default_transaction_read_only = on`, counts only)

- Login/superuser/bypassrls roles: 11, all Supabase-managed (`cli_login_postgres` = Supabase CLI login role). Extensions: no `dblink`/`http`/`pg_net`/`pg_cron`. Webhook triggers: 0. Non-repo triggers: 6, all Supabase storage guards.
- Event triggers: 7 = Supabase system + `ensure_rls` (Supabase automatic RLS).
- Non-repo SECURITY DEFINER functions: `rls_auto_enable` (Supabase) and legacy `is_username_approved(text)` — anon-executable username probe, unused by app code → revoked by `20261029020000_revoke_legacy_is_username_approved.sql` (F1 containment, reversible).
- `admin_users` 2 rows, both with matching `grant_admin` / dated audit entries; `admin_audit_log` 9 entries, all recognized actions.
- `auth.users` 7 (super_admin 0, non-authenticated role 0); profiles 7, non-active 0, pending profile updates 0.
- Credit balance vs ledger mismatches 0; unbacked entitlements 0; AI usage anomalies 0.
- RLS disabled on 0 public tables. Buckets: `project-files`, `vault-files`, both private, 0 objects.
- `api_credentials` 0 rows, `user_cloud_integrations` 0 rows.

---

## 2. Pull Request & Branch Ledger (Verified via `gh pr list` & `git log`)

| PR # | Head Branch | Base Branch | State / Merged? | Merge / Head SHA | Merged By (`gh`) | On `origin/main`? | Exact Contents |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **#71** | `hotfix/containment-authz-memory-ssrf` | `main` | **MERGED** (`2026-10-28T10:02:52Z`) | `5a642a0` (`d7d0746`, `9d32796`) | `docgovinda-glitch` | **YES** | Part A + A2 containment: `requireAuth` on `/api/vault/*` & `/api/search/live`, project ownership checks (`F-05`, `F-06`), 10 MB default upload guard, heavy-parse concurrency guard (`max=1`), `ssrfGuard`, initial `SYSTEM_MAP.md`/`SETUP.md`/`AUDIT.md`/`PROD_CHECKS.md`. |
| **#72** | `hotfix/db-storage-rpc-lockdown` | `main` | **MERGED** (`2026-10-28T10:03:17Z`) | `206deb6` (`8e7ee02`, `bc77d97`) | `docgovinda-glitch` | **YES** | Hotfix 2 v1: `POST /api/auth/login` v1, `POST /api/auth/check-availability`, `GET /api/projects/:id/files/:fileId/signed-url`, `20261028000000_hotfix2_db_storage_rpc_lockdown.sql` v1 *(SQL NOT APPLIED to prod)*, `ROTATION_RUNBOOK.md`, `scripts/rewrap-platform-credentials.ts`. |
| **#73** | `chore/ci-and-test-safety-rails` | `hotfix/db-storage-rpc-lockdown` *(stacked)* | Merged into parent branch (`2026-10-28T10:26:33Z`) | `65a2c78` (`e0db4bd`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | Task 4.1: Node 22 CI alignment, `render.yaml` `autoDeploy: false`, Vitest `.env`/network isolation (`src/test/vitestSetup.ts`), `authzMatrix.test.ts`. |
| **#74** | `fix/upload-clamp-and-ssrf-depth` | `chore/ci-and-test-safety-rails` *(stacked)* | Merged into parent branch (`2026-10-28T10:27:12Z`) | `58e3745` (`bd20086`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | Task 4.2: Hard upload clamp in `uploadGuard.ts`, SSRF depth tests, positive controls in `HOTFIX_DEPLOY.md`. |
| **#75** | `fix/ai-routes-auth-and-challenge-secret` | `fix/upload-clamp-and-ssrf-depth` *(stacked)* | Merged into parent branch (`2026-10-28T10:27:43Z`) | `8b76100` (`043bedb`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | Task 4.3: `requireAuth` on `/api/ai/*`, `LLM_CHALLENGE_SECRET` domain separation, JWT `role`/`aud` verification, double-prefixed compliance route fix. |
| **#76** | `fix/dependencies-and-replace-xlsx` | `fix/ai-routes-auth-and-challenge-secret` *(stacked)* | Merged into parent branch (`2026-10-28T10:47:40Z`) | `8ee0f4a` (`447a50e`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | PR 4.4: Replace unpatched `xlsx` with `exceljs`, upgrade `proxy-addr`, `multer`, `@tiptap/*`, `prosemirror-view`, `undici`, `zod`. |
| **#77** | `fix/rate-limit-trust-proxy-and-reliability` | `fix/dependencies-and-replace-xlsx` *(stacked)* | Merged into parent branch (`2026-10-28T10:48:34Z`) | `2266eae` (`cbae123`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | PR 4.5: `trust proxy = 1`, rate limiter hardening, 15s outbound `AbortSignal.timeout`, SSE `req.on("close")` stream abort, graceful `SIGTERM`/`SIGINT` shutdown, `memoryDecks` cap. |
| **#78** | `fix/remove-supabase-fallbacks-and-harden-proxy` | `fix/rate-limit-trust-proxy-and-reliability` *(stacked)* | Merged into parent branch (`2026-10-28T10:48:58Z`) | `152d7a0` (`2807e91`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | PR 4.6: Remove hardcoded Supabase URL/anon fallbacks (`F-07`) and harden `/api/supabase` proxy (`F-10`). |
| **#79** | `fix/credential-encryption-and-honest-byok-ui` | `fix/remove-supabase-fallbacks-and-harden-proxy` *(stacked)* | Merged into parent branch (`2026-10-28T10:56:38Z`) | `aeff13c` (`70368e5`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | PR 4.7: AES-256-GCM cloud OAuth token encryption, stop server `api_credentials` writes, honest BYOK UI copy (`F-11`). |
| **#80** | `fix/credential-encryption-and-honest-byok-ui` | `main` | **MERGED & DEPLOYED** (`2026-10-29T04:58:43Z`) | `cbf38da` (`0d5b0df`) | `docgovinda-glitch` | **YES (LIVE)** | Consolidated `#73`–`#79` rebased on `206deb6` + reconciliation fixes: Cloudflare right-most hop CIDR IP verification (`rateLimit.ts`), `10 MB` hard upload ceiling (`uploadGuard.ts`), constant-path GoTrue timing on `/api/auth/login`, `REVOKE`-only Hotfix 2 SQL v2 *(SQL unapplied)*, `20261028010000_purge` v1 *(SQL unapplied)*, `COMPROMISE_CHECKS.md`, `USER_NOTICE.md`, `MERGE_PLAN.md`. |
| **#81** | `claude/jolly-mayer-k74uad` | `main` | **MERGED & DEPLOYED** (`2026-10-29T10:48Z`) | `ff330c3` (`1f52034`) | `docgovinda-glitch` (agent, owner-authorized) | **YES** | Slides & Keynotes Gamma card studio, native .pptx, deck ownership fail-closed, Slide Visual Parity CI, CI timer fix. |
| **#82** | `fix/post-80-verification-login-purge-notices` | `main` | **MERGED & DEPLOYED** (`2026-10-29T11:00Z`) | `a8771bd` (`1b91e8c`) | `docgovinda-glitch` (agent, owner-authorized) | **YES** | Post-#80 hardening (Turnstile passthrough, login cap, fail-closed `LLM_CHALLENGE_SECRET`, cloud connections API, `CredentialResetNotice`); notice SQL moved to `20261029010000`. |
| **#83** | `claude/jolly-mayer-k74uad` | `main` | **MERGED & DEPLOYED** (`2026-10-29T11:01Z`) | `efa5187` (`92c48c6`) | `docgovinda-glitch` (agent, owner-authorized) | **YES** | `20261029000000_reapply_premium_request_integrity.sql` (fresh-DB policy order fix; no-op in prod). |

Later PRs were opened by the agent and merged by it (owner-authorized) only after CI passed. As of 2026-10-30 09:20Z all are merged and deploy through the normal pipeline (`/api/health` reported `051113e` at 07:26Z, with #114 and #116 deploying).

| PR # | Contents |
| :---: | :--- |
| #84 | Revoke legacy `is_username_approved`; T5 results |
| #85 | `presentation_decks` table; production smoke suite |
| #86 | PR CI, dependency audit, deep health check, deploy verification, uptime monitor |
| #87, #88, #89 | Remove fabricated sources, audits, originality scores, drafts, journals, gaps (Coursework, Journal) |
| #90 | Each rate limiter gets its own counter (login 429s) |
| #91 | Playwright E2E against a local Supabase in CI |
| #92 | STATUS update after #84–#91 |
| #93 | User's AI key sent only to routes that run AI |
| #94 | AI call map (`docs/AI-CALL-MAP.md`) |
| #95 | One parser for client AI headers |
| #96 | AI Access page states which features Premium covers |
| #97 | Remove unused `/agent/literature` (asked an LLM to invent sources) |
| #98 | One Premium pipeline (`server/src/ai/premium.ts`) |
| #99 | Deploy check accepts a newer live commit containing the run's commit |
| #100 | Thesis/Proposal tools use the real routes; no invented reviews or inputs (P0-9) |
| #101 | Viva practice room and blank self-review worksheet; no demo reviews (P0-10) |
| #102 | Proposal starter no longer invents budget, funder or mechanism (P1-9) |
| #103 | STATUS update after #93–#102 |
| #104 | Citations never invent a year, author or venue (P0-7); no state updates after unmount in `useSubscriptionLimits` |
| #105 | STATUS: auth rate limit raised; password reset deferred by owner |
| #106 | Never call a user's local model from the deployed server |
| #107 | `RUNBOOK.md`, agent-credential revocation (`ROTATION_RUNBOOK.md` §7), `CHANGELOG.md` |
| #108 | Audience Q&A never shows invented questions (P0-11) |
| #109 | Journal title stage shows an error, not template titles |
| #110 | Journal: no canned referee critiques, rebuttals or demo manuscript (P0-12) |
| #111 | Journal: no demo manuscripts, assumed journals or pre-passed checks (P0-13) |
| #112 | Journal sub-section drafter never writes template prose (P0-14) |
| #113 | Slide copilot never adds invented points, comparisons or figures (P0-15) |
| #114 | Applying a slide theme keeps the user's slides (P0-16) |
| #115 | Landing page, Swiss theme and coursework prompt: no invented citations or figures (P0-17, P0-18) |
| #116 | Thesis, Proposal and Presentation run on browser-local AI (B3 step 2) |
| #117 | STATUS, audit and changelog after #103–#116 |
| #118 | Ask Scholar binds the browser-AI challenge to its prompt (P1-10) |
| #119 | Read .xlsx without ExcelJS; every chunk under 500 kB, enforced in the build |
| #120 | No pure #000000 anywhere; lint check |
| #121 | Presentation sidebar shows the user's own projects (P0-19); axe + responsive E2E |
| #122 | Presentation header: save badge no longer overlaps the steps on phones |
| #123 | Every AI Access provider has a working adapter (test) |
| #124 | STATUS, audit and changelog after #118–#123 |
| #125 | Credit balance matches the ledger; limits enforced (DB test in CI) |
| #126 | Premium requests: approve/decline/withdraw act only on a pending request (P1-12) |
| #127 | Admin platform keys stored encrypted, never returned, validated |
| #128 | E2E: every workspace opens, keeps saved answers, shows no demo data, stays private |
| #129 | E2E: each workspace's drafting step through the real AI path (stand-in AI in CI) |
| #130 | Coursework drafting: the user's AI or an honest error, never template text (P0-20) |
| #131 | STATUS, audit and changelog after #124–#130 |
| #132 | Journal: re-drafting no longer fails (P0-21); E2E for versions and export |
| #133 | App chrome uses colour tokens instead of raw hex; lint check |
| #134 | Accessibility (axe) on signed-in screens and workspaces, with fixes |
| #135 | Keyboard focus visible on main screens; failed loads show an error with retry |
| #136 | Credit functions refuse zero or negative amounts (P1-11) |
| #137 | Unused Coursework template-draft generators removed; screen-reader announcer timer cleared on unmount |
| #138 | Handover: STATUS, audit, changelog, backlog, runbook |
| #139 | STATUS: final production smoke 35/35 |
| #140 | AI router backend: visible failover, streaming adapters, `/api/ai/run` (SSE), curated `/api/ai/models`; user-named endpoints screened (SSRF) |
| #141 | Every server AI call on the router; local models run on the server only where allowed; e2e stub streams |
| #142 | All AI connections sent (keyring); routing notices; AI Access shows the best models only, with evidence |
| #143 | Ask Scholar: browser-side answers are announced; true timeout message |
| #144 | Workspace AI steps: one live status line with Stop |
| #145 | Docs and production smoke after the AI router |
| #147 | Invented content removed from slide templates, theme previews and Journal Revision |
| #148 | Theme sample KPIs and an unverifiable licence claim removed |
| #149 | T9: production schema compared with the migrations; drift reconciled |

---

## 3. Canonical Finding Table (`F-01`–`F-19`, Exact Match to `AUDIT.md:12-32`)

`AUDIT.md` has **19 canonical findings** (`F-01` through `F-19`) and has **never been renumbered** in git (`git log --oneline origin/main -- AUDIT.md`: `9d32796`, `8e7ee02`, `0d5b0df`).

| Canonical ID (`AUDIT.md`) | Severity | Title (`AUDIT.md:13-31`) | Current Live / Repo Status |
| :---: | :---: | :--- | :--- |
| **`F-01`** | **BLOCKER** | 7 live production secrets committed in git history (`28cfaa5:INFRASTRUCTURE_REFERENCE.md`, `01f851f:scripts/setup-infrastructure.md` on `2026-08-04`) | **Accepted risk — owner decision, rotation at project end (`ROTATION_RUNBOOK.md`)**. Supabase Network Restrictions are set but allow `0.0.0.0/0` (read back 2026-10-30 18:20Z), so they do **not** mitigate the leaked database password |
| **`F-02`** | **BLOCKER** | 3 tables missing `ENABLE ROW LEVEL SECURITY` (`project_research_gaps`, `project_titles`, `project_journal_candidates`) | **Applied** 2026-10-29 10:44Z (`20261028000000_hotfix2`, §1); anon read/write denied in the production smoke suite |
| **`F-03`** | **BLOCKER** | `project-files` Storage bucket policies allow anonymous full read/write/update/delete; `id-documents` public flag | **Applied** 2026-10-29 10:44Z (hotfix2, §1); signed-URL endpoint live (#72/#80); anon bucket listing returns nothing in the production smoke suite; no `id-documents` bucket exists (T5) |
| **`F-04`** | **BLOCKER** | `request-profile-update` Edge Function returns `verificationKey` in HTTP response when email delivery fails (`TICKET-SEC-01`) | **DEPLOYED & ACTIVE on Supabase (`v11`, `2026-10-29`)** — direct HTTP calls return HTTP `410 Gone` (`PROFILE_UPDATE_DISABLED`) and never leak `verificationKey`; SPA displays `TICKET-SEC-01` in-app notice |
| **`F-05`** | **BLOCKER** | Unauthenticated heavy file parsing (`POST /api/vault/parse-file`) + 50 MB upload limits can OOM-kill 512 MB Render container | **LIVE on `main` (`#71` `5a642a0` + `#80` `cbf38da` hard `10 MB` code ceiling)** |
| **`F-06`** | **BLOCKER** | Service-role project routes missing project ownership checks (`assignment/*`, `agentic/*`, `files`, `activity`, `parse-file`, `editor/*`, `critiques/:id/waive`) | **LIVE on `main` (`#71` `5a642a0`)** |
| **`F-07`** | **BLOCKER** | Hardcoded production Supabase URL & anon key fallbacks (`server/routes/supabaseProxy.ts`, `.github/workflows/deploy.yml`) | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-08`** | **HIGH** | `POST /api/ai/search`, `POST /api/ai/deep-research`, and `POST /api/ai/agent` lack `requireAuth`; `llmChallenge` signed with unverified `x-user-id` | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-09`** | **HIGH** | `rateLimit.ts` keys buckets by `${ip}:${User-Agent}` and `server.ts` lacks `app.set("trust proxy", 1)` | **LIVE on `main` (`#80` `cbf38da`: `trust proxy = 1` + right-most hop Cloudflare CIDR check)** |
| **`F-10`** | **HIGH** | `/api/supabase/*` reverse proxy mounted before rate limiter, forwards all subpaths, disables TLS verification (`rejectUnauthorized: false`) on WS | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-11`** | **HIGH** | Plaintext credentials stored in `api_credentials.encrypted_api_key` and `user_cloud_integrations` (`access_token`/`refresh_token`) | Server writes stopped and cloud tokens encrypted (#80); credential-reset notice live (#81); plaintext rows purged 2026-10-29 10:44Z (`20261028010000_purge`, §1). Full protection still depends on the F-01 rotation |
| **`F-12`** | **HIGH** | 52 `npm audit` vulnerabilities including `proxy-addr` (Critical), `xlsx` (High, unpatched), `multer`, `@tiptap/core`, `prosemirror-view` | **LIVE on `main` (`#80` `cbf38da`: `xlsx` replaced with `exceljs`, `0` vulnerabilities)** |
| **`F-13`** | **HIGH** | `LLM_CHALLENGE_SECRET` falls back to `SUPABASE_SERVICE_ROLE_KEY` / static string; `verifyLocalJwt` skips `role`/`aud` verification | JWT `role`/`aud` check + HMAC domain separation **LIVE on `main` (`#80` `cbf38da`)**; strict production refusal to fall back to `SUPABASE_SERVICE_ROLE_KEY` live since **#81** (merged 2026-10-29) |
| **`F-14`** | **HIGH** | 6 `SECURITY DEFINER` RPCs granted to `anon` (`email_for_username`, `email_for_phone_e164`, `email_for_identifier`, `check_*_available`) | Server login & availability endpoints **LIVE on `main` (`#72`/`#80`)** + Turnstile/rate-limit hardening live since **#81** (merged 2026-10-29); `REVOKE`-only SQL **`UNVERIFIED` pending Section 3 Docker checks** |
| **`F-15`** | **MEDIUM** | Admin email configuration split across `MAIN_ADMIN_EMAIL`, `ADMIN_EMAIL`, and hardcoded SQL policies | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-16`** | **MEDIUM** | Double-prefixed route mount bug: `GET /api/projects/:id/compliance/api/projects/:id/journal-compliance-report` | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-17`** | **MEDIUM** | Outbound `fetch()` calls lack `AbortSignal.timeout()`, no `SIGTERM` handler, SSE lacks `req.on("close")` abort (`SYSTEM_MAP.md` `R-08`), `memoryDecks` unbounded | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-18`** | **MEDIUM** | Render Free (512 MB RAM, 15m spin-down) + Supabase Free (no backups, 7d pause) | **Owner decided**: Render stays on Free; Supabase on Pro (daily backups). Network Restrictions allow all addresses (see F-01) |
| **`F-19`** | **MEDIUM** | Vitest loads local `.env` during test runs (`dotenv.config()`) and makes live network requests; Node 20/22 CI drift | **LIVE on `main` (`#80` `cbf38da`)** + `journalExportService.ts:106` async timer CI fix live since **#81** (merged 2026-10-29) |

---

## 4. Handover documents

| Document | Purpose | State at handover |
| :--- | :--- | :--- |
| `STATUS.md` | task checklist, production change ledger with rollbacks, PR ledger, remaining risks | current (this file) |
| `RUNBOOK.md` | deploy, check, roll back, database changes, env vars, auth limits, first checks when something breaks | current |
| `CHANGELOG.md` | user-visible changes by PR | current through #137 |
| `PRODUCT_AUDIT.md` | product findings (P0-1…P0-21, P1-1…P1-13) with fix PRs and the final status per area | current |
| `PRODUCT_BACKLOG.md` | ideas outside the current product intent; nothing built until promoted | current |
| `ROTATION_RUNBOOK.md` | credential rotation (F-01) and revoking the agent's own credentials (§7) | ready; **not executed** (owner decision, §5) |
| `USER_NOTICE.md` | draft security notice to users | **draft, not sent**; send only after the pre-send checklist in that file and the rotation |
| `docs/AI-CALL-MAP.md` | every AI call path and the One Brain plan | current through #118 |
| `e2e/README.md` | how to run the end-to-end suite locally, including the stand-in AI | current |

Earlier deliverables (`SYSTEM_MAP.md`, `SETUP.md`, `AUDIT.md`, `PROD_CHECKS.md`, `COMPROMISE_CHECKS.md`, `HOTFIX*_DEPLOY.md`, `POST_DEPLOY_80.md`, `MERGE_PLAN.md`) are historical records of the 2026-10-28/29 hotfixes; the migrations they describe are applied (§1).

## 5. Remaining risks and owner actions

**Owner actions (the agent cannot or must not do these):**

1. **Rotate the leaked credentials (F-01)** — Supabase database password, service-role key, and the others listed in `ROTATION_RUNBOOK.md` §1, then rewrite git history (§5 there). Deferred by the owner until the project is complete. Until then the old values remain valid and are in git history. Do **not** change `MASTER_KEY` without its re-wrap procedure (it encrypts stored credentials).
2. **Revoke the agent's credentials** (`ROTATION_RUNBOOK.md` §7): the Supabase access token, Render API key and the GitHub access used for this work.
3. **Branch protection on `main`** (require CI and E2E checks) — a GitHub setting the agent has no tool for.
4. **Deploy smoke secrets (optional):** add the `SMOKE_*` repository secrets so `deploy.yml` runs the production smoke suite after each deploy.
5. **Error tracking:** create an account (e.g. Sentry free tier) and add its DSN; listed in `PRODUCT_BACKLOG.md`.
6. **Production schema diff (T9):** done by the agent with `scripts/db/schema-diff.sh` (read-only on production). Re-run it after any schema change made outside migrations.
7. **Send `USER_NOTICE.md`** only after items 1 and the checklist in that file.

**Known gaps (not blocking, recorded):**

- B3: every server AI call now goes through one router (#140–#144, `docs/AI-SYSTEM.md` §0), including deep research, which hands off to the browser (426) when no AI is connected or the user's local model is first. Output guardrails stay per feature (citation lock, scholarly voice) rather than in one place.
- B4: real BYOK calls per provider, local runners and quota exhaustion are tested with mocks and a stand-in AI only (no real provider keys in CI). Admin CRUD for providers/models/budgets has no dedicated tests.
- B5: Journal export is tested end to end; Coursework export (the .docx a student submits) has a unit test that unzips the file and checks its content. Thesis and Proposal have no export feature (backlog). No screen shows saved versions (backlog).
- P1-13 fixed: a custom local-runner address reaches the router's local adapters (#141; test in `routerBridge.test.ts`).
- Signup e-mail verification, password reset, ID upload, Zotero/Mendeley/Drive sync and the admin UI are not covered by automated tests (they need real inboxes or third-party accounts); see `PRODUCT_AUDIT.md` areas a, d, h.
- The full vitest suite has ~18 tests in 5 files that need real credentials or network (`CLAUDE.md`); CI runs the rest.
- Render free plan: cold starts (up to ~1 minute) and 512 MB RAM.
