# HTTP API

Every endpoint registered by `server.ts` (modules in `server/routes/`). All paths are under one origin. This file lists paths and behaviour; request and response bodies are defined by zod schemas and types next to each handler.

## 1. Conventions

- **Auth**: `Authorization: Bearer <Supabase access token>`. `requireAuth` answers 401 `{ "error": "Missing or invalid authorization header" }` or `{ "error": "Invalid or expired token" }`, 403 for a suspended account, 503 when the token cannot be verified right now, and 500 if auth is not configured. "Public" below means no `requireAuth`.
- **Errors**: JSON `{ "error": string }`. Validation failures through `errorHandler` return 400 `{ "error": "Validation failed", "details": [...] }`; an oversized upload returns 413 with the limit in the message.
- **Project ownership**: every `/api/projects/:id/*` route loads the project for the signed-in owner; another user's project returns 404 (never 403) so existence is not revealed.
- **AI routes** also read transient headers `x-ai-provider`, `x-ai-model`, `x-ai-api-key`, `x-ai-base-url` (and `x-ai-keyring` for `/api/ai/run` and the router bridge). Request bodies must not carry provider credentials (`rejectClientCredentials` on the agentic, assignment, thesis, proposal and presentation routers). When the user's only AI is a local model, some routes answer 426 with prompts for the browser to run (see [`AI-CALL-MAP.md`](AI-CALL-MAP.md)). JSON responses on AI routes may include an `aiRoute` summary.
- **Streaming**: AI streaming endpoints use Server-Sent Events.
- **Limits**: see [`ARCHITECTURE.md`](ARCHITECTURE.md) §3.2. JSON body limit is derived from `MAX_UPLOAD_MB`; multipart uploads are capped at `MAX_UPLOAD_MB` (default and maximum 10).

## 2. Health

| Method | Path | Auth | Notes |
| :--- | :--- | :--- | :--- |
| GET | `/api/health` | Public | `{ status, timestamp, persistenceMode, persistenceDurable, commit }`. `?deep=1` adds `checks.database` (`ok`, `unreachable`, `not-configured`) and returns 503 with `status: "degraded"` when the database is unreachable |

## 3. Auth (`server/routes/auth.ts`)

| Method | Path | Auth | Notes |
| :--- | :--- | :--- | :--- |
| POST | `/api/auth/verify-signup` | Public | Verifies the Turnstile `captchaToken`; 20 per 15 min per IP |
| POST | `/api/auth/login` | Public | Resolves email, username or phone to a sign-in; uniform failure message; 5 per 5 min per IP |
| POST | `/api/auth/check-availability` | Public | Username, email and phone availability; 30 per 15 min per IP |

## 4. Supabase proxy (`server/routes/supabaseProxy.ts`)

`ANY /api/supabase/*` (and a WebSocket upgrade) streams to the Supabase project. Only `/auth/v1`, `/rest/v1`, `/storage/v1`, `/functions/v1` and `/realtime/v1` are forwarded; anything else, or a missing upstream, is refused. 300 requests per minute per IP.

## 5. Projects (`server/routes/project.ts`, all `requireAuth`)

| Method | Path | Purpose |
| :--- | :--- | :--- |
| GET | `/api/atlas/output-types`, `/api/atlas/output-types/:id` | Output-type catalog |
| POST | `/api/projects` | Create `{ outputTypeId }` |
| GET | `/api/projects`, `/api/projects/:id` | List, read |
| PATCH | `/api/projects/:id` | Update project |
| PATCH | `/api/projects/:id/intake` | Merge `{ answers }` into the project's answers (also how coursework state is saved) |
| DELETE | `/api/projects/:id` | Delete |
| PUT | `/api/projects/:id/authors` | Replace authors |
| GET, POST, DELETE | `/api/user/saved-authors[/:authorId]` | Saved author library |
| GET, PUT | `/api/projects/:id/document` | Canonical document (PUT recomputes the rubric) |
| GET | `/api/projects/:id/rubric` | Rubric report; POST `/rubric/waive` waives a rule |
| GET, PUT | `/api/projects/:id/journal-requirements` | Target-journal requirements; POST `/journal-requirements/extract` extracts them with AI |
| POST | `/api/projects/:id/sync` | Apply queued offline `mutations` (such as `approve_source`) plus optional `document` and `answers` |
| POST | `/api/projects/:id/draft` | Save a draft `document` and merge `answers` |
| POST | `/api/projects/:id/sources/approve`, `/sources/reject` | Approve or reject a source |
| DELETE | `/api/projects/:id/sources/:sourceId` | Remove a source |
| GET | `/api/projects/:id/sources/:sourceId/claims` | Claims for a source |
| POST | `/api/projects/:id/gates/G2/accept-smaller-corpus` | Accept a smaller corpus at G2 |
| PUT | `/api/projects/:id/editor/gaps/:gapId`, `/editor/evidence/:evidenceId`, `/editor/claims/:claimId` | Editor-side edits |

