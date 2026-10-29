# API Reference & Endpoints

This document specifies all currently active server endpoints, authentication protocols, request payloads, response contracts, and error structures in **Scholar Core**.

---

## 1. Global Conventions

- **Base URL**: `/api`
- **Content Type**: `application/json` (except multipart file uploads and SSE streams).
- **Authentication**: Bearer token via `Authorization: Bearer <jwt>` or active Supabase session cookie.
- **Error Format**: All endpoints return standard JSON error structures:
  ```json
  {
    "ok": false,
    "error": "Descriptive error message",
    "code": "ERROR_CODE_STRING",
    "details": {}
  }
  ```

---

## 2. Health & Monitoring Endpoints

### 2.1 Liveness Probe
- **Method**: `GET`
- **Path**: `/health` (also `/healthz` and `/api/health`)
- **Authentication**: None (Public)
- **Response**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-09-29T12:00:00.000Z",
    "uptime": 1245.5,
    "service": "scholar-core"
  }
  ```

---

## 3. Authentication & Verification Endpoints

### 3.1 Multi-Identifier Login
- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Purpose**: Authenticates a user using email, username, or E.164 phone number via backend service-role resolution and upstream Supabase GoTrue password grant.
- **Authentication**: None (Public, protected by Cloudflare Turnstile & Express client-IP rate limiter).
- **Rate Limit**: 5 attempts per 5 minutes per verified client IP (`AUTH_LOGIN_MAX_PER_WINDOW = 5`). Upstream GoTrue HTTP 429 returns uniform `UPSTREAM_AUTH_RATE_LIMIT`.
- **Request**:
  ```json
  {
    "identifier": "scholar_alice",
    "password": "SecurePassword123!",
    "captchaToken": "0.XXXXX..."
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "session": {
      "access_token": "eyJhbGciOi...",
      "refresh_token": "...",
      "user": {
        "id": "uuid",
        "email": "alice@oxford.ac.uk"
      }
    }
  }
  ```
- **Errors**: `400 Bad Request` (missing identifier/password), `401 Unauthorized` (invalid credentials), `429 Too Many Requests` (`UPSTREAM_AUTH_RATE_LIMIT`).

### 3.2 Identifier Availability Check
- **Method**: `POST`
- **Path**: `/api/auth/check-availability`
- **Purpose**: Verifies whether an email, username, or phone number is available for registration without exposing raw account enumerations to the client.
- **Authentication**: None (Public, IP-rate limited).
- **Request**:
  ```json
  {
    "type": "username",
    "value": "alice_scholar"
  }
  ```
- **Response**:
  ```json
  {
    "available": true
  }
  ```

### 3.3 CAPTCHA Signup Verification
- **Method**: `POST`
- **Path**: `/api/auth/verify-signup`
- **Purpose**: Verifies Cloudflare Turnstile token prior to user creation to prevent bot spam.
- **Authentication**: None (Public)
- **Request**:
  ```json
  {
    "captchaToken": "0.XXXXX...",
    "email": "scholar@oxford.ac.uk"
  }
  ```
- **Response**:
  ```json
  {
    "ok": true,
    "verified": true
  }
  ```
- **Errors**: `400 Bad Request` if token is missing or failed Cloudflare verification.

### 3.4 Request Profile Update (Deprecated Edge Function)
- **Method**: `POST`
- **Path**: `https://<project-ref>.supabase.co/functions/v1/request-profile-update`
- **Status**: **HTTP 410 Gone (`F-04` Closed)**
- **Response**:
  ```json
  {
    "success": false,
    "code": "PROFILE_UPDATE_DISABLED",
    "error": "Email and username change requests requiring administrator verification are temporarily unavailable during a security upgrade (TICKET-SEC-01)..."
  }
  ```

---

## 4. Projects Core Endpoints (`server/routes/project.ts`)

### 4.1 List Projects
- **Method**: `GET`
- **Path**: `/api/projects`
- **Authentication**: Required
- **Response**:
  ```json
  {
    "projects": [
      {
        "id": "uuid",
        "title": "Quantum Computing Ethics",
        "outputTypeId": "OT-01",
        "state": {},
        "createdAt": "2026-09-28T10:00:00.000Z",
        "updatedAt": "2026-09-29T08:00:00.000Z"
      }
    ]
  }
  ```

