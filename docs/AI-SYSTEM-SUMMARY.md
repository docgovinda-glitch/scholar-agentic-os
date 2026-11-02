# Scholar OS — AI Architectural Summary & Curation Brief

> **Purpose for AI Agents & Models:**  
> This document is the single source of truth for the architecture, engineering state, subsystem maturity, and prompt engineering protocols of **Scholar OS (Scholar Core)**.  
> When ingesting this document, use it to calibrate your code suggestions, agent pipelines, prompt design, and debugging to the exact standards and patterns established in this codebase.

---

## 1. Executive System Overview

- **Repository**: `scholar-agentic-os`
- **Application Type**: Hybrid Fullstack Academic Research, Writing, and Verification OS.
- **Core Philosophy**: **Zero-Hallucination Academic Writing via Hybrid Agentic-Deterministic Architecture.**
  - LLMs are **never** permitted to format citations or invent bibliography data.
  - LLMs generate structured, evidence-anchored paragraphs constrained by word budgets.
  - Deterministic TypeScript algorithms handle bibliographic formatting, citation reconciliation, document parsing, and quality scoring.

### Technology Stack
- **Frontend**: React 19 (`react`), TypeScript 5.8 (Strict), Vite 6, TailwindCSS v4, TipTap 3, Motion 12, Lucide React.
- **Backend**: Node.js 20+ / Express 4, TypeScript (`tsx` in dev, `esbuild` to CommonJS in prod), Helmet 8 CSP, custom token-bucket rate limiter.
- **Database & Auth**: PostgreSQL 15+ via Supabase (Row Level Security enforced on all tables, GoTrue Auth, Storage bucket `project-files`).
- **AI Gateway**: Multi-tier client-routed gateway (`src/services/clientRouter.ts`):
  1. *Smart Gateway*: Managed cloud endpoints with automatic task-based model selection.
  2. *Bring Your Own Key (BYOK)*: OpenAI, Anthropic, Google Gemini, Groq, Mistral, Cohere, xAI, Together AI.
  3. *Free Tier*: Built-in standard endpoints.
  4. *Local AI*: Direct loopback inference to Ollama (`:11434`), LM Studio (`:1234`), vLLM (`:8000`), LocalAI (`:8080`).
  5. *Offline Mode*: Hard network egress lock; local-only execution.
  6. *Failover Engine* (`providerFailover.ts`): Automatic quarantining with exponential backoff on HTTP 429 or 5xx.

---

## 2. Product Matrix & Code Maturity Levels

The platform provides 5 primary deliverables. They differ significantly in implementation maturity:

| Product / Workspace | Identifier | Code Maturity Level | Architectural Pattern | Current State & Bottlenecks |
| :--- | :--- | :--- | :--- | :--- |
| **Coursework & Essays** | `OT-01` | **Tier 1: Production Masterpiece** (~500KB+ code) | 4-Phase Atomic Lifecycle (Understand → Sources → Drafting → Submission) | **Gold Standard**. Atomic section pacing, dynamic analytical outlines, live slide chunking, section uniqueness validator, 10-point rubric evaluator. |
| **Ask Scholar** | Global | **Tier 1: Production Masterpiece** | RAG + Real APIs + SSE Streaming + Regex Citation Interceptor | **Gold Standard**. Real OpenAlex/Crossref queries, real-time citation badge replacement, automatic bibliography compilation. |
| **Journal Articles** | `OT-10` | **Tier 2: Advanced Scaffold, Coarse AI** | 25-Stage Pipeline + 5 Adversarial Peer Review Referees | **Advanced Shell**. Massive 25-stage UI. However, backend drafting (`/draft` in `agentic.ts`) attempts a single-shot JSON dump of all sections at once. Literature discovery in `agentic.ts` simulates sources rather than live multi-API searching. |
| **Slides & Keynotes** | `OT-22` | **Tier 1: Production Masterpiece** | Canva & Gamma Multi-Layout Engine + Swiss Editorial Canvas + Theme Extractor | **Full Canva/Gamma Multi-Layout Architecture**. Dynamically synthesizes 5 authentic layout archetypes (01 Cover Hero, 02 Executive Synthesis 2-Column, 03 Signature 2D Framework, 04 Bento 3-Card KPI Stats, 05 Phased Roadmap) for any topic. Live presentation canvas (`SlideCanvas`), Step 03 Studio, and Step 04 Present render full visual components without falling back to flat text cards. |
| **Research Proposals** | `OT-19` | **Tier 3: UI Wireframe / Mock Prototype** | Step-by-Step Grant Workspace + Study Section Review Panel | **Mock Backend**. Frontend is cleanly designed (Aims, Significance, Budget), but backend routes (`server/routes/project/proposal.ts`) return hardcoded static JSON (e.g., fixed 1.8 NIH score). |
| **Theses & Dissertations** | `OT-09` / `OT-07` | **Tier 3: UI Wireframe / Mock Prototype** | Multi-Chapter Milestone Matrix + Viva Voce Defense Simulator | **Mock Backend**. Frontend exists (`ThesisWorkspace.tsx`), but Viva Voce simulator in `server/routes/project/thesis.ts` returns static examiner questions. |