### 5.1 Gates, manuscript and export (`server/routes/project/core/manuscriptAndGateRoutes.ts`)

| Method | Path |
| :--- | :--- |
| POST | `/api/projects/:id/gates/:gate/signoff`, `/gates/:gate/invalidate` |
| GET | `/api/projects/:id/manuscript/job` |
| POST | `/api/projects/:id/manuscript/start`, `/next-section`, `/pause`, `/resume`, `/coherence-check`, `/resolve-citations` |
| GET, POST | `/api/projects/:id/manuscript/peer-review` |
| GET, POST | `/api/projects/:id/cover-letter` |
| POST | `/api/projects/:id/anonymization/propose`, `/anonymization/apply`; GET `/anonymization` |
| POST | `/api/projects/:id/export`, `/export/:format`; GET `/export/:format` |

Export formats: `docx`, `odt`, `pdf`, `latex`, `typst`, `camera_ready_pdf`, `markdown` (`md`), `rebuttal_letter` (`rebuttal-letter`). 400 when the project has no document or the format is invalid.

### 5.2 Project sub-routers

| Mount (under `/api/projects/:id`) | Endpoints |
| :--- | :--- |
| `/claims` | POST `/`; POST `/:claimId/evidence`; POST `/:claimId/mark-unsupported`; GET `/`, `/unsupported`, `/conflicts` |
| `/evidence`, `/evidence-ledger` | GET `/`; POST `/sources`, `/discover`, `/sources/:sourceId/extract`, `/items/:evidenceId/verify`, `/propose`, `/approve`, `/reject` |
| `/activity` | GET `/` |
| `/files` | GET `/`; POST `/`; GET `/:fileId/signed-url` |
| `/parse-file` | POST `/` (multipart), `/url`, `/text` |
| `/compliance` | GET `/`, `/journal-compliance-report` |
| `/submissions` | GET, POST `/`; PATCH, DELETE `/:submissionId` |
| `/mesh` | GET `/agents`; POST `/run` |

### 5.3 Journal pipeline (`/api/projects/:id/agentic/*`, also mounted at `/agent/*`)

`server/routes/project/agentic/`, all POST unless noted.

- Evidence: `/gaps`, `/titles`, `/vault-sources`, `/evidence-extraction`, `/external-research`, `/evidence-analysis`, `/journal-discovery`, `/journal-requirements`, `/upload-user-data`; PUT `/user-data/:dataId`; PUT, GET `/evidence`.
- Blueprint: `/blueprint/gaps`, `/blueprint/questions`, `/blueprint/journals`, `/blueprint/outline`.
- Drafting: `/allocate-budget`, `/draft-subsection`, `/draft`, `/draft-preview`, `/copilot-chat`; PUT, GET `/manuscript`.
- Review: `/peer-review`, `/revision`, `/rebuttal-matrix` (also GET), `/citation-audit`, `/originality-check`, `/final-editor`, `/publication-readiness`, `/export`; GET, POST `/export/rebuttal-letter`; PUT `/critiques/:critiqueId/waive`; GET `/critiques`.
- Other: `/journal-profile/extract`, `/references/lookup`, `/references/check`, `/citations/support`.

### 5.4 Coursework (`/api/projects/:id/assignment/*`)

`server/routes/project/assignment/`, all POST unless noted.

- Extract: `/analyze`, `/deconstruct`, `/outline`.
- Understand: `/plan`, `/think`, `/structure` (also GET), `/generate-outline`, `/estimate-rubric`, `/thesis-budget`.
- Sources: `/research`, `/citations-ground`.
- Drafting: `/draft-section`, `/stream-section` (SSE opened before the model call, `: keep-alive` every 5 s, failures as `{ error, recoverable: true }` events; 426 hand-off only before the stream opens; accepts `allocatedWords`), `/review`, `/tutor-chat`, `/peel-matrix`.
- Submission: `/audit-export`, `/copilot-chat`.
- Stage agents: `/agent/extract`, `/agent/understand`, `/agent/sources`, `/agent/review`.

### 5.5 Thesis, proposal, presentation

| Mount | Endpoints |
| :--- | :--- |
| `/thesis` | POST `/viva-simulate`, `/chapter-audit`, `/draft-chapter`; GET `/gate-status` |
| `/proposal` | POST `/study-section-simulate`, `/aims-audit`, `/draft-section` |
| `/presentation` | POST `/generate-deck`, `/qa-simulate`; GET, PUT `/deck` |

