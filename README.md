# Scholar Core — The Agentic Scientific Operating System

**Scholar Core** is an enterprise-grade academic research, thinking, structured writing, and verification operating system. Built for researchers, postgraduates, and undergraduate scholars, it replaces generic AI text generation with deterministic evidence ledgers, adversarial multi-agent peer review, and human-centered academic workspaces.

---

## 🏛️ Dedicated Academic Workspaces

Rather than generic forms, each academic format in Scholar Core operates through its own purpose-built workspace tailored to the exact cognitive process of researchers:

1. **📝 Coursework & Essay Engine (`OT-01`)**:
   - **Dual Execution Modes (`Minimal | Detailed`)**:
     - **Minimal Mode**: Streamlined setup (Topic, Assignment Type, Word Count Target, Citation Style) with a clean distraction-free writing canvas; defers intermediate telemetry and drawers.
     - **Detailed Mode**: Full architectural controls (Academic Tone selector with auto-binding, custom rubric, database filters) + live 4-phase atomic lifecycle stepper, OpenAlex/Crossref citation badges, `<20%` inter-section overlap indicator, and expanded ML Style Compliance Audit panel.
   - **4-Phase Lifecycle (+ Submission)**, all derived from the student's own brief:
     - **Phase 01 · Extract**: paste or upload (`.pdf`, `.docx`, `.txt`, `.md`). **Save & Build** extracts, plans and opens Phase 02 populated. Word count ignores course codes (`QNT-4020` never reads as `4,020 words`).
     - **Phase 02 · Understand**: plain-English brief summary, one-line sub-question rows with the exact marks from the file and proportional word targets, grading criteria, and thesis selector.
     - **Phase 03 · Sources**: clean keyword queries built from the sub-questions across OpenAlex, Crossref and Semantic Scholar (plus DOAJ, DataCite, arXiv) with per-provider timeouts; references named in the brief are pinned first with a `Prescribed in Brief` badge.
     - **Phase 04 · Drafting**: 5–8 sections with marks-weighted budgets in clean multiples that sum exactly to the target; each section is drafted within ±10% of its budget and never ends mid-sentence; refinement tools appear only after text exists.
     - **Submission**: 10-point rubric compliance evaluator, citation reconciliation, and one-click `.docx` / PDF export.
   - **Stage-Scoped Copilot Personas** (`ContextPanel.tsx`): Advisor (Understand), Librarian (Sources), Scribe (Drafting), Examiner (Submission).

2. **📄 Journal Article Workspace (`OT-10`)**:
   - **5-Mode Studio & 25-Stage Empirical Pipeline**:
     - *Mode 1: Protocol Blueprint & Word Budgeter* → *Mode 2: Evidence Matrix & Primary Data Ingestion* → *Mode 3: Grounded Manuscript Studio* → *Mode 4: Unified Referee Rebuttal Workbench* → *Mode 5: Pre-Flight Compliance & Export Studio*.
   - **Q1 Journal Style Compliance Engine & NLI Citation Lock Scrubber**: Live manuscript style compliance scorecard based on the 110-paper corpus, paired with Natural Language Inference (NLI) claim-evidence entailment verification (`citationLockScrubber.ts`) and hybrid Semantic RAG (`semanticRagEngine.ts`).

3. **💡 Research Proposal Workspace (`OT-19`)**:
   - **Competitive Grant Pipeline**: *Funding Agency Alignment → 1-Page Specific Aims → Significance & Innovation → Research Strategy & Pitfalls → Timeline & Gantt Work Packages → Budget Justification*.
   - Includes a **Study Section Review Simulator (NIH / NSF Scoring Criteria)** powered by `scholarBrain.ts`.

4. **📊 Academic Presentation Studio (`OT-22`)**:
   - **4-Step Guided Workflow**: *01 Understand (topic or document → card outline) → 02 Design (8 curated themes previewed with your slides, library, screenshot cloner) → 03 Edit Slides (Gamma-style cards, inline editing, one-click layout and theme switching) → 04 Present (stage / leave-behind views, full-screen presenter)*.
   - **Gamma-style cards**: bento grids, big-number callouts, timelines, comparisons, quotes and image + text layouts in a scientific monochrome look (`#F8F7F4` / `#171717`).
   - **Native PowerPoint export (`.pptx`)** that matches the on-screen slides, plus PDF, Markdown and JSON. Generated decks only use figures found in your own material. See [`docs/presentation-studio.md`](docs/presentation-studio.md).

5. **🎓 Thesis & Dissertation Workspace (`OT-09` / `OT-07`)**:
   - Multi-chapter milestone tracker with sequential chapter readiness gating, literature synthesis matrix, and 15-question Viva Voce oral defense simulator.

6. **💬 Full-Screen Conversational Ask Scholar (`/projects`)**:
   - Immersive dashboard research chat that collapses template starter cards upon interaction, creating an expansive full-screen canvas with citation grounding and direct project initiation.

7. **♿ 100/100 Lighthouse Accessibility & Non-Blocking UX (`FeedbackSystem.tsx`, `AriaLiveAnnouncer.tsx`)**:
   - Accessible toast/modal feedback system (zero native browser popups), WCAG screen-reader live regions, persistent autosave badges (`WorkspaceAutosaveBadge.tsx`), unsaved-changes guards (`useUnsavedChangesGuard.ts`), and Laptop Focus Mode.

