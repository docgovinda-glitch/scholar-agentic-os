# Product Specification & Capabilities

This document specifies the current user-facing product, supported roles, active modules, and core capabilities of **Scholar Core**.

---

## 1. Product Overview

**Scholar Core** is an academic research, writing, and verification operating system. It provides specialized, format-tailored workspaces for academic writing rather than generic conversational chat or unconstrained text generation.

The platform guarantees academic integrity through:
- **Deterministic Evidence Ledgers**: Every claim drafted can be bound directly to empirical literature or lecture materials.
- **Dynamic Analytical Structuring**: Assignment outlines are generated analytically to fit the exact research question and prompt rather than forcing generic "Intro/Body/Conclusion" templates.
- **Strict Citation Reconciliation**: 100% of in-text citations are audited against the compiled bibliography before export.
- **Rubric Compliance Evaluation**: Multi-dimensional grading assessments scoring drafts against university or agency rubrics.
- **Zero Document Storage Policy**: The platform does not store proprietary PDFs or full copyright-protected manuscripts on its servers; it stores only canonical citation metadata and authorized cloud storage pointers.

---

## 2. Active User Roles

The platform currently models four distinct user roles, configurable during user onboarding and editable in Account Settings:

1. **Undergraduate Student**
   - Focus: Modular coursework assignments, essays, lab reports, case studies, lecture note synthesis, and APA/MLA/Harvard citation formatting.
2. **Postgraduate / Masters Student**
   - Focus: Extended essays, master's dissertations, empirical literature reviews, and research methodology framing.
3. **Doctoral Researcher (PhD / Postdoc)**
   - Focus: Journal manuscripts, multi-chapter doctoral dissertations, claim-evidence mapping, grant proposals, and adversarial peer review simulation.
4. **Academic Faculty / Principal Investigator (PI)**
   - Focus: Research grant proposals (NIH / NSF formats), peer review assessment, institutional compliance, and collaborative author management.

---

## 3. Dedicated Academic Workspaces

Scholar Core provides purpose-built workspaces tailored to specific deliverable types:

### 3.1 Coursework & Essay Engine (`OT-01`)
- **Status**: Production Active.
- **Target Deliverables**: Academic Essays, Module Coursework, Analytical Papers, Policy Briefs, Case Studies, Lab Reports.
- **Core Architecture**: 4-Phase Lifecycle:
  1. **Phase 1 · Understand & Structure**: Dual-tab brief intake (paste prompt or upload PDF/DOCX brief document), level and citation style calibration, dynamic analytical outline generation with custom word allocations (`DynamicStructurePlanner`), and voice/style selection (`WritingStyleSelector`).
  2. **Phase 2 · Sources & Discovery**: Question deconstruction, multi-angle scholarly discovery, lecture/slide dropzone with automatic chunking, relevance scoring, and approved evidence shelf.
  3. **Phase 3 · Drafting**: Subheading-by-subheading drafting alignment, live word count progress tracking against section budgets, citation insertion, and evidence passage binding.
  4. **Phase 4 · Submission**: 10-point rubric evaluator, citation audit reconciliation, and formatted `.docx` and PDF export.
- **Copilot Integration**: 4 stage-specific copilot personas (Advisor, Librarian, Scribe, Examiner).

### 3.2 Journal Article Workspace (`OT-10`)
- **Status**: Production Active.
- **Target Deliverables**: Peer-reviewed empirical articles, review articles, and journal manuscripts.
- **Core Architecture**: 25-Stage Empirical Pipeline organized into 5 logical phases:
  - *Phase I: Foundation* (Definition, Literature, Gap Identification, Gap Selection, Title Selection, Title Lock).
  - *Phase II: Evidence* (Vault Sources, Source Approval, Additional Data, Evidence Extraction, External Research, Analysis, Manual Review).
  - *Phase III: Drafting* (Journal Discovery, Requirements Lock, Section Drafting, Citation Audit, Originality Check, Preview).
  - *Phase IV: Review* (Double-Blind Peer Review Simulator, Revision Tracking, Formal Editing).
  - *Phase V: Publication* (Publication Readiness Assessment, Final Manuscript Export).
