# Journal Article Workspace — 5 Research Phases & 25 Stages Architecture

> **Doc ID:** 35 · **Status:** Implemented · **Depends on:** `30`, `31`, `34`  
> **Target Output Type:** `OT-10` (Peer-Reviewed Journal Article)  
> **Interactive Test Coverage:** 26 Test Suites / 176 Unit & Integration Tests in `src/desk/workspace/__tests__/`

---

## 1. Executive Summary

The **Journal Article Workspace** is the core interactive research and authoring environment of Scholar Agentic OS. Designed specifically for publication-grade journal manuscripts (`OT-10`), it organizes scholarly production into **5 distinct Research Phases** comprising **25 sequential, grounded stages**.

```
PHASE I: CONCEPTUALIZATION & GAP DEFINITION (Stages 1–6)
  [1. Definition] ──▶ [2. Literature] ──▶ [3. Gap ID] ──▶ [4. Gap Select] ──▶ [5. Title Select] ──▶ [6. Title Lock 🔒]
                                                                                                            │
PHASE II: EVIDENCE EXTRACTION & REVIEW (Stages 7–14)                                                        │
  [7. Vault Sources] ──▶ [8. Vault Approval] ──▶ [9. Primary Data] ──▶ [10. Evidence Extraction]            │
                                                                                 │                          │
  [14. Dossier Review 🔒] ◀── [13. Evidence Analysis] ◀── [12. Ext Approval] ◀── [11. External Research] ◀───┘
          │
PHASE III: MANUSCRIPT DRAFTING (Stages 15–20)
  [15. Journal Discovery] ──▶ [16. Journal Req] ──▶ [17. Section Draft] ──▶ [18. Citation Audit]
                                                                                   │
  [20. Draft Preview & Phase Conclusion 🔒] ◀──────────────── [19. Originality Check] ◀┘
          │
PHASE IV: PEER REVIEW & REVISION (Stages 21–22)
  [21. 7-Lens Academic Critique] ──▶ [22. AI Patch & Diff Revision Workbench 🔒]
                                                    │
PHASE V: PUBLICATION & EXPORT (Stages 23–25)        │
  [23. Publication Markdown Studio] ◀───────────────┘
          │
          ▼
  [24. 6-Pillar Submission Compliance Gate]
          │
          ▼
  [25. Multi-Format Camera-Ready Export (PDF, LaTeX, Typst, Word)]
```

---

## 2. Core Architectural Invariants

Every stage component in `src/desk/workspace/stages/` strictly adheres to the following publication-grade invariants:

### 2.1 Deliberate Researcher Interaction (Zero Auto-Advancement)
- **Invariant:** Automated `setTimeout(..., 2500/3000/3500)` auto-advance timers are strictly forbidden.
- **Enforcement:** Advancement to the subsequent stage or phase requires a deliberate click on an explicit action dock button (e.g., `Proceed to Evidence (Phase II) →`, `Accept & Advance →`).
- **Rationale:** Prevents researchers from losing focus, overwriting unreviewed work, or being navigated away during deep reading or critique.

### 2.2 Standardized Grounding Foundation Ribbons
- **Invariant:** Each stage visually anchors itself to the project's upstream artifacts through a standardized top ribbon:
  - **Phase Badge:** Distinct color-coded badge identifying the active Phase (`Phase I: Conceptualization`, `Phase II: Evidence`, `Phase III: Drafting`, `Phase IV: Peer Review`, `Phase V: Publication`).
  - **Grounding Pillars:** Direct references to the locked Title, Target Journal, Selected Gap, Primary Evidence count, or Submission Compliance score.
  - **Contextual Transparency:** Ensures the researcher always knows what upstream evidentiary inputs are feeding the active AI synthesis step.

### 2.3 Resilient Offline Synthesis & Deterministic Fallbacks
- **Invariant:** If the server SSE stream or remote AI provider fails, drops, or times out, the workspace never crashes or halts.
- **Enforcement:** Each stage implements an intelligent, domain-aware offline fallback generator (e.g., seed claims, structured critique rubrics, template camera-ready files) paired with a persistent banner alerting the user that local synthesis was applied.

