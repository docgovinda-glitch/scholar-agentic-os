# End-to-End Integration Architecture Report

## Executive Summary

The application demonstrates good architectural separation between UI, services, and backend. Key integration issues exist around the dual CDM models, missing event dispatchers, and security gaps.

---

## 1. Complete Application Flow

```
User Login
    ↓
Auth Context (authContext.tsx)
    - login() validates against localStorage profile
    - Sets user, project in React state
    ↓
Project Creation/Update
    ↓
App.tsx State Management
    - updateProject() merges changes to PaperProject
    - Persists to localStorage immediately
    ↓
Research Intake
    ↓
ResearchIntakeWizard
    - Collects project fields
    - setProject() updates state
    ↓
Phase A → B Grounding
    ↓
aiService.generateDissertationGrounding()
    - POST /api/generate/dissertation-grounding
    - Returns GroundingMap → project.groundingMap
    ↓
Phase C Knowledge Vault Upload
    ↓
ThesisReader/KnowledgeVaultManager
    ↓
knowledgeVaultService.uploadAndProcessFile()
    - POST /api/parse-file (server.ts)
    - Chunks text, extracts overview via AI
    - Returns VaultFile[] → project.knowledgeVault
    ↓
Phase D Data Discovery
    ↓
DataDiscoveryPanel
    - POST /api/generate/data-discovery
    - Returns sources → project.dataSources
    ↓
Phase E Journal Discovery
    ↓
JournalDiscoveryPanel
    - POST /api/generate/journal-discovery
    - Returns journals → project.targetJournal
    ↓
Phase F Drafting
    ↓
ManuscriptDraftingWorkspace
    - aiService.draftSection() with vault context
    - POST /api/generate/draft-section
    - Returns draftText → project.sections
    ↓
Knowledge Retrieval (context injection)
    - getRelevantChunksContext() queries chunks
    - buildCitationPrompt() injects citation rules
    ↓
Quality Control
    ↓
QualityControlSuite
    - POST /api/generate/quality-control
    - Returns QCReport → project.qcReport
    ↓
Phase H Submission
    ↓
SubmissionPackagingSuite
    - POST /api/generate/submission-pack
    - Returns SubmissionPack → project.submissionPack
    ↓
Export (LaTeX)
    ↓
App.tsx handleExportLaTeX()
    - Generates LaTeX from sections
    - Blob download (no server call)
    ↓
Project Save → localStorage
    - Persists on every updateProject() call
    ↓
Reload → State Restoration
    - AuthContext useEffect reads localStorage
    - Restores user, project, onboardingStep
```

---

## 2. Cross-Module Contract Matrix

| Interface | From | To | Contract Type | Verification |
|-----------|------|----|---------------|--------------|
| `PaperProject` | types.ts | All UI/Services | State Model | VERIFIED |
| `useAuth()` | authContext | All Components | Context Hook | VERIFIED |
| `draftSection()` | aiService | Workspace | Service | VERIFIED |
| `AIGateway.generate()` | aiGateway | aiService | Service | VERIFIED |
| `POST /api/generate` | aiService | server.ts | API | VERIFIED |
| `POST /api/parse-file` | knowledgeVaultService | server.ts | API | VERIFIED |
| `scholar_project_updated` | App.tsx (missing) | App.tsx (unused) | Event | FAILING |
| `Document` (CDMs) | parser types | skills/adapters | Model | **MISMATCH** |
| `CanonicalDocumentModel` | cdm.ts | Unknown | Model | ORPHAN |

---

## 3. Integration Issues

### Critical
1. **Dual CDM Models**: `model/types.ts` Document and `cdm.ts` CanonicalDocumentModel are incompatible
   - Evidence: No common fields, different purposes, no adapter for conversion
2. **Missing Event Dispatcher**: `scholar_project_updated` never dispatched but listener exists
   - Evidence: Line 135 in App.tsx listens, no dispatchEvent found

### High
3. **Stage Pipeline Orphan**: `DocumentIntelligencePipeline` has no stage implementations
   - Evidence: Stage classes defined but not registered
4. **API Keys in Request Body**: Security risk - keys sent with every request
   - Evidence: `/api/generate` accepts apiKey in body

### Medium
5. **Two JSON Parsing Strategies**: Inconsistent across codebase
   - Evidence: `cleanJsonString` vs `safeParseJSON`

---

## 4. System Readiness Assessment