---

## 3. The Citation & Referencing Engine (Why It Is So Refined)

The citation system is the core technical differentiator of Scholar OS. It is **deterministic, rule-based, and non-hallucinatory**.

### A. Algorithmic Citation Engine (`src/citation_compliance/`)
- Pure TypeScript implementations of official academic style manuals:
  - `APA7Formatter.ts`: Author-date rules, et al. logic, DOI links.
  - `MLA9Formatter.ts`: Works cited containers, core elements, author formatting.
  - `ChicagoNotesFormatter.ts` & `ChicagoFormatter.ts`: Full notes, short notes, author-date.
  - `HarvardFormatter.ts`: Classical Harvard author-date rules.
  - `IEEEFormatter.ts`: Bracketed numerical ordering, standard abbreviation.
  - `VancouverFormatter.ts`: Sequential numerical medical referencing.
- Governed by `CitationStyleRegistry` and `CitationFormatterFactory` in `src/citation_compliance/formattingEngine.ts`.

### B. The Token Interceptor Pattern (`scholarCitationEngine.ts` & `server/routes/project/assignment.ts`)
1. During generation (in both Ask Scholar and Coursework & Essays `OT-01`), the LLM is explicitly forbidden from generating raw citations or bibliography sections.
2. The LLM outputs simple numeric tokens: `[1]`, `[2]`, or evidence identifiers: `[ev-uuid]`.
3. The server and client interceptors (`replaceBracketTokensWithDeterministicCitations`, `scholarCitationEngine.ts`) catch these markers across drafting endpoints (`/draft-section`, `/stream-section`, and `/citations-ground`).
4. Tokens are deterministically replaced with `formatAskScholarInText(item, index, style)` (e.g. `(Vaswani, A. & Shazeer, N., 2017)` for APA7, `[1]` for IEEE, or `(Vaswani)` for MLA9).
5. At the bottom of the output, `compileDeterministicBibliographyMarkdown()` programmatically compiles the reference list without LLM hallucination.

### C. Unified Evidence & Discovery Pipeline (Ask Scholar + Coursework `OT-01`)
- **Backend Harvester**: `server/src/discovery/discovery.ts` queries live OpenAlex, Crossref, DOAJ, DataCite, and arXiv APIs in parallel with rate limiting and DOI deduplication.
- **Relational Persistence**: All discovered literature is upserted into Supabase `project_sources` with standard bibliographic columns (`project_id`, `source_id`, `title`, `authors`, `year`, `doi`, `venue`, `url`, `source_type`, `authority_tier`, `discovered_via`, `discovered_at`).
- **Coursework Routing**: `POST /api/projects/:id/assignment/research` executes live multi-portal discovery, stores references in Supabase, and updates `project.answers["discovered_sources"]` with graceful fallback for offline environments.
- **SSE Streaming Interceptor**: `POST /api/projects/:id/assignment/stream-section` pipes LLM text generation through `replaceBracketTokensWithDeterministicCitations` so streaming chunks and `fullText` events are 100% compliant with the project's selected citation style.

