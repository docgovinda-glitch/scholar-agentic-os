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
| **Slides & Keynotes** | `OT-22` | **Tier 2.5: Design-Rich, Heuristic Content** | Swiss Editorial Canvas + Pacing Service + Heuristic Extractor | **Visually Elite, Content Heuristic**. Stunning typography and SVG illustrations (`SlideCreativeSketchIllustration.tsx`), but text generator (`slideGenerator.ts`) relies on hardcoded topic templates (e.g. Zappos) and rigid word-chopping (`condenseToSixWords`) instead of deep semantic reasoning. |
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

### E. Coursework Dual-Mode Prompt Orchestrator (`courseworkOrchestrator.ts` & `CourseworkModeToggle.tsx`)
- **Minimal Mode (Guided Atomic Lifecycle)**: User manually advances through four distinct stages: `Understand` → `Sources` → `Drafting` → `Submission`. The AI strictly acts on the active phase, yielding control back to the UI after each milestone. Never drafts unapproved sections ahead.
- **Detailed Mode (Autonomous Deep Synthesis)**: Self-executes the complete end-to-end research and writing lifecycle given only the prompt and target constraints:
  1. Deconstructs prompt command verbs and analytical scope.
  2. Queries OpenAlex/Crossref thematic matrices and synthesizes evidence cards.
  3. Paces and drafts all sections sequentially, passing bracket tokens (`[1]`, `[ev-uuid]`) to the deterministic citation engine.
  4. Runs section uniqueness validation (>20% overlap rejection) with automated healing.
  5. Compiles deterministic bibliography and 10-point collegiate rubric assessment.
- **UI Mode Toggle**: `CourseworkModeToggle.tsx` provides minimal neutral Tailwind v4 styling (subtle zinc borders, zero pure black) directly within the Coursework setup view (`AssignmentUnderstandStage.tsx`).

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

## 5. Engineering Guardrails for Future AI Collaborators

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

*Last Updated: 2026-10-07 | Status: Verified Against Active Codebase*