### 4.2 Create Project
- **Method**: `POST`
- **Path**: `/api/projects`
- **Authentication**: Required
- **Request**:
  ```json
  {
    "title": "Analysis of Microgrid Decentralization",
    "outputTypeId": "OT-01",
    "initialWordTarget": 2500,
    "citationStyle": "apa7"
  }
  ```
- **Response**:
  ```json
  {
    "project": {
      "id": "new-project-uuid",
      "title": "Analysis of Microgrid Decentralization",
      "outputTypeId": "OT-01",
      "state": {}
    }
  }
  ```

### 4.3 Get Project by ID
- **Method**: `GET`
- **Path**: `/api/projects/:id`
- **Authentication**: Required
- **Response**: Returns full project metadata, authors list, and state.
- **Errors**: `404 Not Found` if project does not exist or user lacks access.

### 4.4 Update Project Metadata
- **Method**: `PATCH`
- **Path**: `/api/projects/:id`
- **Authentication**: Required
- **Request**:
  ```json
  {
    "title": "Updated Title",
    "authors": []
  }
  ```

### 4.5 Delete Project
- **Method**: `DELETE`
- **Path**: `/api/projects/:id`
- **Authentication**: Required
- **Response**:
  ```json
  {
    "ok": true,
    "deleted": "uuid"
  }
  ```

---

## 5. Coursework & Essay Workflow Endpoints (`server/routes/project/assignment.ts`)

### 5.1 Get Assignment State
- **Method**: `GET`
- **Path**: `/api/projects/:id/assignment`
- **Purpose**: Fetches the complete 4-phase canonical state (`brief`, `sources`, `drafting`, `submission`).
- **Response**: Returns `AssignmentProjectState`.

### 5.2 Persist Assignment State
- **Method**: `PUT`
- **Path**: `/api/projects/:id/assignment`
- **Purpose**: Saves and synchronizes 4-phase state changes to `public.assignment_projects`.
- **Request**: Full `AssignmentProjectState` JSON object.
- **Response**: `{ "ok": true, "updatedAt": "timestamp" }`.

### 5.3 Generate Dynamic Analytical Outline
- **Method**: `POST`
- **Path**: `/api/projects/:id/assignment/generate-outline`
- **Purpose**: Generates dynamic substantive outline with section word budgets based on the prompt.
- **Request**:
  ```json
  {
    "prompt": "Critically analyze the role of deterrence in modern cybersecurity...",
    "academicLevel": "undergraduate",
    "assignmentType": "analytical_essay",
    "targetWordCount": 2000,
    "citationStyle": "apa7"
  }
  ```
- **Response**: Returns `AssignmentStructure` schema containing `mainHeadings` and `subheadings`.

### 5.4 Scholarly Literature Discovery
- **Method**: `POST`
- **Path**: `/api/projects/:id/assignment/scholarly-discovery`
- **Purpose**: Runs question deconstruction and multi-angle literature search against OpenAlex/Crossref.
- **Request**:
  ```json
  {
    "prompt": "Critically analyze...",
    "academicLevel": "undergraduate",
    "discipline": "International Relations"
  }
  ```
- **Response**: Array of `CuratedSource` objects tagged with roles and relevance justifications.

### 5.5 Lecture Document Ingestion
- **Method**: `POST`
- **Path**: `/api/projects/:id/assignment/lecture-upload`
- **Payload**: `multipart/form-data` with `file` field (`.pdf`, `.pptx`, `.docx`).
- **Response**:
  ```json
  {
    "ok": true,
    "fileId": "uuid",
    "title": "Lecture 4 Slides.pdf",
    "extractedChunks": 14
  }
  ```

### 5.6 Draft Section
- **Method**: `POST`
- **Path**: `/api/projects/:id/assignment/draft-section`
- **Purpose**: Generates initial academic draft for a specific subheading.
- **Request**:
  ```json
  {
    "subheadingId": "sub-1",
    "subheadingTitle": "Deterrence by Denial in Network Architecture",
    "targetWordCount": 450,
    "writingStyle": "analytical",
    "customVoiceSample": "",
    "authorNotes": "Emphasize zero-trust principles",
    "approvedSources": []
  }
  ```
- **Response**: `{ "ok": true, "content": "Drafted text...", "wordCount": 442 }`.

### 5.7 Rubric Compliance Evaluation
- **Method**: `POST`
- **Path**: `/api/projects/:id/assignment/evaluate-rubric`
- **Request**: `{ "draftContent": "Full draft...", "rubricCriteria": [] }`.
- **Response**: 10-point evaluation breakdown with numerical scores and qualitative feedback.

