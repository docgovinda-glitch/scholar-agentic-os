# Backend API Architecture Report

## Executive Summary

The backend is a monolithic Express server (`server.ts`, ~27 registered routes, plus `server/routes/ai.ts`, `auth.ts`, and `parser.ts`) serving AI generation, file parsing, external link parsing, DOI lookup, authentication, and registration workflows. The server data layer provides both legacy JSON storage (`server/data/legacyUsersJson.ts`) and a working PostgreSQL layer (`server/data/db.ts`, `database_schema.sql`) — see the endpoint table below for the full inventory as last verified.

---

## 1. Complete API Endpoint Inventory

### 1.1 AI Endpoints

| Endpoint | Method | Purpose | Request Schema | Response Schema | Auth Required |
|----------|--------|---------|---------------|-----------------|---------------|
| `/api/generate` | POST | AI text generation proxy | `{ provider, apiKey, model, systemInstruction, prompt, temperature, responseMimeType, username }` | `{ text: string }` | No |
| `/api/stream-generate` | POST | SSE streaming AI generation | `{ provider, apiKey, model, systemInstruction, prompt, temperature, responseMimeType, username }` | `data: { text: string }` SSE events | No |
| `/api/generate/dissertation-grounding` | POST | Phase B grounding map | `{ title, objectives, researchQuestions, methodology, field, keywords, ... }` | `GroundingMap` JSON | No |
| `/api/generate/data-discovery` | POST | Phase C data sources | `{ title, methodology, field, keywords, aiSettings }` | `{ sources: DiscoveredDataSource[] }` | No |
| `/api/generate/journal-discovery` | POST | Phase D journal matching | `{ title, keywords, field, preferredJournalScope, articleType, aiSettings }` | `{ journals: RecommendJournal[] }` | No |
| `/api/generate/extract-requirements` | POST | Phase E compliance rules | `{ journalName, guidelinesText, aiSettings }` | `ComplianceRules` JSON | No |
| `/api/generate/draft-section` | POST | Phase F drafting | `{ projectState, sectionName, sectionOutline, userStyleSample, includeScriptures, draftInstruction }` | `{ draftText: string }` | No |
| `/api/generate/quality-control` | POST | Phase G QC audit | `{ projectState, currentDraft }` | `QCReport` JSON | No |
| `/api/generate/submission-pack` | POST | Phase H submission package | `{ projectState, authorDetails, revisionsStatus }` | `SubmissionPack` JSON | No |
| `/api/generate/citation-engine` | POST | Citation formatting | `{ sourceInput, desiredStyle, aiSettings }` | Citation metadata JSON | No |

### 1.2 Document Intelligence Endpoints

| Endpoint | Method | Purpose | Request Schema | Response Schema | Auth Required |
|----------|--------|---------|---------------|-----------------|---------------|
| `/api/parse-file` | POST | File parsing (PDF, DOCX, TXT, MD, XLSX, images) | `{ fileName, fileType, fileContent (base64) }` | `{ text: string; metadata: {...} }` | No |
| `/api/parse-external-link` | POST | Web scraping and PDF extraction | `{ url }` | `{ text: string; metadata: {...} }` | No |
| `/api/lookup-doi` | POST | CrossRef DOI metadata lookup | `{ doi }` | `{ text: string; metadata: { title, author, citationTag, bibtex } }` | No |

### 1.3 Authentication Endpoints

| Endpoint | Method | Purpose | Request Schema | Response Schema | Auth Required |
|----------|--------|---------|---------------|-----------------|---------------|
| `/api/check-approval` | GET | Check user approval status | `{ username }` query | `{ is_approved: boolean }` | No |
| `/api/request-password-reset` | POST | Initiate password reset workflow | `{ username, email, newPasswordHash }` | `{ success, emailSent, approveResetUrl }` | No |
| `/api/approve-reset` | GET | Approve password reset | `{ user, email }` query | HTML success page | No |
| `/api/register` | POST | Registration with OTP | `{ username, fullName, email, phone, affiliation, authenticId, otp? }` | `{ success, activationKeyHash, ... }` | No |
| `/api/approve` | GET | Admin approval for scholar | `{ user, email, key }` query | HTML admin page | No |
| `/api/verify-and-sync-profile` | POST | Login verification | `{ username, password }` | `{ success, is_approved, ... }` | No |
| `/api/request-profile-update` | POST | Profile update request | `{ username, pending* fields }` | `{ success, verificationKey, ... }` | No |
| `/api/approve-profile-update` | GET | Approve profile changes | `{ user, email, phone, key }` query | HTML success page | No |
| `/api/save-model-preferences` | POST | Store user model prefs | `{ username, preferences }` | `{ success, message }` | No |
| `/api/save-api-keys` | POST | Encrypt and store API keys | `{ username, apiKeys: { provider: string } }` | `{ success, message }` | No |

### 1.4 Utility Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check with Gemini key status |

---

## 2. Request Lifecycle Diagram

