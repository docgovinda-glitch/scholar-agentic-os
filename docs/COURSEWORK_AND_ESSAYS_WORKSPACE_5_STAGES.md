# Coursework & Essays Workspace: 5-Stage Architecture & Export Specification

**Scholar Agentic OS — Output Type 01 (`OT-01`)**

---

## 1. Overview & System Mission

The **Coursework & Essays Workspace (`OT-01`)** is an agentic, dialectical academic writing pipeline designed for undergraduate and postgraduate coursework, argumentative essays, and term papers. 

Re-architected directly from the proven 25-stage foundation of the **Journal Article (`OT-10`)** module, `OT-01` distills academic rigor into **5 Guided Stages** optimized for First-Class (70%+ / Grade A) coursework submissions.

---

## 2. Core Architectural Pillars

1. **Rubric Deconstruction & Command Verbs**:
   - Parses raw assignment briefs, distinguishing explicit sub-questions from implicit unstated examiner expectations.
   - Extracts command verbs (e.g., "Critically evaluate", "Synthesize", "Appraise") and sets concrete academic benchmarks.
   - Embeds four explicit Grade Band Descriptors (First Class, 2:1, 2:2, 3rd Class).

2. **Mathematical Word Budgeting**:
   - Implements strict academic section allocation: Introduction (~10%), Body Themes (~75–80%), Conclusion (~10–15%).
   - Live tolerance calculations ensure total section allocations conform to the declared word limit before drafting starts.

3. **Dialectical PEEL Argument Matrix**:
   - Replaces unstructured prose generation with a structured **P-E-E-L** scaffolding:
     - **P (Point)**: Topic claim directly advancing the thesis.
     - **E (Evidence)**: Empirical findings, data points, or literature citations.
     - **E (Explanation & Critical Evaluation)**: Analytical mechanisms, contextual nuances, and theoretical limitations.
     - **Counter-Argument & Rebuttal**: Dedicated dialectical challenge and rebuttal (the definitive differentiator of First-Class work).
     - **L (Link)**: Synthesis connecting the theme back to the overarching thesis.

4. **Peer-Reviewed Citation Grounding**:
   - Enforces 100% evidentiary attribution across the user's chosen standard: **APA 7th, Harvard, IEEE, MLA 9th, Chicago, or Vancouver**.
   - Generates dual outputs: formatted in-text citation keys and complete bibliographical entries.

5. **Submission Audit & Multi-Format Export**:
   - Runs a 10-point rubric compliance audit assessing question coverage, argumentation logic, evidence sufficiency, critical depth, and word adherence.
   - Offers instant, publication-ready downloads in **Microsoft Word (.docx)**, **High-Resolution PDF (.pdf)**, **LaTeX Source Bundle (.tex)**, and **Academic Markdown (.md)**.

---

## 3. Five-Stage Guided Workflow

```
[Stage 1: Deconstruction] ──▶ [Stage 2: Thesis & Budget] ──▶ [Stage 3: PEEL Matrix] ──▶ [Stage 4: Grounding] ──▶ [Stage 5: Audit & Export]
   Brief & Rubric Parser          Dialectical Thesis           P-E-E-L Dialectic Blocks       Peer-Reviewed Sources        10-Pt Rubric Check &
  Command Verbs & 1st Class      Mathematical 10/80/10          Counterarg & Rebuttals         APA / Harvard / IEEE         Docx / PDF Downloads
```

### Stage 1: Rubric & Brief Deconstruction (`AssignmentDeconstructStage.tsx`)
- **Intake Parameters**: Module name, question/prompt, academic level (undergraduate vs. postgraduate), target word count, citation standard, and deadline.
- **Brief Document Ingestion**: Upload `.pdf`, `.docx`, or `.txt` assignment specification sheets with automatic text extraction.
- **AI Deconstruction**: Invokes `/api/projects/:projectId/assignment/deconstruct` to extract:
  - Command verbs with academic expectations.
  - First-Class vs. 2:1 grade band descriptor criteria.
  - Explicit vs. implicit sub-questions.
  - Scope boundaries (mandatory inclusions vs. fatal out-of-scope traps).
- **Deferred Persistence Guarantee**: Triggering analysis commits any ephemeral draft project to the persistent database (`ensurePersisted()`).