### 2.4 Persistent State Hydration
- **Invariant:** Stage outputs are written back to `project.answers` and indexed relational tables (`manuscript_draft`, `evidence_items`, `peer_critiques`, `publication_readiness`).
- **Resumption:** Reloading the page or switching tabs immediately rehydrates the full workspace state without data loss.

---

## 3. Comprehensive 25-Stage Specification

### Phase I: Conceptualization & Gap Definition (Stages 1–6)
Anchors research scope and locks down the academic inquiry before writing commences.

| Stage | Identifier | Component | Purpose & Grounding Artifacts |
|---|---|---|---|
| **1** | `definition` | `DefinitionStage.tsx` | Formulates initial research domain, subject focus, hypotheses, and core keywords. |
| **2** | `literature` | `LiteratureStage.tsx` | Automated discovery of seminal, baseline, and frontier academic literature from Crossref / Semantic Scholar. |
| **3** | `gap_identification` | `GapIdentificationStage.tsx` | Analyzes discovered literature to uncover method, domain, data, and theoretical gaps. |
| **4** | `gap_selection` | `GapSelectionStage.tsx` | Triages identified gaps; researcher commits to the primary gap anchor for the paper. |
| **5** | `title_selection` | `TitleSelectionStage.tsx` | AI synthesizes candidate academic titles categorized by style (declarative, interrogative, compound). |
| **6** | `title_lock` | `TitleLockStage.tsx` | **Phase I Gateway:** Locks the working title into immutable project state, establishing the foundational grounding for all subsequent phases. |

### Phase II: Evidence Extraction & Review (Stages 7–14)
Ingests, approves, extracts, and validates all empirical or theoretical sources into an evidentiary dossier.

| Stage | Identifier | Component | Purpose & Grounding Artifacts |
|---|---|---|---|
| **7** | `vault_sources` | `VaultSourcesStage.tsx` | Ingests foundational papers and documents from the user's persistent Knowledge Vault. |
| **8** | `source_approval_vault` | `SourceApprovalStage.tsx` | Human triage gate for Vault sources: accept, flag, or exclude candidate references. |
| **9** | `additional_data` | `AdditionalDataStage.tsx` | Uploads and registers primary datasets, CSVs, supplementary methodologies, or code repositories. |
| **10** | `evidence_extraction` | `EvidenceExtractionStage.tsx` | LLM-driven structured extraction of quantitative metrics, experimental findings, and claims. |
| **11** | `external_research` | `ExternalResearchStage.tsx` | Targeted external literature search to discover missing evidence or counter-theses. |
| **12** | `source_approval_external` | `SourceApprovalStage.tsx` | Human approval gate for external sources discovered in Stage 11. |
| **13** | `evidence_analysis` | `EvidenceAnalysisStage.tsx` | Synthesizes claims matrix, method credibility scores, and evidentiary consensus. |
| **14** | `manual_review` | `ManualReviewStage.tsx` | **Phase II Gateway:** Comprehensive 4-pillar evidentiary dossier sign-off (Vault, Datasets, Syntheses, Exclusions) certifying data readiness for drafting. |

### Phase III: Manuscript Drafting (Stages 15–20)
Translates verified evidence into a target-journal-compliant complete manuscript draft.

| Stage | Identifier | Component | Purpose & Grounding Artifacts |
|---|---|---|---|
| **15** | `journal_discovery` | `JournalDiscoveryStage.tsx` | Recommends high-impact journals matched to domain, scope, impact factor, and review latency. |
| **16** | `journal_requirements` | `JournalRequirementsStage.tsx` | Extracts and locks venue submission requirements (word counts, citation styles, section structures). |
| **17** | `draft` | `DraftStage.tsx` | Section-by-section drafting workbench (Abstract, Intro, Methods, Results, Discussion, Conclusion). |
| **18** | `citation_audit` | `CitationAuditStage.tsx` | Deep citation provenance audit, checking DOI resolution, bibtex integrity, and claim backing. |
| **19** | `originality_check` | `OriginalityCheckStage.tsx` | Similarity and originality inspection matrix, highlighting potential redundancy or common phraseology. |
| **20** | `draft_preview` | `DraftPreviewStage.tsx` | **Phase III Gateway:** Assembled full-manuscript preview with live word counters, section navigation, and formal advancement to Peer Review. |

