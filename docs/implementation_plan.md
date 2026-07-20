# Implementation Plan & Roadmap

## Phase 1 — Consolidated Findings

### Risks (Consolidated)
| Risk | Category | Priority | Evidence |
|------|----------|----------|----------|
| Model Duality (CDMs) | Architecture | P0 | Two incompatible models: Document vs CanonicalDocumentModel |
| Missing Event Dispatcher | Architecture | P0 | `scholar_project_updated` listener without dispatcher |
| Weak Client Encryption | Security | P0 | XOR cipher with hardcoded fallback key |
| API Keys in Request Body | Security | P1 | Credentials sent with every request |
| No CSRF Protection | Security | P1 | No anti-forgery tokens |
| No Rate Limiting | Security | P1 | DoS vulnerability |
| Monolithic server.ts | Architecture | P1 | 2608 lines, all routes combined |
| Monolithic App.tsx | Architecture | P1 | 1731 lines, multiple concerns |
| Streaming Parse Swallowing | Performance | P1 | JSON errors silently ignored |
| No Schema Validation | Quality | P2 | Only JSON.parse, no Zod/AJV |
| 13 Failing Tests | Testing | P2 | Test suite instability |
| Missing 8 Parsers | Features | P2 | HTML, RTF, EPUB, ODT, LaTeX, XML, RIS, BibTeX |
| BOM Not Stripped | Quality | P2 | UTF-8 BOM in TXT output |

---

## Phase 2 — Master Implementation Backlog

### Task T001: Resolve Dual CDM Models
- **Category**: Architecture
- **Priority**: P0
- **Business Impact**: Data integrity, format support
- **Technical Risk**: High - breaking change
- **Dependencies**: None
- **Files**: `src/document_intelligence/model/types.ts`, `src/document_intelligence/cdm.ts`
- **Complexity**: High
- **Size**: Large
- **Acceptance Criteria**: Single unified CDM model, backward compatible
- **Definition of Done**: Models merged or adapter created, tests passing

### Task T002: Implement Event Dispatcher
- **Category**: Architecture
- **Priority**: P0
- **Business Impact**: State sync, feature completeness
- **Technical Risk**: Low
- **Dependencies**: None
- **Files**: `src/App.tsx`
- **Complexity**: Low
- **Size**: Small
- **Acceptance Criteria**: Project updates dispatch `scholar_project_updated` event
- **Definition of Done**: Event dispatched on every project change

### Task T003: Replace Weak Client Encryption
- **Status**: Completed
- **Category**: Security
- **Priority**: P0
- **Business Impact**: User data protection
- **Technical Risk**: Medium
- **Dependencies**: None
- **Files**: `src/utils/crypto.ts`
- **Complexity**: Medium
- **Size**: Medium
- **Acceptance Criteria**: Secure encryption, no hardcoded keys
- **Definition of Done**: AES-GCM or WebCrypto API implemented

### Task T004: Eliminate Plaintext Password Storage
- **Status**: Completed
- **Category**: Security
- **Priority**: P0
- **Business Impact**: Credential protection
- **Technical Risk**: Medium
- **Dependencies**: None
- **Files**: `src/auth/authContext.tsx`, `src/utils/crypto.ts`
- **Complexity**: Medium
- **Size**: Medium
- **Acceptance Criteria**: Passwords stored as salted hashes, legacy compatibility

### Task T005: Add CSRF Protection
- **Category**: Security
- **Priority**: P1
- **Business Impact**: Session security
- **Technical Risk**: Low
- **Dependencies**: T004
- **Files**: `server.ts`, `authContext.tsx`
- **Complexity**: Medium
- **Size**: Medium
- **Acceptance Criteria**: CSRF tokens on state-changing endpoints

### Task T006: Add Rate Limiting
- **Category**: Security
- **Priority**: P1
- **Business Impact**: DoS protection
- **Technical Risk**: Low
- **Dependencies**: T004
- **Files**: `server.ts`
- **Complexity**: Low
- **Size**: Small
- **Acceptance Criteria**: 429 responses under load

### Task T007: Refactor server.ts Routes
- **Category**: Architecture
- **Priority**: P1
- **Business Impact**: Maintainability
- **Technical Risk**: Medium
- **Dependencies**: None
- **Files**: `server.ts`, `server/data/*`
- **Complexity**: High
- **Size**: Large
- **Acceptance Criteria**: Modular route files, clearer separation