| Category | Status | Evidence |
|----------|--------|----------|
| Architecture Completeness | Mostly Ready | Core modules exist, some integration gaps |
| Module Cohesion | Ready | Clear ownership boundaries |
| Coupling | Mostly Ready | Some tight coupling (App.tsx monolithic) |
| Maintainability | Needs Work | Large components, no separation of concerns |
| Scalability | Needs Work | No database wired, localStorage only |
| Extensibility | Ready | Plugin architecture for parsers/providers |
| Security Readiness | Not Ready | Weak encryption, no CSRF, API keys in body |
| Testing Readiness | Needs Work | 177 tests, 164 passing, 13 failures |
| Documentation Completeness | Mostly Ready | All subsystems analyzed, integration documented |

---

## 5. Master Risk Register

### Critical Risks

| Risk | Modules | Impact | Evidence |
|------|---------|--------|----------|
| Model Duality | document_intelligence/model/types.ts, cdm.ts | Data loss/corruption | Two incompatible models, no migration |
| Missing Event Dispatcher | App.tsx | Feature failure | Event listener without dispatch |
| Weak Client Encryption | utils/crypto.ts | Security breach | XOR cipher with hardcoded key |
| API Keys in Body | aiGateway, server.ts | Credential exposure | apiKey sent with every request |

### High Risks

| Risk | Modules | Impact | Evidence |
|------|---------|--------|----------|
| Monolithic App.tsx | App.tsx | Maintenance burden | 1731 lines, multiple concerns |
| Monolithic server.ts | server.ts | Hard to maintain | 2608 lines, all routes |
| No Rate Limiting | server.ts | DoS vulnerability | No middleware |
| No CSRF Protection | authContext, server | Session hijacking | No tokens/cookies |

### Medium Risks

| Risk | Modules | Impact | Evidence |
|------|---------|--------|----------|
| Pipeline Disconnection | DocumentIntelligencePipeline | Confusing API | Stages not implemented |
| BOM Not Stripped | txtParser | Data quality | UTF-8 BOM remains |
| Missing Parsers | FormatIdentifier | Incomplete feature | 8 formats not implemented |

---

## 6. Implementation Readiness Backlog

### Phase 1 — Critical Blockers

| Item | Priority | Rationale | Dependencies | Complexity | Risk |
|------|----------|-----------|--------------|------------|------|
| Fix dual CDM models | P0 | Data model conflict | None | High | High |
| Implement event dispatch | P0 | Broken feature | None | Low | Low |
| Replace weak encryption | P0 | Security vulnerability | None | Medium | High |
| Move API keys server-side | P1 | Credential exposure | server.ts changes | High | Medium |

### Phase 2 — Foundation Work

| Item | Priority | Rationale | Dependencies | Complexity | Risk |
|------|----------|-----------|--------------|------------|------|
| Refactor server.ts routes | P1 | Maintainability | None | High | Medium |
| Refactor App.tsx | P1 | State separation | Task 1 | Medium | Medium |
| Add rate limiting | P1 | Security hardening | server.ts | Medium | Low |
| Connect PostgreSQL layer | P1 | Scalability | server.ts | High | Medium |

### Phase 3 — Core Features

| Item | Priority | Rationale | Dependencies | Complexity | Risk |
|------|----------|-----------|--------------|------------|------|
| Implement missing parsers | P2 | Format support | ParserRegistry | Medium | Low |
| Register stage implementations | P2 | Pipeline completion | None | High | Medium |
| Add schema validation | P2 | Data correctness | aiService | Medium | Low |

### Phase 4 — Enhancements

| Item | Priority | Rationale | Dependencies | Complexity | Risk |
|------|----------|-----------|--------------|------------|------|
| Add React Router | P3 | Standard navigation | App.tsx | Low | Low |
| Add CSRF tokens | P3 | Security hardening | server.ts | Low | Low |

---

## 7. Final Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                      │
│  ┌────────┐  ┌────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ Login  │→│ Onboarding│→│ Dashboard   │→│ Workspace    │ │
│  └────────┘  └────────┘  └─────────────┘  └──────────────┘ │
│                              ↓                            │
│                      ┌────────────────┐                     │
│                      │ Phase Components │                     │
│                      └────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    STATE MANAGEMENT                          │
│  AuthContext → user/project/loading/onboardingStep            │
│  App.tsx → viewMode/activeTab/allProjects                     │
│  localStorage → profile persistence                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                               │
│  aiService ←→ aiGateway ←→ server.ts /api/generate            │
│  knowledgeVaultService ←→ server.ts /api/parse-file             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Express)                           │
│  /api/generate      /api/stream-generate                       │
│  /api/parse-file    /api/lookup-doi                            │
│  /api/generate/*    (Phases B-H endpoints)                     │
│  /api/register      /api/approve                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Confidence Level

**90%** - All major subsystems analyzed and integrated understanding documented. Remaining unknowns are minor implementation details.