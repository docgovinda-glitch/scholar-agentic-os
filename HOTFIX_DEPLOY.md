# HOTFIX_DEPLOY.md — Containment Hotfix Deployment, Verification & Rollback Runbook

> [!IMPORTANT]
> **Scope**: Emergency containment hotfix (**Part A + Part A2**) on branch `hotfix/containment-authz-memory-ssrf`.
> - **Part A (Authz & Service-Role IDOR Containment)**: Enforces `ownerId === req.user.id` across `assignment`, `agentic`, `files`, `activity`, `parse`, and `editor` routes; mounts `requireAuth` on `/api/search`, `/api/discovery`, and `/api/user/saved-authors`.
> - **Part A2 (Unauthenticated OOM DoS, 10 MB Upload Cap, Concurrency Guard, & SSRF Containment)**: Mounts `requireAuth` on all `/api/vault/*` and `/api/lookup-doi` routes; unifies all 6 `multer` instances behind `MAX_UPLOAD_MB=10` (returning HTTP `413`); enforces a server-wide concurrency cap of `1` heavy document parse (`PDF`/`XLSX`/`DOCX`/`PPTX`) with HTTP `503` + `Retry-After: 5`; and applies `safeFetchHtml` (`ssrfGuard`) to `POST /api/projects/:id/parse-file/url`.

---

## 1. How This Hotfix Ships Through the Current Pipeline

No database schema migrations or Edge Function redeployments are required for this hotfix — it is a pure application-layer + `render.yaml` (`MAX_UPLOAD_MB: 10`) change.