### Task T008: Refactor App.tsx
- **Category**: Architecture
- **Priority**: P1
- **Business Impact**: Maintainability
- **Technical Risk**: Medium
- **Dependencies**: T002
- **Files**: `src/App.tsx`
- **Complexity**: High
- **Size**: Large
- **Acceptance Criteria**: Smaller components, separated concerns

### Task T009: Add Schema Validation
- **Category**: Quality
- **Priority**: P2
- **Business Impact**: Data correctness
- **Technical Risk**: Low
- **Dependencies**: None
- **Files**: `src/services/aiService.ts`
- **Complexity**: Medium
- **Size**: Medium
- **Acceptance Criteria**: Zod schemas for all JSON responses

### Task T010: Fix Streaming Error Handling
- **Category**: Performance
- **Priority**: P1
- **Business Impact**: Reliability
- **Technical Risk**: Low
- **Dependencies**: None
- **Files**: `src/services/aiGateway.ts`
- **Complexity**: Low
- **Size**: Small
- **Acceptance Criteria**: Errors surfaced, not swallowed

### Task T011: Fix Failing Tests
- **Category**: Testing
- **Priority**: P2
- **Business Impact**: Quality assurance
- **Technical Risk**: Low
- **Dependencies**: Related implementation fixes
- **Files**: Test files
- **Complexity**: Medium
- **Size**: Medium
- **Acceptance Criteria**: All 177 tests passing

---

## Phase 3 — Dependency Analysis

```
T001 (Resolve CDM) ──┐
                     ├── T007 (Refactor server)
T002 (Event) ────────┤
                     ├── T008 (Refactor App)
T003 (Encryption) ───┤
                     ├── T004 (API Keys server-side)
                     ├── T005 (CSRF)
                     ├── T006 (Rate Limiting)
T009 (Schema) ───────┤
T010 (Streaming) ────┤
T011 (Tests) ────────┘
```

---

## Phase 4 — Implementation Phases

| Phase | Focus | Tasks |
|-------|-------|-------|
| Phase 1 | Critical Blockers | T001, T002, T003 |
| Phase 2 | Security Foundation | T004, T005, T006 |
| Phase 3 | Architecture Stabilization | T007, T008 |
| Phase 4 | Quality & Testing | T009, T010, T011 |
| Phase 5 | Feature Completion | Missing parsers, etc. |

---

## Phase 5 — Critical Path

**Shortest Safe Path:**

1. T001 (Resolve CDM) → Ensures data integrity
2. T002 (Event Dispatcher) → Enables state sync
3. T003 (Encryption) → Security foundation
4. T004 (API Keys) → Credential protection
5. T007 (server refactor) → Maintainability
6. T008 (App refactor) → Maintainability

These unblock all other work.

---

## Phase 6 — Quick Wins

| Task | Risk | Impact | Size |
|------|------|--------|------|
| T010 (Fix streaming errors) | Low | Medium | Small |
| T002 (Add event dispatch) | Low | Small | Small |
| T006 (Rate limiting) | Low | High | Small |
| T009 (Schema validation) | Low | High | Medium |

---

## Phase 7 — Master Risk Register

| Risk | Impact | Likelihood | Mitigation | Phase |
|------|--------|------------|------------|-------|
| Model Duality | Data corruption | High | Merge or adapter | 1 |
| Weak Encryption | Security breach | High | Replace with WebCrypto | 1 |
| No CSRF | Account takeover | Medium | Add tokens | 2 |
| API Keys in Body | Credential leak | High | Server-side storage | 2 |

---

## Phase 8 — Testing Roadmap

| Test Type | Target | Tools |
|-----------|--------|-------|
| Unit | All modules | Vitest |
| Integration | API endpoints | Supertest |
| E2E | Workflows | Playwright/Cypress |
| Security | Auth, encryption | OWASP ZAP |
| Performance | Streaming, large files | Artillery |

---

## Phase 9 — Release Roadmap

| Milestone | Objectives | Tasks Required |
|-----------|----------|---------------|
| Alpha | Core workflow functional | T001-T006 |
| Beta | Security stabilized | T003-T006 |
| Feature Complete | All parsers, stages | T001, missing parsers |
| RC | All tests passing | T011 |

---

## Phase 10 — Project Scorecard

| Category | Score | Evidence |
|----------|-------|----------|
| Architecture | 75 | Good separation, some monoliths |
| Security | 30 | Weak encryption, no CSRF |
| Scalability | 40 | No database wired |
| Testing | 45 | 164/177 passing |
| Readiness | 60 | Needs security work |

---

## Next Recommended Task

**T001: Resolve Dual CDM Models** - This is the highest priority as it affects data integrity across the entire Document Intelligence subsystem.