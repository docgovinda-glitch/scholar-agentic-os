# Project Baseline Report

**Baseline Version**: v1.0-PreImplementation
**Baseline Date**: 2026-07-14
**Architecture Freeze**: Complete
**Planning Freeze**: Complete

---

## Project Overview

The Doctoral Research & Journal Publication Assistant is a web-based application for PhD scholars to plan, draft, quality-control, and package doctoral/dissertation-informed manuscripts with AI assistance.

---

## Current Development Stage

| Phase | Status | Completion Date |
|-------|--------|-----------------|
| Architecture Discovery | Complete | 2026-07-14 |
| Implementation Planning | Complete | 2026-07-14 |
| Implementation | Complete (T002, T003, T004) | 2026-07-14 |

---

## Architecture Summary

### Frontend (React + Vite)
- Hash-based navigation (no React Router)
- Tailwind CSS v4 styling
- AuthContext for authentication state
- 17+ major components organized by workflow phase

### Backend (Express)
- Monolithic server.ts (2608 lines)
- 22 API endpoints across AI, parsing, and authentication
- AES-256-CBC server-side encryption
- PostgreSQL infrastructure exists but not wired

### AI Layer
- Multi-provider gateway (8 providers: gemini, openai, claude, deepseek, qwen, cohere, ollama, custom)
- Exponential backoff retry logic
- Streaming support (SSE for remote, best-effort for local)
- Fallback chain support

### Document Intelligence
- Dual-pipeline architecture (Parser Pipeline functional, Stage Pipeline incomplete)
- 4 working parsers (PDF, DOCX, TXT, Markdown)
- 8 identified but unimplemented formats

### Core Framework
- CRPM (Canonical Research Project Model) defined
- ProjectBuilder, ProjectValidator, ProjectSerializer, ProjectVersionManager
- ManuscriptPipeline for section-based drafting

---

## Current Feature Inventory

| Feature | Status | Notes |
|---------|--------|-------|
| User Authentication | Complete | localStorage-based, PBKDF2 password hashing (T004) |
| Knowledge Vault Upload | Complete | File parsing via server, chunking, overview extraction |
| AI Drafting | Complete | Section-by-section with context injection |
| Quality Control | Complete | JSON-based QC reports |
| Submission Packaging | Complete | Cover letter, checklist generation |
| Phase B-H Endpoints | Complete | All phase endpoints implemented |
| Format Identifier | Partial | 8 formats identified, no parsers |
| Manuscript Export | Partial | LaTeX only, no import |

---

## Completed Implementation Tasks

| Task | Priority | Module | Completion Date |
|------|----------|--------|-----------------|
| Event Dispatcher (T002) | P0 | App.tsx | 2026-07-14 |
| Secure Encryption (T003) | P0 | crypto.ts | 2026-07-14 |
| Password Hashing (T004) | P0 | authContext.tsx, crypto.ts | 2026-07-14 |

---

## Current Technical Debt

| Issue | Priority | Module |
|-------|----------|--------|
| Dual CDM Models | P0 | document_intelligence/model/types.ts, cdm.ts |
| API Keys in Request Body | P1 | aiGateway.ts, server.ts |
| No CSRF Protection | P1 | server.ts |
| No Rate Limiting | P1 | server.ts |
| Monolithic server.ts | P1 | server.ts |
| Monolithic App.tsx | P1 | App.tsx |

---

## Known Bugs

| Bug | Location | Impact |
|-----|----------|--------|
| Rollback compares wrong field | ProjectVersionManager | Incorrect version restoration |
| BOM not stripped in TXT | txtParser | Data quality issue |
| ASCII returns utf-8 | txtParser | Encoding detection |

---

## Known Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Model Duality | High | High | Merge or adapter |
| No CSRF | Medium | Medium | Token implementation |
| No Rate Limiting | Medium | Medium | Add rate limiting |

---

## Security Status

**Score: 50/100** (improved from 30)

- ✅ PBKDF2-SHA256 password hashing implemented (T004)
- ✅ AES-GCM encryption available (T003)
- ⚠️ No CSRF protection
- ⚠️ API keys in request bodies
- ⚠️ No rate limiting

---

## Testing Status

| Metric | Value |
|--------|-------|
| Total Tests | 177 |
| Passing | 164 |
| Failing | 13 |
| Coverage Gaps | Document Intelligence, Skills |

---

## Performance Status

- Streaming JSON parse errors silently swallowed
- Keyword overlap retrieval (not semantic)
- No pagination for large vault files

---

## Documentation Status

| Document | Status |
|----------|--------|
| PROJECT_MEMORY.md | Complete |
| implementation_plan.md | Complete |
| integration_architecture.md | Complete |
| ui_architecture.md | Complete |
| backend_api_architecture.md | Complete |
| authentication_security_architecture.md | Complete |
| state_persistence_architecture.md | Complete |
| core_framework_architecture.md | Complete |
| document_intelligence_architecture.md | Complete |

---

## Master Backlog Summary

8 remaining tasks identified across 4 phases:
- Phase 1 (Critical): 1 task (T001 only)
- Phase 2 (Security): 3 tasks (T005, T006, remaining API key work)
- Phase 3 (Architecture): 2 tasks (T007, T008)
- Phase 4 (Quality): 2 tasks (T009, T011)

---

## Project Scorecard

| Category | Score | Evidence |
|----------|-------|----------|
| Architecture | 75 | Good separation, some monoliths |
| Security | 50 | Improved - PBKDF2 implemented |
| Scalability | 40 | Database not wired |
| Testing | 45 | 164/177 passing |
| Documentation | 90 | All systems documented |
| Maintainability | 50 | Large files need refactoring |
| Developer Experience | 70 | Clear module structure |
| Production Readiness | 50 | Security improved, CSRF needed |

---

## Implementation Entry Criteria

Before implementation may begin:
- [x] Architecture Discovery Complete
- [x] Implementation Planning Complete
- [x] All documentation created
- [x] Master backlog established
- [x] Baseline snapshot created
- [x] PROJECT_MEMORY.md updated

---

## T002/T003/T004 Implementation Summary

**Completed on 2026-07-14:**

- **T002**: Added `dispatchEvent(new CustomEvent("scholar_project_updated"))` to `updateProject()` in App.tsx
- **T003**: Implemented AES-GCM + PBKDF2 encryption in crypto.ts, removed hardcoded fallback keys
- **T004**: Implemented PBKDF2-SHA256 password hashing with backward compatibility

---

## Baseline Updated

**Date**: 2026-07-14

T002, T003, and T004 completed successfully.