### Stage 2: Thesis & Word Budgeting (`AssignmentThesisBudgetStage.tsx`)
- **Dialectical Thesis Formulation**: Invokes `/api/projects/:projectId/assignment/thesis-budget` to generate three distinct argumentative stances:
  - *Synthesis Stance*: Reconciles competing theoretical camps.
  - *Challenge Stance*: Interrogates standard assumptions with empirical counter-evidence.
  - *Empirical Stance*: Grounds conclusions in quantitative or qualitative case evidence.
- **Mathematical Word Allocation**:
  - Introduction: 10% (±2%)
  - Body Themes: 75–80% (distributed dynamically across user-defined themes)
  - Conclusion: 10–15%
- **Interactive Budget Health Bar**: Real-time validation badge indicating exact budget matches or warning if sections deviate from the target word count.

### Stage 3: Dialectical PEEL Argument Matrix (`AssignmentPeelMatrixStage.tsx`)
- **Interactive Scaffolding Cards**: Each body theme is edited through discrete Point, Evidence, Explanation, Counterargument, Rebuttal, and Link blocks.
- **AI Prose Synthesis**: Generates cohesive, scholarly paragraph drafts from the PEEL blocks on demand.
- **Dual View Modes**: Seamless toggle between structural PEEL block editing and continuous draft prose view.
- **Live Word Counter**: Tracks words across individual themes and the overall matrix in real time.

### Stage 4: Peer-Reviewed Citation & Academic Grounding (`AssignmentCitationGroundingStage.tsx`)
- **Scholarly Verification**: Connects claims to peer-reviewed sources and verified literature.
- **Citation Standard Selector**: Dynamically formats in-text citations and reference list entries in APA 7th, Harvard, IEEE, MLA 9th, Chicago, or Vancouver.
- **Quality Indicators**: Live tracking of total grounded sources and peer-reviewed percentage (targeting 100% for First-Class work).

### Stage 5: Rubric Compliance Audit & Document Export (`AssignmentAuditExportStage.tsx`)
- **Examiner-Grade 10-Point Audit**: Invokes `/api/projects/:projectId/assignment/audit-export` to benchmark the draft against marking criteria:
  - Estimated Grade Band badge (e.g. *First Class (1st) — 82%*).
  - Word count adherence verification (within ±10% margin).
  - Detailed criteria breakdown with awarded marks and actionable feedback.
  - Strengths and priority fixes.
- **Document Export**:
  - Microsoft Word (`.docx`) with student title block and running headers.
  - Camera-ready PDF (`.pdf`).
  - Overleaf-compatible LaTeX bundle (`.tex`).
  - Raw Academic Markdown (`.md`).

---

## 4. State & Database Integration

1. **PostgreSQL / Supabase Schema Parity**:
   - Stored in `public.projects` with `intake_answers` JSONB payload.
   - Follows identical serialization keys: `assignment_deconstruction`, `assignment_thesis_budget`, `assignment_peel_matrix`, `assignment_citations`, `assignment_audit_report`.
2. **Deferred Draft Pattern**:
   - When a user creates an `OT-01` project, it is initialized as an in-memory draft (`draft-ot-01-...`) in `ephemeralProjectStore.ts`.
   - The project is committed to Supabase only when the user triggers Stage 1 brief deconstruction via `ensurePersisted()`.
   - Prevents empty draft records in the database.
3. **Optimistic UI Updates & Cascade Deletions**:
   - Recent projects list updates optimistically.
   - Database foreign keys enforce `ON DELETE CASCADE` on all associated records.

---

## 5. Visual Elevation & Theming

- **Canvas Background**:
  - Light mode: `bg-[#F8F9FA]`
  - Dark mode: `bg-[#171717]`
- **Cards & Surfaces**:
  - Light mode: `bg-white border border-neutral-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.05)]`
  - Dark mode: `bg-[#1C1C1E] border border-white/10`
- **Rail & Socratic Drawer**:
  - Light mode: `bg-[#F4F4F5] border-r/l border-neutral-200/80`
  - Dark mode: `bg-[#1C1C1E] border-r/l border-white/10`
- **Typography & Word Counters**:
  - Tabular numeric formatting for real-time word budgeting (`current / target words`).
