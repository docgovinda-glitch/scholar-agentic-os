# ADR-001: Document Model Architecture — Dual CDM Models

- Status: Accepted (Architecture Decision)
- Date: 2026-07-14
- Authors: blackboxai

## Context
The Document Intelligence subsystem defines document processing contracts and “canonical” document models used across parsing, pipeline orchestration, skills integration, and downstream storage/export.

During early cycles, two distinct document model definitions were introduced:
1. `src/document_intelligence/cdm.ts` — exports `CanonicalDocumentModel` (identity + nested metadata/structure + `academicObjects` + `statistics`).
2. `src/document_intelligence/model/types.ts` — exports `Document` (flat entity collections: `pages[]`, `sections[]`, `paragraphs[]`, `tables[]`, `figures[]`, `references[]`, plus `searchable.fullText` and `searchable.chunks`).

Additionally, `src/document_intelligence/adapters/cdmAdapter.ts` provides `CDMAdapter.toCDM()` that produces the model from `cdm.ts`, while `src/document_intelligence/skills/documentIntelligenceSkill.ts` and `src/document_intelligence/pipeline/types.ts` use the model from `model/types.ts`.

The project was paused for “T001 — Dual CDM Models” because these models are fundamentally incompatible.

## Problem
Should the project have one canonical document model or multiple specialized document models?

Having two incompatible “canonical” models without an explicit, enforced translation boundary creates architectural risk:
- Hard-to-reason system behavior (which model is authoritative depends on subsystem boundaries).
- Non-trivial information mapping ambiguity (identity/metadata structure, academic object representation, searchable/chunking availability).
- Migration pressure and increased coupling when new extraction/AI/skill steps require consistent document access patterns.

## Evidence
### Evidence 1 — Two incompatible model definitions
- `src/document_intelligence/cdm.ts`: `CanonicalDocumentModel` has top-level `identity`, `metadata`, `structure`, `academicObjects`, `statistics`, `diagnostics`.
- `src/document_intelligence/model/types.ts`: `Document` has top-level `pages`, `sections`, `paragraphs`, `tables`, `figures`, `references`, `searchable`, `metadata`, `diagnostics`.

### Evidence 2 — Model production vs consumption mismatch
- `src/document_intelligence/adapters/cdmAdapter.ts`: `CDMAdapter.toCDM()` returns `CanonicalDocumentModel`.
- `src/document_intelligence/skills/documentIntelligenceSkill.ts`: pipeline output is typed as `Document` from `model/types.ts`.
- `src/document_intelligence/pipeline/types.ts`: `DocumentIntelligencePipelineOutput.document: Document`.

### Evidence 3 — Architectural documentation acknowledges dual-model risk
- `docs/document_intelligence_architecture.md` explicitly flags “CDM Models” as **incompatible**, stating that `cdmAdapter` produces `CanonicalDocumentModel` while the pipeline expects `Document`.

### Evidence 4 — No conversion layer present (in inspected scope)
- No `cdmToDocument()` / `documentToCdm()` conversion function is present in the inspected code that would make the boundary explicit and reliable.

## TRACE: Complete Data Flow (models and transitions)
Intended flow (from task statement):

Upload → Parsing → Canonical representation → Document Intelligence → Knowledge Vault → Skills Framework → AI → Storage → Export

Evidence-based mapping to implemented models:

1. Upload → Parsing
   - Parser implementations (PDF/DOCX/TXT/Markdown) produce `ParserResult` (not yet the platform-level canonical document).
   - Model used: `ParserResult` (defined in `src/document_intelligence/parser/types.ts`).

2. Parsing → Canonical representation
   - `src/document_intelligence/adapters/cdmAdapter.ts` converts `ParserResult` to `CanonicalDocumentModel`.
   - Model used: `CanonicalDocumentModel` (from `src/document_intelligence/cdm.ts`).
   - Why it changes: “canonical representation” step is implemented as CDM adapter output.
   - Conversion intentionality: unclear/documentation does not establish a stable cross-subsystem boundary.
   - Information loss risk:
     - `CanonicalDocumentModel` includes `statistics` but not `searchable.chunks`.
     - It uses nested `structure` containers rather than entity collections.
   - Reversibility: not provably reversible because structural shapes differ.

3. Canonical representation → Document Intelligence
   - Document Intelligence pipeline/skill contract expects `Document` from `src/document_intelligence/model/types.ts`.
   - Model used: `Document` (flat entity graph with `searchable`).
   - Why it changes: pipeline/skill layer defines its own canonical type.
   - Conversion intentionality: absent/undocumented in the inspected code.
   - Information loss risk:
     - `CanonicalDocumentModel`’s `academicObjects` vs `Document`’s `references` mismatch.
     - `Document` expects `searchable.fullText` and `chunks`, which are not produced by `CDMAdapter`.
   - Reversibility: not guaranteed due to non-overlapping features and shape mismatch.

4. Document Intelligence → Knowledge Vault → Skills → AI → Storage → Export
   - These layers are documented at a high level (e.g., Knowledge Vault stores/chunks text), but the repository evidence provided for this ADR centers on the document model boundary.
   - The key architectural risk remains: inconsistent “canonical” types prevent deterministic handoff.

## Options Considered
### Option A — Single unified document model
Use exactly one model type as the platform’s authoritative document representation across all Document Intelligence stages and downstream consumers.

### Option B — Canonical model with specialized processing models
Maintain one canonical document model, but allow temporary specialized intermediate representations inside stages (not exported outside the subsystem boundary).