### D. Anti-Fluff & Academic Stylistic Directives (`academicWritingPrompts.ts`)
- **Banned Buzzwords**: Words like `"primary phenomenon"`, `"procedural objectivity"`, `"computational expediency"`, `"methodological contestation"`.
- **Banned Openings**: Openings like `"In today's modern society..."`, `"A critical point of departure lies in how..."`.
- **Active Voice**: Mandated ≥80% active voice. Nominalizations are converted (e.g., *"conducts an analysis of"* → *"analyzes"*).
- **Uniqueness Check**: `sectionDraftingEngine.ts` enforces that no two sections in a paper share >20% identical sentences.

### E. Coursework Dual-Mode Prompt Orchestrator (`AssignmentExtractStage.tsx`, `AssignmentUnderstandStage.tsx`, `CourseworkModeToggle.tsx`)
- **Stage 01 (`01 Extract`) & Stage 02 (`02 Understand`) Synchronization**:
  - **Unsquished Target Word Count**: Column layout widened to `lg:grid-cols-[1fr_1fr_1fr_1fr_1.35fr]` with `min-w-[115px] whitespace-nowrap` input pills, rendering `2,000 words` cleanly on one line between `−` and `+`.
  - **Automatic Tone Mapping**: Changing `AssignmentType` automatically maps and persists `writingTone` and `academicTone` (e.g. Essay → *Formal Academic*, Literature Review → *Critical*, Case Study → *Analytical*, Report → *Objective*).
  - **Persistent Header Toggle**: `CourseworkModeToggle.tsx` is permanently mounted in both Stage 01 and Stage 02 headers with descriptive subtitles:
    - *Minimal Mode*: Auto-Outline (4 steps: 01 Extract → 02 Sources → 03 Drafting → 04 Submission).
    - *Detailed Mode*: Custom Thesis & Roadmap (5 steps: 01 Extract → 02 Understand → 03 Sources → 04 Drafting → 05 Submission).

---

## 4. The 21 Virtual "Engineers" (Agents & Engines Map)

When designing or debugging new capabilities, understand which subsystem "engineer" owns the responsibility:

### 1. Foundation Infrastructure (4 Engines)
1. **AI Gateway Router** (`clientRouter.ts`): Resolves task capability requirements (`drafting`, `copilot`, `discovery`, `audit`) and routes to the best model.
2. **Failover & Quarantine Controller** (`providerFailover.ts`): Quarantines failing providers and automatically recovers.
3. **Hardware Profiler** (`hardwareProfiler.ts`): Probes RAM and GPU for safe local runner execution.
4. **Citation Compliance Engine** (`formattingEngine.ts`): The deterministic reference formatter.

### 2. Ask Scholar Subsystem (3 Engines)
5. **Scholarly Discovery Proxy** (`server/routes/search.ts`): Queries OpenAlex, Crossref, and Semantic Scholar.
6. **Citation Interceptor & Anchorer** (`scholarCitationEngine.ts`): Replaces numeric brackets with formatted citations.
7. **Real-time SSE Streaming Engine** (`server/routes/ai.ts`): Streams tokens with markdown and badge hydration.

