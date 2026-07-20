# Implementation Epic Roadmap

**Status update**: T002, T003, T004, T005, and T006 below are now implemented and verified in code (event dispatch in `src/App.tsx`, `encryptDataAsync`/`hashPassword`/`verifyPassword` in `src/utils/crypto.ts`, CSRF analysis documented as not applicable in `docs/authentication_security_architecture.md`, and rate limiting in `server/middleware/authRateLimiter.ts` / `server/src/middleware/rateLimit.ts` with `server/src/__tests__/t006.rateLimit.test.ts`). T001 (dual CDM model resolution) has not been verified as resolved — no `cdmToDocument`/`documentToCdm` adapter functions were found in `src/`. The per-task "Status: READY" markers below are the original plan and are left as historical record; treat E01/E02 as substantially complete rather than "Ready to Begin."

---

## Epic E01 — Architecture Stabilization

### Objective
Resolve architectural inconsistencies and establish a stable foundation for feature implementation. All P0 tasks that are unblocked and can be executed in parallel.

### Business Value
- Enables confident feature development
- Eliminates data integrity risks
- Establishes security baseline
- Reduces confusion between incompatible models

### Technical Value
- Single canonical document model per ADR-001
- Working event system
- Secure encryption
- Clear module boundaries

### Dependencies
- ADR-001 accepted (document model architecture decided)

### Estimated Size
Large (multiple P0 tasks)

### Exit Criteria
- T001 completed (unified Document model implemented per ADR-001)
- T002 completed (event dispatcher implemented)
- T003 completed (secure encryption in place)
- All tests passing

---

## Task Order for Epic E01

### T003: Replace Weak Client Encryption
- **Objective**: Replace XOR cipher with WebCrypto API
- **Dependencies**: None
- **Acceptance Criteria**: No hardcoded keys, AES-GCM encryption
- **Blocking Tasks**: T004, T005, T006
- **Status**: READY

### T002: Implement Event Dispatcher
- **Objective**: Dispatch `scholar_project_updated` event on project changes
- **Dependencies**: None
- **Acceptance Criteria**: Event dispatched in App.tsx updateProject
- **Blocking Tasks**: T008
- **Status**: READY

### T001: Resolve Dual CDM Models (Per ADR-001)
- **Objective**: Implement Option B - Single canonical model with internal specialization
- **Dependencies**: ADR-001 accepted
- **Acceptance Criteria**: 
  - `Document` from `model/types.ts` is the canonical export
  - `CDMAdapter` produces `Document` type
  - Backward compatibility maintained via adapter functions
- **Blocking Tasks**: None (can now proceed with ADR guidance)
- **Status**: READY (ADR provides path forward)

---

## Blocker Analysis

### Previously Blocked Tasks (Now Unblocked)

**T001**: Was blocked due to model incompatibility. Now has ADR-001 guidance.
- Path forward: Implement per ADR-001 (Option B - single canonical with internal specialization)
- Migration: Add adapter functions `cdmToDocument`, `documentToCdm`
- Breaking changes: Minimal if types are kept compatible

### Remaining Blocked Tasks

**T004, T005, T006**: Blocked by T003 (encryption must be in place first)

---

## Critical Path (Updated)

```
T003 (Encryption) → T004 (API Keys) → T005 (CSRF) → T006 (Rate Limiting)
      ↓
T002 (Event Dispatcher) can run in parallel
      ↓
T001 (CDM Resolution) can run in parallel (has ADR)
      ↓
T007, T008 (Refactoring) after E01 complete
```

---

## Epic Structure

| Epic | Focus | Tasks | Status |
|------|-------|-------|--------|
| E01 | Architecture Stabilization | T001, T002, T003 | Ready to Begin |
| E02 | Security Foundation | T004, T005, T006 | Blocked by E01 |
| E03 | Codebase Refactoring | T007, T008 | Blocked by E01 |
| E04 | Quality & Testing | T009, T010, T011 | Ready to Begin |

---

## First Implementation Task

**T003: Replace Weak Client Encryption**
- Lowest risk (standalone)
- Enables other security tasks
- Small, focused change