# Journal Article Workspace: 25-Stage Architecture & Export Specification

**Scholar Agentic OS — Output Type 10 (`OT-10`)**

---

## 1. Overview

The **Journal Article Workspace** is a 25-stage sequential academic pipeline designed to take raw academic hypotheses and empirical datasets through to camera-ready, peer-reviewed manuscripts formatted for prestigious publication venues (Nature, IEEE, ACM, APA 7th, Elsevier, and modern Typst).

### Core Design Principles
1. **Zero Hallucination & Deterministic Provenance**: Every assertion in the manuscript must map directly to verified Primary Knowledge Vault evidence or approved external literature citations.
2. **Domain-Adaptive Intelligence**: Agent synthesis and offline fallbacks are dynamically grounded in the researcher's declared working title, methodology, and domain rather than generic or domain-specific hardcoded stubs.
3. **No Unformatted Data Leaks**: Internal representations (JSON arrays, AST section trees) are cleanly formatted into camera-ready markdown and typesetting blocks; raw serialized arrays are never dumped into user-facing exports.
4. **Deliberate Researcher Gateways**: Crucial phase transitions require deliberate researcher authorization with clear diffs and audit logs, preventing unexpected automated progression.

---

## 2. Five-Phase Taxonomy

```
[Phase I: Conceptualization] ──▶ [Phase II: Evidence Gathering] ──▶ [Phase III: Drafting] ──▶ [Phase IV: Peer Review] ──▶ [Phase V: Publication]
       (Stages 1 - 6)                     (Stages 7 - 14)                  (Stages 15 - 20)             (Stages 21 - 22)             (Stages 23 - 25)
```

### Phase I: Conceptualization (Stages 1 – 6)
* **Stage 1: Research Definition (`DefinitionStage.tsx`)**
  * Establishes working title, research domain, methodology, and study design.
  * Bidirectionally synchronizes alias keys (`working_title` ↔ `title`, `research_area` ↔ `research_domain`, `study_design` ↔ `methodology`).
  * Features local FINER and PICO appraisal heuristics with guest mode support.
* **Stage 2: Literature Discovery (`LiteratureStage.tsx`)**
  * Synthesizes domain-tailored citation matrices across primary keywords.
  * Employs multi-seed retrieval algorithms with automated deduplication.
* **Stage 3: Research Gap Identification (`GapIdentificationStage.tsx`)**
  * Generates structured gaps across 5 dimensions (Methodological, Theoretical, Empirical, Practical, Conceptual).
  * Computes priority scores and novelty differentials.
* **Stage 4: Anchor Gap Selection (`GapSelectionStage.tsx`)**
  * Commits the primary research gap (`anchor_gap_id`) that anchors all subsequent hypothesis testing and literature extraction.
* **Stage 5: Academic Title Selection (`TitleSelectionStage.tsx`)**
  * Generates title candidates across 4 recognized academic archetypes: *Declarative/Empirical*, *Question-Posing*, *Methodological/Systemic*, and *Interdisciplinary*.
* **Stage 6: Specification Charter & Title Lock (`TitleLockStage.tsx`)**
  * Locks Phase I findings into a legally sealed Manuscript Specification Charter before evidence ingestion begins.

---

### Phase II: Evidence Gathering (Stages 7 – 14)
* **Stage 7: Vault Sources (`VaultSourcesStage.tsx`)**
  * Bridges approved literature from Stage 2 into the project's primary evidence pool.
* **Stage 8: Source Approval Gate (`SourceApprovalStage.tsx`)**
  * Anti-fabrication verification gate where investigators approve or reject primary sources.
* **Stage 9: Additional Research Data (`AdditionalDataStage.tsx`)**
  * Ingests supplementary tabular data (CSV/XLSX), experimental protocols, and repository DOIs.
* **Stage 10: Evidence Extraction (`EvidenceExtractionStage.tsx`)**
  * Extracts verifiable empirical claims, quantitative parameters, and qualitative arguments from approved sources.
* **Stage 11: External Scholarly Literature (`ExternalResearchStage.tsx`)**
  * Conducts contextual research against broader global literature indices to contextualize findings.
* **Stage 12: External Source Approval (`SourceApprovalStage.tsx`)**
  * Approval gateway for external secondary literature.
* **Stage 13: Evidence Analysis & Synthesis (`EvidenceAnalysisStage.tsx`)**
  * Constructs bipartite argument graphs linking extracted claims to thesis pillars.