### 3. Coursework & Essay Engine [OT-01] (9 Engines / Personas)
8. **Phase 1 Copilot · Advisor** (`ContextPanel.tsx`): Deconstructs assignment questions and command verbs.
9. **Phase 2 Copilot · Librarian** (`ContextPanel.tsx`): Evaluates bibliographic relevance and fills evidence gaps.
10. **Phase 3 Copilot · Scribe** (`ContextPanel.tsx`): Enforces PEEL paragraph structure and word counts.
11. **Phase 4 Copilot · Examiner** (`ContextPanel.tsx`): Grades draft against university grading rubrics.
12. **Invisible Chunker Service** (`invisibleChunkerService.ts`, 67KB): Parses lecture slides (PDF/PPTX/DOCX) into semantic evidence chunks.
13. **Scholarly Discovery Service** (`scholarlyDiscoveryService.ts`, 240KB): Generates multi-angle search queries and thematic matrices.
14. **Dynamic Outline Planner** (`outlineService.ts`, 165KB): Generates custom analytical outlines (bans generic Intro/Body/Conclusion).
15. **Section Drafting Engine** (`sectionDraftingEngine.ts`, 33KB): Section-by-section drafting with strict word budget and uniqueness validation.
16. **Submission Audit Service** (`submissionAuditService.ts`, 20KB): 10-point academic rubric audit before export.

### 4. Journal Article Workspace [OT-10] (5 Referee Personas)
17. **Methodologist Referee** (`server/routes/project/agentic.ts`): Validates sampling, experimental design, and threats to validity.
18. **Domain Specialist Referee**: Audits foundational literature coverage and novelty.
19. **Biostatistician Referee**: Evaluates statistical power, claims, and data interpretations.
20. **Synthesizer Referee**: Checks narrative arc and macro-level transition flow.
21. **Formal Editor Referee**: Enforces publication guidelines, academic tone, and citation compliance.

### 5. Slides & Keynotes Studio [OT-22] (4 Sub-Engines)
22. **Slide Deconstructor & Billboard Filter** (`slideGenerator.ts`): Enforces the 6x6 bullet rule and 3-second billboard filter (long prose moved to speaker notes).
23. **Semantic Headline Transformer** (`semanticSlideExtractor.ts`): Turns passive labels ("Methodology") into active claims ("Triangulated Data Confirms 14% Drop").
24. **Swiss Editorial Canvas & Theme Engine** (`themeExtractorService.ts`, `deckRecreatorService.ts`): Extracts colors from HTML/images and renders typographic layouts.
25. **Creative Sketch Illustrator** (`SlideCreativeSketchIllustration.tsx`): Generates dynamic SVG editorial motifs and charts.

### 6. Proposals & Theses [OT-19 / OT-09] (2 Mock Engines)
26. **Study Section Scoring Panel** (`server/routes/project/proposal.ts`): NIH/NSF multi-reviewer criteria evaluation (currently mocked).
27. **Viva Voce Defense Simulator** (`server/routes/project/thesis.ts`): External examiner oral defense questions (currently mocked).

---

## 5. "One Brain vs. Split-Brain" Architecture Matrix

A verified audit of how user prompts are executed across the 5 primary deliverables:

| Touchpoint (Limb) | Mounted UI Workspace File | Orchestrator / Brain File | LLM API Caller Used | Literature Search Engine | Citation Engine | ML Style Engine | Brain Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Bottom Search Bar (`Ask Scholar`)** | `ProjectListScreen.tsx` | `agenticChatService.ts` + `/api/ai/agentic-query` | `executeAgenticLLM` / `executeAgenticQuery` | `liveSearchService.ts` (OpenAlex, Crossref, arXiv) | `citationExtractionService.ts` + `CitationStyleRegistry` | Dynamic system prompt injection | **`SHARED CORE BRAIN`** |
| **B. `Journal Article` (`OT-10`)** | `ResearchWorkspace.tsx` | `ResearchContext.tsx` + five views (`ProtocolBlueprintMode`, `EvidenceMatrixMode`, `ManuscriptStudioMode`, `RefereeRebuttalMode`, `AuditExportMode`) | `executeAgenticLLM` + `/api/projects/:id/draft` | `multiPortalLiteratureHarvester.ts` (5 portals) | `formattingEngine.ts` | `auditStyleCompliance` (`styleEngineService.ts`) | **`SHARED CORE BRAIN`** |
| **C. `Coursework & Essays` (`OT-01`)** | `AssignmentWorkspace.tsx` | `AssignmentContext.tsx` | Regex stubs for Phase 1/2; LLM stream in Phase 3 | `scholarlyDiscoveryService.ts` (Hardcoded catalogs e.g. UN Peace) | Regex validator (`citationValidationService.ts`) | Primitive enum (bypasses `styleEngineService`) | **`ISOLATED MINI-BRAIN & REGEX STUB`** |
| **D. `Research Proposal` (`OT-19`)** | `ProposalWorkspace.tsx` | `ProposalWorkspace.tsx` (Component-level state) | `/api/.../study-section-simulate` (falls back to heuristic) | None (No search engine wired) | None | `scholarlyVoiceGuard.ts` on server only | **`ISOLATED MINI-BRAIN`** |
| **E. `Slides & Keynotes` (`OT-22`)** | `PresentationWorkspace.tsx` | `slideGenerator.ts` + `presentationStateService.ts` | None in generation (`generateSlideDeck` is 100% sync client regex) | None | None | Static CSS theme presets (`SLIDE_THEMES`) | **`MOCK / REGEX STUB`** |

### Single Unified Brain Architecture Roadmap (`src/core/scholarBrain/`)
1. **Unify Brief Deconstruction**: Replace the 3,800-line regexes and 4-task cap in `outlineService.ts` with a central structured LLM agent (`brain.deconstructBrief`).
2. **Centralize Literature Harvesting**: Route all 5 workspaces through `multiPortalLiteratureHarvester.ts` + `liveSearchService.ts`.
3. **Deterministic Citation Enforcement**: Wire `src/citation_compliance/` across Coursework and Slides to guarantee zero-hallucination citations.

---

## 6. Engineering Guardrails for Future AI Collaborators

When prompted to build, modify, or extend Scholar OS, adhere to these non-negotiable rules:

1. **NEVER Ask an LLM to Format Raw Bibliographies**:
   Always pass raw metadata (`title`, `authors`, `year`, `doi`, `journal`) to `CitationStyleRegistry` or use the bracket token replacement pattern (`[1]`, `[ev-uuid]`).
2. **Never Generate Monolithic Drafts**:
   Follow the Coursework pattern: break writing into outline nodes → target word budget per section → approve evidence → draft individual section.
3. **Respect the Anti-Fluff System**:
   Keep system prompts synchronized with `academicWritingPrompts.ts`. Ban empty throat-clearing openings and pseudo-intellectual buzzwords.
4. **Preserve Deterministic Guarantees**:
   Do not replace deterministic code (chunkers, formatters, calculators) with LLM prompt approximations. Use LLMs for synthesis and reasoning; use TypeScript for rules, math, and compliance.
5. **Modern Frontend Aesthetics**:
   The frontend uses Tailwind CSS v4 with custom CSS variables defined in `src/index.css`. Maintain the Swiss minimalist, editorial typography, dark/light theme support, and non-blocking micro-animations.

---

## 7. System Remediation Execution Status (Steps 1–6 Completed)

All six phases of the foundational system remediation have been executed, verified, and committed:

1. **Step 1: Security & Cryptographic Integrity** (`de441cf`):
   - **Signed HTTP 426 Challenges**: Server issues HMAC-SHA256 tokens binding `userId`, `projectId`, `promptSha256`, and expiration; re-submitted `llmResult` is cryptographically validated before acceptance.
   - **Warden SystemPrompt Privacy Guard**: Egress privacy policy inspection extended to evaluate and redact `req.systemPrompt` alongside `req.userPrompt` and segments.
   - **Local JWT & LRU Auth Cache**: Two-tier fast-path with local HS256 JWT verification (<0.5ms) and bounded 60s LRU token cache to eliminate Supabase round-trip latency.
   - **Static Route Hardening**: Explicit route handlers for `/robots.txt`, `/llms.txt`, and `/ai-catalog.json` before SPA fallback.