### Phase IV: Peer Review & AI Revision (Stages 21–22)
Simulates academic peer review critiques and provides a diff-driven revision workbench.

| Stage | Identifier | Component | Purpose & Grounding Artifacts |
|---|---|---|---|
| **21** | `peer_review` | `PeerReviewStage.tsx` | 7-Lens Academic Critique Matrix (Methodology, Novelty, Structure, Evidence, Clarity, Impact, Ethics), with issue triage, waiver flags, and rebuttal notes. |
| **22** | `revision` | `RevisionStage.tsx` | **Phase IV Gateway:** Automated critique-to-section patch generator, side-by-side Before/After diff viewer, inline editor, and updated draft compiler. |

### Phase V: Publication & Camera-Ready Export (Stages 23–25)
Final editorial polish, submission compliance verification, and multi-format publication packaging.

| Stage | Identifier | Component | Purpose & Grounding Artifacts |
|---|---|---|---|
| **23** | `final_editor` | `FinalEditorStage.tsx` | Full-screen Publication Markdown Studio with academic toolbar (equations, tables, callouts, bold, italic), live stats HUD, and split-pane typeset preview. |
| **24** | `publication_readiness` | `PublicationReadinessStage.tsx` | Pre-flight submission gate verifying 6 compliance pillars (Word Counts, Citation Provenance, Section Hierarchy, Data Integrity, Visual Assets, Metadata). |
| **25** | `export` | `ExportStage.tsx` | **Phase V Grand Finale:** Multi-format camera-ready download engine (PDF, LaTeX Bundle, Typst, Word DOCX), 6 journal template presets (Nature, IEEE, ACM, APA 7, Typst, Elsevier), publication dossier zip, and project completion finalizer. |

---

## 4. Verification & Testing Standards

All workspace stages are tested via Vitest and React Testing Library in `src/desk/workspace/__tests__/`:

1. **Test Suite Index:**
   - `definitionStage.test.tsx` (Stage 1)
   - `literatureStage.test.tsx` (Stage 2)
   - `gapIdentificationStage.test.tsx` (Stage 3)
   - `gapSelectionStage.test.tsx` (Stage 4)
   - `titleSelectionStage.test.tsx` (Stage 5)
   - `titleLockStage.test.tsx` & `titleLockAndNavigation.test.tsx` (Stage 6)
   - `vaultSourcesStage.test.tsx` (Stage 7)
   - `sourceApprovalStage.test.tsx` (Stages 8 & 12)
   - `additionalDataStage.test.tsx` (Stage 9)
   - `evidenceExtractionStage.test.tsx` (Stage 10)
   - `externalResearchStage.test.tsx` (Stage 11)
   - `evidenceAnalysisStage.test.tsx` (Stage 13)
   - `manualReviewStage.test.tsx` (Stage 14)
   - `journalDiscoveryStage.test.tsx` (Stage 15)
   - `journalRequirementsStage.test.tsx` (Stage 16)
   - `draftStage.test.tsx` (Stage 17)
   - `citationAuditStage.test.tsx` (Stage 18)
   - `originalityCheckStage.test.tsx` (Stage 19)
   - `draftPreviewStage.test.tsx` (Stage 20)
   - `peerReviewStage.test.tsx` (Stage 21)
   - `revisionStage.test.tsx` (Stage 22)
   - `finalEditorStage.test.tsx` (Stage 23)
   - `publicationReadinessStage.test.tsx` (Stage 24)
   - `exportStage.test.tsx` (Stage 25)
   - `workflowTaxonomy.test.ts` (Universal stage taxonomy and routing invariants)

2. **Execution Commands:**
   ```bash
   # Run all workspace test suites
   npx vitest run src/desk/workspace/__tests__/

   # Run type check and design system contrast linting
   npm run lint
   ```