## 6. AI

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| POST | `/api/ai/run` | Yes | Unified streaming (SSE) call through the router; see [`AI-SYSTEM.md`](AI-SYSTEM.md) §2.1 |
| GET | `/api/ai/models` | Yes | Curated live model list for the keys in the request, with `recommended` and `options` per connection |
| POST | `/api/ai-access/models` | Yes | Live model list for a catalog provider with the key in the request; a typed address is normalised and fetched only through the guarded client (https, public addresses, pinned, no redirects) |
| POST | `/api/ai/verify` | Yes | Tests a key end to end (live model list + one real request) and recommends a model; key in `x-ai-api-key`; see [`AI-SYSTEM.md`](AI-SYSTEM.md) §2.0 |
| GET | `/api/ai/status` | Public | AI availability |
| POST | `/api/ai/search` | Yes | Web search |
| POST | `/api/ai/deep-research` | Yes | Multi-step research |
| POST | `/api/ai/agent` | Yes | Ask Scholar |
| GET, POST | `/api/ai/threads` | Yes | Ask Scholar threads (held in server memory per user, merged by thread id) |
| POST | `/api/drafting/section` | Yes | Section drafting |
| POST | `/api/studio/voice-profile`, `/refine`, `/consent`, `/restrict` | Yes | Studio voice and refine |
| GET | `/api/studio/egress-audit` | Yes | Egress audit |

### 6.1 AI Access (`/api/ai-access`, all `requireAuth`, user-scoped)

GET `/status`; POST `/connections`; DELETE `/connections/:providerId`; POST `/models`; GET `/keys`, `/keys/sync`; PUT, DELETE `/keys/:providerId`; POST `/route`; GET `/premium-catalog`, `/premium-plans`; GET, POST, DELETE `/premium-request`.

## 7. Search and Vault

| Method | Path | Notes |
| :--- | :--- | :--- |
| GET | `/api/search?q=` | Searches the user's projects and sources |
| POST, GET | `/api/search/live` | Live scholarly search (every `/api/search/*` route is `requireAuth`) |
| POST | `/api/search/multi-portal` | Multi-portal discovery |
| | `/api/discovery/*` | Alias of `/api/search/*` |

`/api/vault/*` (`requireAuth`): POST `/parse-file` (multipart), `/parse-url` (SSRF-guarded), `/lookup-doi`, `/search-semantic`, `/zotero/sync`, `/mendeley/sync`, `/reset`; GET `/drive/files`, `/onedrive/files`; GET, POST `/cloud/connections`; DELETE `/cloud/connections/:provider`. `POST /api/lookup-doi` is an alias of `/api/vault/lookup-doi`.

## 8. Presentations library (`/api/presentations`, all `requireAuth`)

GET `/`, `/:id`; POST `/`; PUT `/:id`; DELETE `/:id`; POST `/parse-document` (multipart); POST `/:id/copilot`.

## 9. Admin (`/api/admin/ai`, `requireAuth` then `requireAdmin`; scopes in [`PRODUCT.md`](PRODUCT.md) §1)

- Read: GET `/whoami`, `/dashboard`, `/providers`, `/resources`, `/plans/:planId/resources`, `/models`, `/premium-plans`, `/premium-requests`, `/premium-subscribers`, `/quota-overrides/:userId`, `/usage`, `/budget`, `/platform-credentials`, `/opportunities`, `/admins`, `/users/search`, `/audit-log`.
- Providers and resources: PATCH `/providers/:id`, `/models/:id`; POST `/resources`; PATCH, DELETE `/resources/:id`; PUT `/plans/:planId/resources`; POST `/premium-plans`.
- Premium: POST `/premium-requests/:id/approve`, `/premium-requests/:id/decline`, `/entitlements/grant`, `/entitlements/revoke`, `/quota-overrides`, `/credits/grant`.
- Budget and credentials: PATCH `/budget`; POST `/platform-credentials`; PATCH `/platform-credentials/:id/status`; DELETE `/platform-credentials/:id`.
- Opportunities: POST `/opportunities/research`, `/opportunities/:id/review`.
- People: POST `/admins`; DELETE `/admins/:userId`; PATCH `/admins/:userId/scopes`, `/users/:userId/status`; DELETE `/users/:userId`.

## 10. Static and SPA

In production `server.ts` serves `dist/`: files under `/assets/` are cached immutably for a year; `index.html`, `sw.js` and `registerSW.js` are never cached. A missing file with a static extension (`.js`, `.css`, `.png`, …) or a missing `/robots.txt`, `/llms.txt`, `/ai-catalog.json`, `/favicon.ico` returns 404 text instead of the SPA; every other GET returns `index.html`. In development Vite middleware serves the app.