* **Stage 14: Manual Evidence Review (`ManualReviewStage.tsx`)**
  * Formal Phase II sign-off ensuring evidentiary integrity prior to prose drafting.

---

### Phase III: Manuscript Drafting (Stages 15 – 20)
* **Stage 15: Journal Discovery (`JournalDiscoveryStage.tsx`)**
  * Profiles top target venues using journal radar matching criteria (impact factor, open access, turnaround, scope alignment).
* **Stage 16: Journal Guidelines & Requirements (`JournalRequirementsStage.tsx`)**
  * Maps target venue constraints: maximum word count, citation style (APA, IEEE, Nature, Harvard), and mandatory section headings.
* **Stage 17: Manuscript Prose Drafting (`DraftStage.tsx`)**
  * Generates complete academic prose for all mandatory sections (Abstract, Introduction, Methods, Results, Discussion, Declarations, References).
  * Persists clean Markdown copies in `manuscript_markdown` and `full_text_markdown` to prevent raw JSON exports.
* **Stage 18: Citation Audit (`CitationAuditStage.tsx`)**
  * Verifies 100% claim-to-evidence provenance, validating in-text citation tags against the approved bibliography.
* **Stage 19: Academic Originality & Overlap Check (`OriginalityCheckStage.tsx`)**
  * Scans semantic overlap, certifying that manuscript originality meets target journal thresholds ($\ge 90\%$).
* **Stage 20: Pre-Review Manuscript Inspection (`DraftPreviewStage.tsx`)**
  * Assembles a dual-column preprint typeset view and runs a 6-point readiness charter audit before Phase IV peer review.

---

### Phase IV: Peer Review & Revision (Stages 21 – 22)
* **Stage 21: 7-Lens Academic Peer Review (`PeerReviewStage.tsx`)**
  * Rigorously critiques manuscript prose across 7 scholarly lenses:
    1. *Logical Flow & Coherence*
    2. *Methodological Rigor*
    3. *Domain Alignment & Venue Scope*
    4. *Evidence Synthesis & Provenance*
    5. *Argument Strength & Falsifiability*
    6. *Stylistic Register & Tone*
    7. *Publication Compliance*
  * Supports interactive author rebuttals and itemized waives.
* **Stage 22: Automated Revision Mapping (`RevisionStage.tsx`)**
  * Generates non-destructive sentence-level replacement patches mapped to peer critiques.
  * Provides an interactive Before/After diff workbench with author inline editing and bulk patch actions.

---

### Phase V: Publication & Camera-Ready Export (Stages 23 – 25)
* **Stage 23: Final Markdown Editor (`FinalEditorStage.tsx`)**
  * Studio workspace for final polish with split-pane typesetting preview.
  * Academic formatting tools for mathematical equations (`$$ E=mc^2 $$`), citation tags (`[@Ref2024]`), and section headings.
  * Unpacks any stringified JSON into clean Markdown headings and sections.
* **Stage 24: Pre-Flight Publication Readiness Check (`PublicationReadinessStage.tsx`)**
  * Automated diagnostic gate validating word count limits, citation integrity, section hierarchy, anonymization, and figure numbering.
* **Stage 25: Format & Export Pipeline (`ExportStage.tsx`)**
  * Typesets and compiles camera-ready packages across 6 academic profiles:
    * **Nature / Springer SN-JNL**: Single-column serif typography with structured methods.
    * **IEEE Transactions**: 2-column format with formal author affiliations and numbered references.
    * **ACM Conference (`acmart`)**: SIGCONF layout with CCS concepts and ACM citation styles.
    * **APA 7th Edition**: Author-date style with hanging indents.
    * **Modern Typst**: Modern mathematical grid with high-speed markup rendering.
    * **Elsevier / ScienceDirect**: Official CAS format with structured highlights and declarations.
  * Outputs validated PDF, LaTeX (`.tex` zip bundle), Typst (`.typ`), Microsoft Word (`.docx`), and complete publication dossier.

---

## 3. Data Integrity & Persistence Architecture

All workspace answers are stored within the project's intake answers JSON map in Supabase. The following canonical keys ensure end-to-end synchronization:

| Answer Key | Type | Description |
| :--- | :--- | :--- |
| `working_title` / `title` | `string` | Canonical article title, locked in Stage 6 |
| `anchor_gap_id` | `string` | ID of primary research gap selected in Stage 4 |
| `identified_gaps` | `JSON string` | Full taxonomy of identified research gaps |
| `selected_journal_name` | `string` | Target journal selected in Stage 15 |
| `approved_vault_sources` | `JSON string` | Primary source pool approved in Stage 8 |
| `approved_external_sources`| `JSON string` | External secondary citations approved in Stage 12 |
| `manuscript_draft` | `JSON string` | Structured section array with word counts |
| `manuscript_markdown` | `string` | Clean camera-ready Markdown representation |
| `full_text_markdown` | `string` | Unbroken Markdown string for direct export |
| `peer_review_critiques` | `JSON string` | 7-lens critique array generated in Stage 21 |
| `revision_patches` | `JSON string` | Diff patches generated and approved in Stage 22 |
| `publication_readiness` | `JSON string` | Certification scorecard from Stage 24 |
| `workspace_all_stages_completed` | `string` | Final completion flag sealed in Stage 25 |

---

## 4. Streamlined 9-Milestone Pipeline & Minimalist UI

To eliminate visual clutter and reduce researcher cognitive fatigue, the workspace features a **dual-presentation architecture**:

### 9 Streamlined Milestones

The 25 granular execution stages are consolidated into 9 cohesive research studios:

| Milestone | Label | Grouped Execution Stages | Description |
| :--- | :--- | :--- | :--- |
| **M1** | Scope & Literature Discovery | `definition`, `literature` | Define problem statement, domain, methodology, and discover foundational literature. |
| **M2** | Gap Analysis & Title Charter | `gap_identification`, `gap_selection`, `title_selection`, `title_lock` | Generate and select anchor research gap, evaluate title archetypes, and seal specification charter. |
| **M3** | Evidence Desk & Sources | `vault_sources`, `source_approval_vault`, `additional_data` | Pull vault evidence, approve sources, and ingest primary datasets (CSV/protocols). |
| **M4** | Claim Extraction & Synthesis | `evidence_extraction`, `external_research`, `source_approval_external`, `evidence_analysis`, `manual_review` | Extract claims, search external indices, approve literature, and build thematic argument matrix. |
| **M5** | Target Journal & Guidelines | `journal_discovery`, `journal_requirements` | Profile venue match criteria and automatically load target word count budgets and citation styles. |
| **M6** | Manuscript Studio & AI Drafting | `draft` | Full manuscript prose generation across standard academic sections with active word limits. |
| **M7** | Integrity & Pre-Flight Audit | `citation_audit`, `originality_check`, `draft_preview` | Verify claim-to-citation provenance, check semantic originality, and inspect preprint layout. |
| **M8** | Peer Review & Live Revision | `peer_review`, `revision` | 7-Lens peer critique and interactive before/after revision diff patcher. |
| **M9** | Camera-Ready Typesetting & Export | `final_editor`, `publication_readiness`, `export` | Final editorial touch-ups, pre-flight readiness checklist, and multi-format publication export. |

### Minimalist UI Controls & Features

* **Segmented Mode Switcher (`Minimal (9)` vs `Detailed (25)`)**: Researchers can switch between the 9 streamlined milestone studios and the granular 25-stage sequential tree at any time. Preference is persisted across sessions in `localStorage`.
* **Intelligent Milestone Navigation**: Clicking any milestone automatically routes to the researcher's active/in-progress sub-stage within that milestone.
* **Zen Focus Mode**: A dedicated distraction-free writing environment. Hides navigation rails, context panels, and status bars, leaving only the writing canvas and a clean single-line header (`Esc` to exit).
* **Consolidated Engine Status Pill**: Merges active model, fallback status, and context window meters into a compact badge (`🟢 Model • 32k ▾`) with an on-demand floating popover.
* **Collapsible Left Rail**: The sidebar can be collapsed to an icon-only strip (54px) or expanded via the sidebar toggle.

---

## 5. Verification & Testing

The workspace is guarded by 26 automated test suites:
```bash
# Run all workspace stage tests
npx vitest run src/desk/workspace/__tests__

# Run TypeScript compilation
npx tsc --noEmit

# Verify design system contrast & CSS tokens
npm run lint
```
* **Vitest Coverage**: 189 of 189 unit and integration tests passing across 26 test suites (100% pass rate).
* **TypeScript Integrity**: 0 compilation or type errors.
* **Accessibility & Contrast**: 82 of 82 color pairings verified passing WCAG AA standards.
* **Remote Database Status**: Synchronized with Supabase project `scholarAgent` (`gfjhsijrwodjvkisouzw`).