### Option C — Separate bounded-context models connected through adapters
Keep multiple document models if they represent different bounded contexts, but require explicit, audited conversion at the boundaries (including loss/reversibility semantics and test coverage).

### Option D — Alternative architecture
If evidence supports it, introduce a radically different architecture (e.g., event-sourced document entities, or a graph store representation) that avoids dual-model canonical ambiguity.

## Evaluation (trade-offs)
### Option A — Single unified document model
**Advantages**
- Eliminates ambiguity about “canonical” representation.
- Reduces coupling: all stages and downstream consumers use the same type.
- Simplifies validation and testing (one contract).

**Disadvantages**
- Requires migration work from at least one existing model.
- Forces design consolidation of identity/metadata/searchable/academic objects.

**Migration complexity**
- Medium to high (schema unification), but bounded by this subsystem.

**Backward compatibility**
- Potential breaking change to typed consumers.

**Performance**
- Neutral: model shape does not inherently slow/slow down parsing.

**Maintainability**
- High: fewer model types.

**Scalability**
- High: easier to extend once the canonical graph is stable.

**Coupling**
- Low coupling after consolidation.

**Future extensibility**
- High, if the canonical model is designed with optional sections and extensible metadata.

**Testing impact**
- Reduced: fewer cross-model invariants.

**Risk**
- Moderate: incorrect unification could lose important semantics.

### Option B — Canonical model with specialized processing models
**Advantages**
- Preserves internal flexibility (stages may use temporary structures).
- Still guarantees one authoritative exported model.

**Disadvantages**
- Requires disciplined boundaries: specialized representations cannot leak across stages.

**Migration complexity**
- Similar to Option A, but with clearer stage-internal freedom.

**Backward compatibility**
- Breaking for any consumer that currently expects one of the two existing “canonical” types.

**Performance**
- Neutral.

**Maintainability**
- High.

**Scalability**
- High.

**Coupling**
- Low.

**Testing impact**
- High quality tests at conversion boundary will suffice.

**Risk**
- Lower than Option C because only one canonical type exists.

### Option C — Separate bounded-context models connected through adapters
**Advantages**
- Allows different models if they truly serve distinct purposes.
- Limits schema changes if you retain both models.

**Disadvantages**
- Requires explicit and correct conversion semantics (including loss/reversibility).
- In practice, conversion complexity increases nonlinearly with model divergence.
- Raises the risk of “canonical drift” (each side evolves independently).

**Migration complexity**
- High: adapters + test matrix + long-term maintenance.

**Backward compatibility**
- Better immediate type stability, but at cost of cross-model mapping.

**Performance**
- Potential overhead from conversion.

**Maintainability**
- Medium to low: two models plus adapters.

**Scalability**
- Medium: more moving parts.

**Coupling**
- Medium: adapters couple both models.

**Future extensibility**
- Medium: each new feature must be implemented and mapped in both models.

**Testing impact**
- High: conversion tests and invariant tests required.

**Risk**
- High, because evidence shows models are already incompatible without a boundary contract.

### Option D — Alternative architecture
No evidence was found that the repository’s requirements demand a fundamentally different representation beyond a unified canonical contract.

**Risk**
- High: larger design change with lower evidence support.

## Decision
Choose exactly one recommendation:

**Recommendation: Option B — Single canonical document model (one exported type), with specialized internal processing models.**

Concretely, the project should converge on **one canonical document model type** for cross-subsystem handoff in Document Intelligence (parsing → intelligence → knowledge vault integration → storage/export).

The current state (two incompatible “canonical” models) is an architectural problem because:
- Evidence shows hard type contract mismatch between components (`cdmAdapter.ts` outputs `CanonicalDocumentModel`, while skills/pipeline contract expects `Document`).
- Evidence shows structural incompatibility (identity/metadata/structure vs pages/entities; searchable/chunks vs academicObjects; references vs academicObjects).
- Evidence indicates no explicit conversion boundary exists in the inspected scope.

Therefore, multiple models cannot be justified as “intentional specialization” without an explicit bounded-context adapter contract that defines loss/reversibility semantics, which is currently missing.

## Consequences
- **Short-term:** T001 should be treated as a design-migration task; until resolved, downstream steps must not assume a single stable canonical type.
- **Medium-term:** One canonical type enables consistent indexing/chunking semantics (`searchable.fullText` + `chunks`) and consistent reference/citation placeholders.
- **Long-term:** Stages can still create specialized intermediate representations, but only the canonical model is allowed as the pipeline output.

## Migration Strategy (conceptual; no code changes in this ADR)
1. Select the canonical model direction using evidence:
   - `model/types.ts` already includes `searchable.fullText` and `searchable.chunks`, which aligns with Knowledge Vault chunking and later export needs.
   - `cdm.ts` includes `statistics` and `academicObjects`—useful but can be represented as optional fields in the canonical model.
2. Define a formal stage boundary:
   - Parsing may output `ParserResult` (existing).
   - Parsing-to-canonical conversion must produce **only** the chosen canonical model.
3. Ensure conversion semantics:
   - Explicitly document which fields map, which are optional, and which are computed later.
4. Add tests validating:
   - Deterministic identity/fingerprint.
   - Lossless mappings where expected; otherwise loss documented and reversible not required.

## Rejected Alternatives
- **Option A (single unified model without internal specialization):** less flexible; internal specialized representations are often useful, so Option B is preferable.
- **Option C (two bounded-context canonical models + adapters):** evidence shows adapters are currently missing and models are highly incompatible; without a strict conversion contract, this is high risk.
- **Option D (alternative architecture):** no evidence supports a need for a fundamentally different architecture right now.