### Current Pipeline Flow (`.github/workflows/deploy.yml` + Render Blueprint)
1. **Pull Request CI**:
   - Opening the PR from `hotfix/containment-authz-memory-ssrf` into `main` triggers the `build-and-test` job in [`.github/workflows/deploy.yml`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.github/workflows/deploy.yml#L15-L45) (`npm ci` → `npm run lint` → `npx vitest run` → `npm run build`).
2. **Merge to `main` & Manual Approval Gate**:
   - Once approved and merged into `main`:
     - **Path A (Render Auto-Deploy)**: Because [`render.yaml`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/render.yaml#L27) sets `autoDeploy: true`, Render automatically detects the push to `main` and starts a Docker build using [`Dockerfile`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/Dockerfile).
     - **Path B (GitHub Actions `deploy` Job)**: The `deploy` job in `.github/workflows/deploy.yml` pauses at the GitHub **`Production`** environment protection rule waiting for human reviewer approval. When approved, it triggers `POST https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys` with `{"clearCache": "clear"}` against service `srv-d9lgbn710e5c73dl8sk0`.
3. **Environment Variable Check on Render Dashboard**:
   - If `MAX_UPLOAD_MB` was previously set to `25` in the Render Dashboard Environment tab, verify in **Render Dashboard → `scholar-agentic-os` → Environment** that `MAX_UPLOAD_MB` is updated to `10` (or synced via Blueprint).

---

## 2. Exact Post-Deploy `curl` Verification Checks

Set the target base URL and two test tokens (User A = owner of `$ALICE_PROJECT_ID`, User B = a second non-owner test account):

```bash
export BASE_URL="https://scholar.gkshah.com.np"
# Replace with valid short-lived Bearer JWTs for two test accounts when running IDOR/upload checks:
export ALICE_TOKEN="<valid-jwt-for-alice>"
export BOB_TOKEN="<valid-jwt-for-bob>"
export ALICE_PROJECT_ID="<project-id-owned-by-alice>"
```

### Check 1 — Service Health (`200 OK`)
```bash
curl -sS -i "${BASE_URL}/api/health"
```
- **Expected**: `HTTP/2 200` with `{"status":"healthy",...}`.

### Check 2 — Unauthenticated Vault & Search Endpoints Reject Anonymous Callers (`401 Unauthorized`)
```bash
for path in \
  "/api/vault/parse-file" \
  "/api/vault/parse-url" \
  "/api/vault/lookup-doi" \
  "/api/lookup-doi" \
  "/api/vault/search-semantic" \
  "/api/vault/zotero/sync" \
  "/api/vault/mendeley/sync" \
  "/api/search/live" \
  "/api/search/multi-portal"; do
  printf "%-32s -> " "$path"
  curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}${path}" \
    -H "Content-Type: application/json" -d '{}'
done
```
- **Expected**: Every line prints `401` (previously `400` or `200`).

### Check 3 — Cross-User IDOR Blocked with `404 Not Found`
```bash
for path in \
  "/api/projects/${ALICE_PROJECT_ID}/files" \
  "/api/projects/${ALICE_PROJECT_ID}/activity" \
  "/api/projects/${ALICE_PROJECT_ID}/agentic/manuscript"; do
  printf "GET %-55s -> " "$path"
  curl -sS -o /dev/null -w "%{http_code}\n" "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${BOB_TOKEN}"
done

curl -sS -o /dev/null -w "POST assignment/extract -> %{http_code}\n" \
  -X POST "${BASE_URL}/api/projects/${ALICE_PROJECT_ID}/assignment/extract" \
  -H "Authorization: Bearer ${BOB_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"rawBriefText":"test"}'
```
- **Expected**: Every line prints `404`.

### Check 4 — Oversize Upload (`> 10 MB`) Rejected with `413 Payload Too Large`
```bash
dd if=/dev/zero bs=1048576 count=11 2>/dev/null | \
  curl -sS -i -X POST "${BASE_URL}/api/vault/parse-file" \
    -H "Authorization: Bearer ${ALICE_TOKEN}" \
    -F "file=@-;filename=oversize_11mb.pdf;type=application/pdf"
```
- **Expected**: `HTTP/2 413` with body `{"error":"File exceeds the 10 MB upload limit. Please upload a file smaller than 10 MB.","code":"LIMIT_FILE_SIZE","maxUploadMb":10}`.

### Check 5 — SSRF Guard Blocks Loopback, Private RFC 1918, and Cloud Metadata URLs (`400 Bad Request`)
```bash
for target in \
  "http://127.0.0.1:3000/api/health" \
  "http://169.254.169.254/latest/meta-data/" \
  "http://10.0.0.1/internal"; do
  printf "vault/parse-url (%s) -> " "$target"
  curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/api/vault/parse-url" \
    -H "Authorization: Bearer ${ALICE_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"${target}\"}"

  printf "project/parse-file/url (%s) -> " "$target"
  curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/api/projects/${ALICE_PROJECT_ID}/parse-file/url" \
    -H "Authorization: Bearer ${ALICE_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"${target}\"}"
done
```
- **Expected**: Every line prints `400`.

### Check 6 — Positive Authenticated Controls (`200 OK` for Authorized Owner)
Verify that legitimate authenticated operations for the project owner (`ALICE_TOKEN`) succeed:

```bash
# 6a. Owner can list their own project files (200 OK):
curl -sS -o /dev/null -w "Owner GET /files -> %{http_code}\n" \
  "${BASE_URL}/api/projects/${ALICE_PROJECT_ID}/files" \
  -H "Authorization: Bearer ${ALICE_TOKEN}"

# 6b. Owner can upload and parse a valid <10 MB PDF on /api/vault/parse-file (200 OK):
printf '%%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%%%EOF' | \
  curl -sS -o /dev/null -w "Authenticated valid PDF parse -> %{http_code}\n" \
    -X POST "${BASE_URL}/api/vault/parse-file" \
    -H "Authorization: Bearer ${ALICE_TOKEN}" \
    -F "file=@-;filename=valid_small.pdf;type=application/pdf"

# 6c. Authenticated scholar can run live search (200 OK):
curl -sS -o /dev/null -w "Authenticated GET /api/search/live -> %{http_code}\n" \
  "${BASE_URL}/api/search/live?q=transformer+attention&limit=3" \
  -H "Authorization: Bearer ${ALICE_TOKEN}"
```
- **Expected**: Every line prints `200`.

---

## 3. How to Roll Back on Render

Because this hotfix has **zero database migrations**, rollback is instant and stateless:

### Option A — 1-Click Rollback in Render Dashboard (Fastest: ~30–60s)
1. Open **Render Dashboard** → select service **`scholar-agentic-os`** (`srv-d9lgbn710e5c73dl8sk0`).
2. Click **Events** (or **Deploys**) in the left sidebar.
3. Locate the last known-good deploy (`a9fdbca` — *"Normalize Unicode to NFC and strip control chars in exports"*).
4. Click **Roll back to this deploy** → Confirm. Render immediately switches traffic back to the previously built Docker image without rebuilding from scratch.

### Option B — Rollback via Render REST API
```bash
# List recent deploys to find the previous deploy ID:
curl -sS "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys?limit=5" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" | jq '.[] | {id: .deploy.id, commit: .deploy.commit.id, status: .deploy.status}'

# Trigger rollback to specific deploy ID:
curl -sS -X POST "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/rollback" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"deployId": "<previous-deploy-id>"}'
```

### Option C — Git Revert on `main`
```bash
git checkout main
git pull origin main
git revert -m 1 <merge-commit-sha>
git push origin main
```

---

## 4. Forensic Checklist: Where to Look for Signs of Past Exploitation

Run these **read-only** checks against Render logs and the Production Supabase SQL Editor (`gfjhsijrwodjvkisouzw`) to determine whether any of the fixed vulnerabilities were exploited prior to containment:

### 4.1 Render Service Logs (`srv-d9lgbn710e5c73dl8sk0`)
1. **OOM Kills / Unexpected Container Restarts**:
   - In **Render Dashboard → `scholar-agentic-os` → Events / Metrics**, look for `Server unhealthy` / `Exited with status 137` (`SIGKILL` from Linux OOM killer) or sudden memory spikes to `512 MB` followed by `Server running on port 3000` cold-start log lines.
2. **Unauthenticated `/api/vault/parse-file` or `/api/search/live` Abuse**:
   - Search Render logs for `Error parsing file in /api/vault/parse-file:` or high-frequency requests to `/api/vault/parse-file` and `/api/search/live`.
3. **Tavily Quota Burn (`search-proxy`)**:
   - In **Supabase Dashboard → Edge Functions → `search-proxy` → Logs / Invocations**, check invocation volume against known active user sessions and check your Tavily billing dashboard (`app.tavily.com`) for unexpected credit consumption.

### 4.2 Production Supabase Read-Only Forensic SQL Queries
Run the following `SELECT`-only queries in the Supabase SQL Editor:

```sql
-- 1. Check for projects whose relational child rows were modified after project creation
--    or where manuscript_versions show unexpected rapid overwrites:
SELECT
  mv.project_id,
  p.owner_id,
  mv.section_name,
  mv.created_at
FROM public.manuscript_versions mv
LEFT JOIN public.projects p ON p.project_id = mv.project_id
ORDER BY mv.created_at DESC
LIMIT 50;

-- 2. Check project_files uploads and match against project owners:
SELECT
  pf.id,
  pf.project_id,
  p.owner_id,
  pf.filename,
  pf.size_bytes,
  pf.mime_type,
  pf.uploaded_at
FROM public.project_files pf
LEFT JOIN public.projects p ON p.project_id = pf.project_id
ORDER BY pf.uploaded_at DESC
LIMIT 50;

-- 3. Check for orphaned relational rows (rows written to a project_id that does not exist in projects):
SELECT 'project_sources' AS table_name, COUNT(*) AS orphan_count
FROM public.project_sources ps
LEFT JOIN public.projects p ON p.project_id = ps.project_id
WHERE p.project_id IS NULL
UNION ALL
SELECT 'project_evidence', COUNT(*)
FROM public.project_evidence pe
LEFT JOIN public.projects p ON p.project_id = pe.project_id
WHERE p.project_id IS NULL
UNION ALL
SELECT 'project_claims', COUNT(*)
FROM public.project_claims pc
LEFT JOIN public.projects p ON p.project_id = pc.project_id
WHERE p.project_id IS NULL
UNION ALL
SELECT 'project_files', COUNT(*)
FROM public.project_files pf
LEFT JOIN public.projects p ON p.project_id = pf.project_id
WHERE p.project_id IS NULL;

-- 4. Check admin_audit_log for any suspicious privilege changes or unexpected admin actions:
SELECT id, actor_id, action, target_type, target_id, metadata, created_at
FROM public.admin_audit_log
ORDER BY created_at DESC
LIMIT 50;
```

