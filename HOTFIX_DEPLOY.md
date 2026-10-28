# HOTFIX_DEPLOY.md — Containment Hotfix Deployment, Verification & Rollback Runbook

> [!WARNING]
> **`autoDeploy: true` Warning (Immediate Production Trigger on Merge)**:
> [`render.yaml`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/render.yaml#L27) has `autoDeploy: true`. The moment a PR is merged into `main`, Render **immediately** begins building and deploying the new container to `https://scholar.gkshah.com.np` **without** waiting for the GitHub Actions `Production` environment approval gate in [`.github/workflows/deploy.yml`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.github/workflows/deploy.yml#L47-L66). Approving the GitHub Actions `deploy` job later will trigger a **second** redundant rebuild (`{"clearCache": "clear"}`). Before merging, ensure Render environment variables are ready and monitor the Render Dashboard Events feed immediately upon merge.

> [!IMPORTANT]
> **Scope**: Emergency containment hotfix (**Part A + Part A2**, PR #71 + follow-up PR #74):
> - **Part A (Authz & Service-Role IDOR Containment)**: Enforces `ownerId === req.user.id` across `assignment`, `agentic`, `files`, `activity`, `parse`, `claims`, and `editor` routes; mounts `requireAuth` on `/api/search`, `/api/discovery`, and `/api/user/saved-authors`.
> - **Part A2 (Unauthenticated OOM DoS, Hard 10 MB Upload Ceiling, Concurrency Guard, & SSRF Containment)**: Mounts `requireAuth` on all `/api/vault/*` and `/api/lookup-doi` routes; unifies all 6 `multer` instances behind a hard code-enforced ceiling of `10 MB` (`Math.min(raw, 10)`, returning HTTP `413`); enforces a server-wide concurrency cap of `1` heavy document parse (`PDF`/`XLSX`/`DOCX`/`PPTX`) with HTTP `503` + `Retry-After: 5`; and applies `safeFetchHtml` (`ssrfGuard`) to both `/api/vault/parse-url` and `/api/projects/:id/parse-file/url`.

---

## 1. How This Hotfix Ships Through the Current Pipeline

No database schema migrations or Edge Function redeployments are required for this hotfix — it is a pure application-layer + `render.yaml` (`MAX_UPLOAD_MB: 10`) change.

### Current Pipeline Flow (`.github/workflows/deploy.yml` + Render Blueprint)
1. **Pull Request CI**:
   - Opening the PR into `main` triggers the `build-and-test` job in [`.github/workflows/deploy.yml`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.github/workflows/deploy.yml#L15-L45) (`npm ci` → `npm run lint` → `npx vitest run` → `npm run build`).
2. **Merge to `main` & Dual Trigger Behavior**:
   - **Render Auto-Deploy**: Because [`render.yaml`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/render.yaml#L27) sets `autoDeploy: true`, Render automatically detects the push to `main` and starts a Docker build using [`Dockerfile`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/Dockerfile).
   - **GitHub Actions `deploy` Job**: The `deploy` job in `.github/workflows/deploy.yml` pauses at the GitHub **`Production`** environment protection rule waiting for reviewer approval. Do **not** approve it after Render's auto-deploy has already succeeded unless you intentionally want a cache-cleared second redeploy.
3. **Environment Variable Check on Render Dashboard**:
   - Even if `MAX_UPLOAD_MB` in the Render Dashboard Environment tab is still set to `25`, `resolveMaxUploadMb()` in [`server/src/middleware/uploadGuard.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/uploadGuard.ts#L10-L24) clamps `Math.min(raw, 10)` so `10 MB` is strictly enforced in code. Still update `MAX_UPLOAD_MB=10` in **Render Dashboard → `scholar-agentic-os` → Environment** for configuration hygiene.

---

## 2. Exact Post-Deploy `curl` Verification Checks

Set the target base URL and two test tokens (Alice = owner of `$ALICE_PROJECT_ID` and `$ALICE_CLAIM_ID`; Bob = a second non-owner test account):

```bash
export BASE_URL="https://scholar.gkshah.com.np"
export ALICE_TOKEN="<valid-jwt-for-alice>"
export BOB_TOKEN="<valid-jwt-for-bob>"
export ALICE_PROJECT_ID="<project-id-owned-by-alice>"
export ALICE_CLAIM_ID="<claim-id-inside-alice-project>"
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

### Check 3 — Cross-User IDOR Blocked with `404 Not Found` (Including Bob's `PUT` to Alice's Claim Leaving Row Unchanged)
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

# 3b. Snapshot Alice's claim before Bob's unauthorized PUT attempt:
ALICE_CLAIMS_BEFORE="$(curl -sS "${BASE_URL}/api/projects/${ALICE_PROJECT_ID}/claims" \
  -H "Authorization: Bearer ${ALICE_TOKEN}")"

# Bob attempts to overwrite Alice's claim -> must return 404:
curl -sS -o /dev/null -w "Bob PUT Alice claim -> %{http_code}\n" \
  -X PUT "${BASE_URL}/api/projects/${ALICE_PROJECT_ID}/claims/${ALICE_CLAIM_ID}" \
  -H "Authorization: Bearer ${BOB_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"statement":"TAMPERED BY BOB"}'

# Confirm Alice's claims list is byte-for-byte unchanged:
ALICE_CLAIMS_AFTER="$(curl -sS "${BASE_URL}/api/projects/${ALICE_PROJECT_ID}/claims" \
  -H "Authorization: Bearer ${ALICE_TOKEN}")"
diff -u <(printf '%s\n' "$ALICE_CLAIMS_BEFORE") <(printf '%s\n' "$ALICE_CLAIMS_AFTER") && echo "PASS: Alice claim row unchanged"
```
- **Expected**: Every cross-user request prints `404`, and `diff` prints `PASS: Alice claim row unchanged`.

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

### Check 6 — Positive Authenticated Controls (`200 OK` for Authorized Owner & Scoped Search)
Verify that legitimate authenticated operations for the project owner (`ALICE_TOKEN`) succeed and only return Alice's own project data:

```bash
# 6a. Owner can list their own project files (200 OK):
curl -sS -o /dev/null -w "Owner GET /files -> %{http_code}\n" \
  "${BASE_URL}/api/projects/${ALICE_PROJECT_ID}/files" \
  -H "Authorization: Bearer ${ALICE_TOKEN}"

# 6b. Generate a valid, spec-compliant 1-page PDF with real xref table and text stream
#     (pdf-parse requires a valid xref table and page tree; a 62-byte stub fails parsing):
python3 - <<'PY' > /tmp/valid_1page.pdf
content = b"BT /F1 12 Tf 72 720 Td (Scholar Core Containment Verification Test PDF) Tj ET"
objs = [
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    f"4 0 obj\n<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream\nendobj\n",
    b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
]
out = bytearray(b"%PDF-1.4\n")
offsets = [0]
for o in objs:
    offsets.append(len(out))
    out.extend(o)
xref_pos = len(out)
out.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
for off in offsets[1:]:
    out.extend(f"{off:010d} 00000 n \n".encode())
out.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode())
import sys
sys.stdout.buffer.write(out)
PY

curl -sS -o /dev/null -w "Authenticated valid 1-page PDF parse -> %{http_code}\n" \
  -X POST "${BASE_URL}/api/vault/parse-file" \
  -H "Authorization: Bearer ${ALICE_TOKEN}" \
  -F "file=@/tmp/valid_1page.pdf;filename=valid_1page.pdf;type=application/pdf"

# 6c. Authenticated project search returns ONLY Alice's data (never Bob's projects/claims):
curl -sS "${BASE_URL}/api/search?q=research" \
  -H "Authorization: Bearer ${ALICE_TOKEN}" | \
  jq -e --arg bob_id "${BOB_PROJECT_ID:-none}" '
    (.projects // [] | all(.ownerId == null or .projectId != $bob_id))
  ' && echo "PASS: /api/search returned only Alice-scoped results"

# 6d. Authenticated scholar can run live literature search (200 OK):
curl -sS -o /dev/null -w "Authenticated GET /api/search/live -> %{http_code}\n" \
  "${BASE_URL}/api/search/live?q=transformer+attention&limit=3" \
  -H "Authorization: Bearer ${ALICE_TOKEN}"
```
- **Expected**: Every check returns `200` and `6c` confirms zero cross-user data leakage.

---

## 3. How to Roll Back on Render

> [!CAUTION]
> **Security Caveat on Rollback**: Rolling back this containment deploy **immediately re-exposes**:
> 1. Unauthenticated `/api/vault/parse-file` 25 MB upload OOM DoS (allowing a single anonymous request to crash the 512 MB Render instance for all users).
> 2. Cross-user IDOR on `/api/projects/:id/*` routes (where `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS without checking `ownerId === req.user.id`).
> 3. Unauthenticated SSRF on `parse-file/url` and unauthenticated quota burn on `/api/search/live`.
>
> **Do not roll back full containment** if a single non-critical route exhibits an issue; instead hotfix forward. Only roll back if login or core workspace loading is completely broken in production.

### Option A — 1-Click Rollback in Render Dashboard (Fastest: ~30–60s)
1. Open **Render Dashboard** → select service **`scholar-agentic-os`** (`srv-d9lgbn710e5c73dl8sk0`).
2. Click **Events** (or **Deploys**) in the left sidebar.
3. Locate the last deploy prior to the regression.
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

> [!NOTE]
> **What Logs Can and Cannot Prove**:
> - **Cannot be proven from application tables alone**: Read-only IDOR exfiltration (e.g., an attacker calling `GET /api/projects/:id/agentic/manuscript` or `GET /api/projects/:id/files`) does not write rows to `public.*` tables. It can only be detected in **Render HTTP access logs** or **Supabase API gateway (`edge_logs`)** within their retention window (7 days on Supabase Pro; very limited scrollback on Render Free).
> - **Can be proven from database state**: Unauthorized mutations/deletions, orphaned child rows after project deletion, unexpected file uploads into another user's project, and admin privilege changes in `public.admin_audit_log`.

### 4.1 Render Service & Supabase Gateway Logs (`srv-d9lgbn710e5c73dl8sk0` / `gfjhsijrwodjvkisouzw`)
1. **OOM Kills / Unexpected Container Restarts**:
   - In **Render Dashboard → `scholar-agentic-os` → Events / Metrics**, look for `Server unhealthy` / `Exited with status 137` (`SIGKILL` from Linux OOM killer) or sudden memory spikes to `512 MB` followed by `Server running on port 3000` cold-start log lines.
2. **Unauthenticated `/api/vault/parse-file` or `/api/search/live` Abuse**:
   - Search Render HTTP logs for `POST /api/vault/parse-file`, `POST /api/vault/parse-url`, `POST /api/projects/.*/parse-file/url`, or high-frequency requests to `/api/search/live`.
3. **Tavily Quota Burn (`search-proxy`)**:
   - In **Supabase Dashboard → Edge Functions → `search-proxy` → Logs / Invocations**, check invocation volume against known active user sessions and check your Tavily billing dashboard (`app.tavily.com`) for unexpected credit consumption.

### 4.2 Production Supabase Read-Only Forensic SQL Queries
Run the following `SELECT`-only queries in the Supabase SQL Editor (all column names verified against `supabase/migrations/*.sql`):

```sql
-- 1. Check for projects whose manuscript_versions were modified after project creation:
SELECT
  mv.project_id,
  p.owner_id,
  mv.section_name,
  mv.created_at
FROM public.manuscript_versions mv
LEFT JOIN public.projects p ON p.project_id = mv.project_id
ORDER BY mv.created_at DESC
LIMIT 50;

-- 2. Check project_files uploads and match against project owners
--    (actual columns from 20260728000000_relational_project_store.sql:
--     id, project_id, filename, storage_path, size_bytes, mime_type, uploaded_at):
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

-- 3. Check for orphaned relational rows across all child tables:
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

-- 4. Check admin_audit_log for any suspicious privilege changes or unexpected admin actions
--    (actual columns from 20260804000000_ai_access_and_Billing.sql:
--     id, admin_id, action, target_type, target_id, details, created_at):
SELECT id, admin_id, action, target_type, target_id, details, created_at
FROM public.admin_audit_log
ORDER BY created_at DESC
LIMIT 50;
```