2. **Step 2: Unified AI Pipeline & Resilient Parsing** (`9ef8bd4`):
   - **Shared `scholarBrain` Guardrails**: Client-side and server-side pipelines consolidated with unified anti-fluff rules, citation formatting, and voice verification.
   - **Resilient JSON Parser**: Extracts structured JSON from fenced blocks, trims commentary, auto-repairs trailing commas and truncated objects.
   - **Author-Date NLI Scrubber**: Validates in-text citations against bibliography entries to prevent citation hallucination.
   - **Model Capability Profiler**: Accurately maps token windows, reasoning models, and streaming support across Gemini, OpenAI, Anthropic, and local runners.

3. **Step 3: Hierarchical Semantic RAG & Streaming Engine** (`a1abb27`):
   - **Hierarchical Chunking**: Chunks documents with hierarchical heading paths (`# Chapter > ## Section`) for context-preserving retrieval.
   - **Hybrid Reranker**: Combines BM25 lexical matching with cosine semantic similarity and recency weighting.
   - **End-to-End SSE Streaming**: Integrated real-time token streaming with live citation bracket replacement and deterministic bibliography compilation.

4. **Step 4: State Architecture & Ephemeral Persistence** (`a1abb27`):
   - **Typed Zod Project State Accessor**: Runtime schema validation via `projectStateSchema.ts`.
   - **Transactional Ephemeral Migration**: Seamless transition from guest/ephemeral state to Supabase database without data loss.
   - **Persistent Disk Store**: Local file-backed store (`.scholar_local_store.json`) for seamless offline operation and dev reliability.

5. **Step 5: Bundle Optimization & Modular Decomposition** (`a1abb27`):
   - **Dynamic Lazy Loading**: Heavy document parsing and export libraries (`docx`, `pdfmake`, `xlsx`, `pptxgenjs`) deferred until user action.
   - **God-File Modular Decomposition**: Decomposed monolithic files (`ProjectListScreen.tsx`, `api.ts`, `agentic.ts`) into clean, focused sub-modules.

6. **Step 6: Accessible Feedback, Responsive Ergonomics & A11y** (`4e22895`):
   - **Unified Feedback System**: `<ToastProvider />` (`useToast()`) and `<ConfirmDialogProvider />` (`useConfirm()`) in `FeedbackSystem.tsx` with focus trapping and ARIA announcements; 0 native `alert()` or `window.confirm()` calls remaining.
   - **Mobile AI Tutor Drawer**: Slide-over drawer with backdrop (`data-testid="ai-tutor-backdrop"`) and close button on mobile viewports.
   - **Unsaved Work Guard**: `useUnsavedChangesGuard.ts` with `beforeunload` listener and in-app navigation gating wired into all 5 workspaces.
   - **Autosave Badge & 5-Stage Spine**: Standardized `<WorkspaceAutosaveBadge />` and harmonized stage subtitles (*Scope & Blueprint → Evidence & Sources → Studio Drafting → Review & Simulation → Audit & Export*).
   - **13" Laptop Focus Ergonomics**: 1-click Zen Mode toggle (`data-testid="zen-mode-toggle"`) and right rails capped at 288px to guarantee 680px–780px unobstructed central canvas.
   - **Knowledge Vault Literature Landing**: Direct landing on verified sources and primary datasets (`initialTab="sources"`).
   - **Screen-Reader Announcements**: Real-time `#scholar-aria-polite` and `#scholar-aria-assertive` updates for AI lifecycles and stage transitions.
   - **Mobile Touch Targets**: Scoped 44px min-targets in `src/index.css` with hit-slop pseudo-elements.

---

*Last Updated: 2026-10-28 | Status: Verified Against Active Codebase (Forensic Batches 1–4 & Remediation Steps 1–6 Complete)*