- **Adversarial Peer Review Simulator**: Evaluates manuscripts across 5 specialized referee perspectives: Methodologist, Domain Specialist, Biostatistician/Data Analyst, Synthesizer, and Formal Editor.

### 3.3 Thesis & Dissertation Workspace (`OT-09` / `OT-07`)
- **Status**: Production Active.
- **Target Deliverables**: Master’s Theses, Doctoral Dissertations, and multi-chapter monographs.
- **Core Architecture**: Multi-chapter milestone tracking, comprehensive literature matrix, chapter-by-chapter drafting, and a 15-question Viva Voce oral defense simulator.

### 3.4 Research Proposal Workspace (`OT-19`)
- **Status**: Production Active.
- **Target Deliverables**: Grant applications, dissertation proposals, and competitive research bids.
- **Core Architecture**: Step-by-step grant pipeline: Funding Agency Rubric Alignment → 1-Page Specific Aims → Significance & Innovation → Research Strategy & Pitfalls → Timeline & Gantt Work Packages → Budget Justification, complete with an NIH/NSF Study Section scoring simulator.

### 3.5 Academic Presentation Workspace (`OT-22`)
- **Status**: Production Active.
- **Target Deliverables**: Conference presentations, seminar slide decks, and dissertation defense slides.
- **Core Architecture**: Constraint-driven presentation studio: Timing Profiler (10m / 20m / 45m) → Narrative Arc & Hook → Slide Deck Architecture → Word-for-Word Speaker Scripts → 16:9 Canvas Preview → Slide Export.

---

## 4. Platform Modules & Utilities

### 4.1 Knowledge Vault (`/vault`)
- **Purpose**: Global, cross-project literature and source repository.
- **Zero Document Storage**: Retains only structured bibliographic metadata, DOIs, URLs, and client-authorized cloud storage pointers. Full proprietary manuscripts are never hosted.
- **Ingestion Channels**:
  - Direct DOI resolution via Crossref / OpenAlex.
  - Cloud Drive linking: Google Drive (metadata extraction and direct link navigation) and Microsoft OneDrive / SharePoint (`1drv.ms` shared links).
  - Reference file imports: `.bib` (BibTeX) and `.ris` files.
- **Project Binding**: Sources in the Vault can be linked to active projects for in-text citation and automatic bibliography generation.

### 4.2 AI Access Control (`/ai-access`)
- **Purpose**: Unified interface for AI configuration, BYOK API key management, local runner discovery, and model selection.
- **5 Operational Modes**:
  1. *Smart Gateway*: Automatic intelligent routing to the optimal available cloud model.
  2. *Bring Your Own Key (BYOK)*: Direct connection using user-provided API keys (OpenAI, Anthropic, Gemini, Groq, Mistral, Cohere, xAI, OpenRouter, Together AI).
  3. *Free Tier*: Access via built-in free-tier endpoints without requiring personal API keys.
  4. *Local AI*: Local model inference via Ollama, LM Studio, vLLM, or LocalAI on `localhost`.
  5. *Offline Mode*: Strict local-only execution without external network egress.
- **Provider Failover**: Automatic fallback to secondary and tertiary providers if rate limits (HTTP 429) or service outages occur.

### 4.3 Account Settings (`/settings`)
- **Purpose**: Personalization, appearance, security, and multi-account identity management.
- **Features**:
  - Multi-Account Registry: Add multiple scholar accounts and switch active profiles instantly.
  - Academic Profile: Name, Institution, Discipline, Degree Level, and Default Citation Style.
  - Appearance: Day/Night theme switcher (`dark` and `light` modes).
  - Security & Authentication: Password changes and session management.

### 4.4 Admin Infrastructure Panel (`/admin`)
- **Purpose**: Operational dashboard for monitoring system AI infrastructure.
- **Features**: Real-time provider connectivity tests, latency meters, error logs, and BYOK credential status checks.