### 5.8 Citation Audit Reconciliation
- **Method**: `POST`
- **Path**: `/api/projects/:id/assignment/citation-audit`
- **Request**: `{ "draftContent": "Full draft...", "bibliography": [] }`.
- **Response**: `{ "inTextCitations": [], "reconciled": true, "discrepancies": [] }`.

### 5.9 Stage Copilot Chat
- **Method**: `POST`
- **Path**: `/api/projects/:id/assignment/copilot-chat`
- **Request**:
  ```json
  {
    "phase": "phase_1",
    "persona": "advisor",
    "messages": [{ "role": "user", "content": "How should I structure the counter-argument?" }],
    "context": { "prompt": "...", "wordCount": 2000 }
  }
  ```
- **Response**: `{ "reply": "...", "suggestedActions": [] }`.

### 5.10 Export Formatted Documents
- **Method**: `POST`
- **Path**: `/api/projects/:id/assignment/export-docx` and `/export-pdf`
- **Response**: Streams binary file attachment (`application/vnd.openxmlformats-officedocument.wordprocessingml.document` or `application/pdf`).

---

## 6. AI Gateway Endpoints (`server/routes/ai.ts`)

### 6.1 List Models
- **Method**: `GET`
- **Path**: `/api/ai/models`
- **Response**: Returns catalog of cloud models, local runner models, and latency metrics.

### 6.2 Verify API Key
- **Method**: `POST`
- **Path**: `/api/ai/verify-key`
- **Request**: `{ "provider": "anthropic", "apiKey": "sk-ant-..." }`.
- **Response**: `{ "valid": true, "latencyMs": 142 }`.

### 6.3 Standard Generation & Chat
- **Method**: `POST`
- **Path**: `/api/ai/generate` and `/api/ai/chat`
- **Request**: Standard generation options (prompt, model, max_tokens, temperature).
- **Response**: `{ "text": "...", "model": "...", "provider": "..." }`.

### 6.4 Streaming Inference
- **Method**: `POST`
- **Path**: `/api/ai/stream`
- **Response**: Server-Sent Events (`text/event-stream`) streaming partial tokens:
  ```text
  data: {"delta": "According "}
  data: {"delta": "to recent empirical "}
  data: [DONE]
  ```

---

## 7. Knowledge Vault Endpoints (`server/routes/vault.ts`)

### 7.1 List Vault Items
- **Method**: `GET`
- **Path**: `/api/vault`
- **Authentication**: Required (`requireAuth`)
- **Response**: Array of `UniversalVaultItem` records.

### 7.2 Ingest DOI Metadata
- **Method**: `POST`
- **Path**: `/api/vault/doi`
- **Authentication**: Required (`requireAuth`)
- **Request**: `{ "doi": "10.1038/s41586-024-00000-0" }`
- **Response**: Standardized bibliographic item fetched from Crossref/OpenAlex.

### 7.3 Parse File Upload
- **Method**: `POST`
- **Path**: `/api/vault/parse-file`
- **Authentication**: Required (`requireAuth`)
- **Upload Limit**: Hard-clamped to `10 MB` (`MAX_UPLOAD_MB`).
- **Concurrency Guard**: Maximum 1 heavy parse per server instance. Extra requests return HTTP `503 Service Unavailable` with `Retry-After: 5`.

### 7.4 Cloud Integration Connections
- **Method**: `GET`
- **Path**: `/api/vault/cloud/connections`
- **Authentication**: Required (`requireAuth`)
- **Response**:
  ```json
  {
    "google": { "connected": true, "needsAuth": false, "email": "alice@gmail.com" },
    "onedrive": { "connected": false, "needsAuth": false },
    "zotero": { "connected": false, "needsAuth": false },
    "mendeley": { "connected": false, "needsAuth": false }
  }
  ```

---

## 8. Supabase Proxy Endpoints (`server/routes/supabaseProxy.ts`)

- **Strict Route Allowlist**: Only `/rest/v1/*`, `/auth/v1/*`, `/realtime/v1/*`, and `/storage/v1/*` are proxied. Administrative paths (`/pg/*`, `/meta/*`, `/functions/*`, `/platform/*`) return HTTP `403 Forbidden`.
- **TLS Verification**: Enforces `rejectUnauthorized: true` on all upstream proxy agent connections.
- **WebSocket Realtime Proxy**: `/api/supabase/realtime/v1/*` proxies live WebSocket duplex streams with origin validation.