---

## 🧠 Supervised ML Style Engine (110-Paper Open-Access Corpus)

Scholar Core includes a dedicated Supervised Machine Learning Style Engine (`ml-style-engine/`):
- **110-Paper Verified Corpus**: 10 full-text peer-reviewed open-access papers per archetype across 11 scholarly classes (`essay`, `literature_review`, `research_paper`, `case_study`, `report`, `critical_essay`, `argumentative_essay`, `policy_analysis`, `business_assignment`, `journal_article`, `presentation_slides`), totaling **752,811 verified words** with 0 duplicate PMCIDs and 0 duplicate hashes.
- **High-Precision ML Classifier**: Calibrated LinearSVC achieves **93.97% 5-Fold Stratified Cross-Validation Accuracy & Macro F1** (exceeding the 85% qualification gate).
- **Zero-Latency In-Memory Inference**: Model weights exported to JSON (`archetype_model_weights.json`) for deterministic client-side TF-IDF dot-product scoring and quantitative style auditing in TypeScript without network overhead.


---

## 🔐 Source Library & Zero Document Storage Architecture

Scholar Core operates under a strict **Zero Document Storage Policy**:
- **Zero Full-Text Retention**: Scholar Core does NOT store full proprietary PDFs, copyrighted manuscripts, or full paper texts on its servers.
- **Verifiable Citation & Metadata Pointers**: Retains only structured bibliographic metadata, canonical references, DOIs, URLs, and client-authorized cloud storage pointers.
- **Cloud Drives (Google Drive & Microsoft OneDrive)**:
  - **Google Drive**: Automatic metadata extraction and direct `↗ Open in Google Drive` navigation.
  - **Microsoft OneDrive & SharePoint**: Instant share link ingestion (`https://1drv.ms/...`), institutional email workspace connect, and Azure OAuth handling.
- **Reference Management**: Direct DOI lookup via Crossref/OpenAlex, plus BibTeX (`.bib`) and RIS (`.ris`) import.

---

## ⚡ Multi-Tier AI Gateway & BYOK Infrastructure

Scholar Core features a flexible, multi-tiered AI architecture configurable in `/ai-access`:
- **5 Operating Modes**: Smart Gateway, Bring Your Own Key (BYOK), Free Tier, Local AI (Ollama, LM Studio on `localhost`), and Offline Mode.
- **Provider Support**: OpenAI, Anthropic, Google Gemini, Groq, Mistral, Cohere, xAI, OpenRouter, and Together AI.
- **Automatic Failover**: Transparent fallback on HTTP 429 rate limits or provider outages with exponential quarantine recovery.

---

## 🚀 Quick Start

### Installation
```bash
# Clone repository
git clone https://github.com/docgovinda-glitch/scholar-agentic-os.git
cd scholar-agentic-os

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
```

### Run Locally
```bash
npm run dev
```
Access the application at `http://localhost:3000`.

### Run Verification & Tests
```bash
# Type checking
npm run typecheck

# Run tests (438 files, 4,070 tests)
npm test

# Linting & design checks
npm run lint

# Production build
npm run build
```

---

## 📚 Documentation Directory

Complete authoritative documentation is available in the [`/docs`](docs/README.md) directory:

- [**`docs/README.md`**](docs/README.md): Master documentation index.
- [**`docs/PRODUCT.md`**](docs/PRODUCT.md): Current product capabilities and user roles.
- [**`docs/UI-UX.md`**](docs/UI-UX.md): UI layout, component design, Day/Night theme, and interaction states.
- [**`docs/ARCHITECTURE.md`**](docs/ARCHITECTURE.md): Fullstack architecture, topology, and security model.
- [**`docs/WORKFLOWS.md`**](docs/WORKFLOWS.md): Step-by-step user journeys across all major features.
- [**`docs/AI-SYSTEM.md`**](docs/AI-SYSTEM.md): AI routing, failover, local runners, and prompt design.
- [**`docs/DATA-MODEL.md`**](docs/DATA-MODEL.md): Domain models, TypeScript interfaces, and PostgreSQL schemas.
- [**`docs/API.md`**](docs/API.md): Server endpoints, authentication, and request/response specifications.
- [**`docs/DEVELOPMENT.md`**](docs/DEVELOPMENT.md): Local development environment, commands, and standards.
- [**`docs/DEPLOYMENT.md`**](docs/DEPLOYMENT.md): Docker, Render, environment configuration, and Supabase setup.

## Single-Brain Architecture

`server/src/services/scholarBrain.ts` is the only AI brain for every workspace (`OT-01`, `OT-09`, `OT-10`, `OT-19`, `OT-22`). It is the only module allowed to import `server/utils/llm.ts`; all routes call its logged wrappers (`callOpenRouterJSON`, `callOpenRouterText`, `streamOpenRouterJSON`). No workspace may ship its own prompt engine, regex outline generator or subject-to-theory table, and the Quantum literature catalog and Zappos/Schein template are permanently banned. `src/__tests__/singleBrainGuardian.test.ts` enforces this in CI; see `CLAUDE.md` and `.claude/agents/single-brain-guardian.md`.