```
Frontend Request
    ↓
HTTP POST/GET to /api/*
    ↓
Body Parser Middleware (express.json, express.urlencoded)
    ↓
Route Handler
    ↓
Authentication Check (optional per endpoint)
    ↓
Business Logic
    ├── AI Provider: generateWithSettings()
    │   ├── Gemini: getGeminiClient() → generateContentWithRetry()
    │   ├── Ollama: fetch() to localhost:11434/api/chat
    │   ├── Custom: fetch() to customEndpoint/chat/completions
    │   └── OpenAI/DeepSeek/Claude/Cohere: fetch() to respective APIs
    │
    ├── File Parsing: extractPrintableStrings() or library
    │   ├── PDF: pdf-parse library
    │   ├── DOCX: mammoth library
    │   ├── XLSX: xlsx library
    │   ├── Image: Gemini 2.5-flash OCR
    │   └── Audio: Gemini 2.5-flash transcription
    │
    └── User DB: readUsersDb() / writeUsersDb()
        ├── Legacy: users.json file
        └── Future: PostgreSQL via server/data/*
    ↓
Response Formatting
    ├── JSON: res.json({...})
    └── SSE: res.write(`data: ${JSON.stringify({ text })}\n\n`)
    ↓
Frontend Consumer
```

---

## 3. Middleware Stack

**VERIFIED:**
- `express.json({ limit: "50mb" })` - JSON body parser
- `express.urlencoded({ limit: "50mb", extended: true })` - URL-encoded parser
- Vite dev middleware (development only)
- Static file serving (production only)

**UNKNOWN:**
- No authentication middleware
- No rate limiting middleware
- No CSRF protection middleware
- No request logging middleware

---

## 4. AI Provider Resolution Logic

```
generateWithSettings(aiSettings.provider):
  gemini/server → Gemini via generateContentWithRetry()
  ollama → localhost:11434/api/chat
  custom → customEndpoint/v1/chat/completions
  openai → api.openai.com/v1/chat/completions
  deepseek → api.deepseek.com/chat/completions
  claude → api.anthropic.com/v1/messages
  cohere → api.cohere.ai/v1/chat
```

Key Features:
- Exponential backoff for Gemini (maxRetries=4, initialDelayMs=1500)
- Round-robin key selection for multiple Gemini keys
- JSON code fence cleaning for local providers
- Streaming fallback emits full text at once (not true streaming)

---

## 5. File Parsing Capabilities

**VERIFIED:**
| Extension | Parser | Method |
|-----------|--------|--------|
| .txt, .ris, .bib, .csv, .tsv, .json, .xml | Direct UTF-8 decode | `buffer.toString("utf8")` |
| .pdf | pdf-parse library | Falls back to printable string extraction |
| .docx | mammoth library | Falls back to printable string extraction |
| .xlsx, .xls | xlsx library | Converts sheets to CSV |
| .png, .jpg, .jpeg | Gemini 2.5-flash OCR | Inline image + prompt |
| .mp3, .wav, .m4a | Gemini 2.5-flash audio | Inline audio + prompt |
| Other | Printable string extraction | Character-level filtering |

Output Limitations:
- Text truncated to 80,000 characters
- No metadata extraction beyond basic file info

---

## 6. Server-Side Encryption

**VERIFIED:**
- Algorithm: AES-256-CBC
- Key source: `process.env.ENCRYPTION_KEY` (32-char) or hardcoded fallback `"scholar-agentic-secure-vault-32ch"`
- IV: Random 16-byte per encryption
- Storage: `users.json` with `encryptedApiKeys` and `apiKeyHashes` fields

---

## 7. Architectural Review

### Monolithic Responsibilities
**VERIFIED:**
- Single `server.ts` file hosts all route handlers
- Business logic intermingled with routing
- No separation of concerns (controllers/services)

### Tight Coupling
**VERIFIED:**
- AI providers hardcoded in route handlers
- No dependency injection
- Direct database reads/writes in endpoints

### Missing Security
**VERIFIED:**
- No authentication middleware
- No rate limiting
- API keys accepted in request bodies (client-side)
- Admin email hardcoded: `"doc.govinda@gmail.com"`

---

## 8. Known Risks

### Critical
- **API Keys in Request Body**: Provider keys sent with every request
- **No Rate Limiting**: Vulnerable to DoS/abuse
- **Hardcoded Admin Email**: Cannot change without code modification

### High
- **Monolithic Architecture**: Difficult to maintain/test
- **No Input Validation Schema**: Only basic null checks
- **File Size Limit 50MB**: Large uploads may cause memory issues

### Medium
- **Printable String Fallback**: May leak binary data
- **Gemini Model Names**: Uses `gemini-3.5-flash` (non-standard naming)

---

## 9. Remaining Unknowns

- Whether server/data/* PostgreSQL layer is wired into routes
- How migration from users.json to PostgreSQL works
- Whether vectorStore and searchIndex are implemented
- Admin password reset workflow completion