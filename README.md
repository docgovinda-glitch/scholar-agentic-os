# Scholar Core — The Agentic Scientific Operating System

**Scholar Core** is an enterprise-grade academic research, thinking, writing, and verification operating system. Built for researchers, postgraduates, and undergraduate scholars, it replaces generic AI text generation with deterministic evidence ledgers, adversarial multi-agent peer review, and human-centered academic workspaces.

---

## 🏛️ Dedicated Academic Workspaces

Rather than generic forms, each academic format in Scholar Core operates through its own purpose-built workspace tailored to the exact cognitive process of researchers. The primary UI highlights four curated formats, with deep long-form milestone architectures preserved in the underlying codebase:

1. **📝 Coursework & Essay Engine (`OT-01`)** — **v4.1 — 4-Phase Architecture**:
   - **4-Phase Lifecycle** (supersedes the legacy 8-stage flow):
     1. **Phase 1 · Understand**:
        - **Decluttered Dual-Tab Intake**: Seamlessly switch between `[ Paste Prompt ]` and `[ Upload Brief Document (.pdf, .docx) ]`.
        - **Compact Calibration Controls**: Unified single-row selectors for Academic Level (Undergraduate / Postgraduate), Assignment Type, and Citation Style.
        - **Dynamic Word Budget Planner (`+ Add Section`)**: Standard 10% Intro / 80% Body / 10% Conclusion baseline allocation, direct word count editing per section, auto-balancing, and interactive custom section adder (`+ Add Section`) with editable titles, live validation badge (`Allocated: X / Y words`), and delete actions.
        - **Academic Writing Tone & Style Selector**: 4 curated presets (*Scholarly & Rigorous*, *Critical & Evaluative*, *Objective & Analytical*, *Applied & Reflective*) plus *"Match My Writing Style"* (sample paste / document upload with automated vocabulary & sentence pacing analysis), persisted into `state.brief.writingTone` for Phase 3 voice matching.
        - **Collapsible Course Metadata & Rubric**: Optional module code, university, deadline, and weighted rubric indexing neatly tucked into an accordion.
     2. **Phase 2 · Sources**: Question-led, evidence-oriented, discipline-aware & recency-first literature discovery engine (`deconstructAssignmentQuestion`), assigning each source an explicit `roleInAssignment` (Empirical evidence, Theoretical framework, Comparative evidence, Core theory) and `relevanceCategory` (Very High, High, Moderate), 2026/2025 recency prioritization with seminal core theory anchors, interactive matrix table view (`CuratedSourceTableView.tsx`), lecture/slide upload dropzone with background chunking, evidence approval ledger. (See [`docs/PHASE_02_QUESTION_LED_LITERATURE_DISCOVERY.md`](docs/PHASE_02_QUESTION_LED_LITERATURE_DISCOVERY.md)).
     3. **Phase 3 · Drafting**: Invisible chunker engine (`decomposeWordBudget`) for sub-section scaffolding, PEEL synthesis, live section index with per-section word trackers.
     4. **Phase 4 · Submission**: 10-point rubric compliance evaluator, citation reconciliation auditor (100% in-text → bibliography verification), one-click `.docx` and PDF export with title page, running headers, and formatted bibliography.
   - **Stage-Scoped Copilot Personas** (via `ContextPanel.tsx` → `/api/projects/:id/assignment/copilot-chat`):
     - Phase 1 → **Advisor** (official Scholar Core logo branding, refined quick actions for prompt command verbs, writing tone recommendations, and rubric criteria detection)
     - Phase 2 → **Librarian** (source curation & citation strategy)
     - Phase 3 → **Scribe** (drafting guidance & PEEL structure)
     - Phase 4 → **Examiner** (rubric scoring & citation audit)
   - **Database**: `public.assignment_projects` JSONB table (migration `20260927183000_assignment_projects_schema.sql`) stores full 4-phase state (`brief`, `sources`, `drafting`, `submission`) linked to `public.projects` via `project_id`.
   - **Test Coverage**: 18 test suites (144 unit and integration tests passing, 0 TypeScript errors) including `Phase2QuestionLedLiteratureDiscovery.test.tsx` and `AssignmentE2EFlow.test.tsx` (Phase 1→4 traversal + DOCX export verification).

2. **📄 Journal Article Workspace (`OT-10`)**:
   - **25-Stage Empirical Pipeline**: *Topic Selection → Literature Matrix → Claim-Evidence Graph → Methodological Framing → Empirical Generation → Double-Blind Adversarial Peer Review*.
   - Includes 5 specialized reviewer lenses (Methodologist, Domain Specialist, Biostatistician, Synthesizer, Formal Editor).

3. **💡 Research Proposal Workspace (`OT-19`)**:
   - **Competitive Grant Pipeline**: *Funding Agency Rubric Alignment → 1-Page Specific Aims → Significance & Innovation → Research Strategy & Pitfalls → Timeline & Gantt Work Packages → Budget Justification*.
   - Includes a **Study Section Review Simulator (NIH / NSF Scoring Criteria)**.

4. **📊 Academic Presentation Workspace (`OT-22`)**:
   - **Visual Narrative & Defense Studio**: *Timing & Constraint Profiler (10m/20m/45m) → Narrative Arc & Hook → Slide Deck Architecture → Word-for-Word Speaker Scripts → Interactive 16:9 Slide Canvas → Marp/PPTX Export → Audience Q&A Anticipator*.

*(Underlying engine also preserves the **🎓 Thesis / Dissertation Workspace (`OT-09`)** with its multi-chapter milestone framework and 15-Question Viva Voce defense simulator).*

---

## 🔐 Source Library & Zero Document Storage Architecture

In compliance with **Revision 2 / Document 43 Rev 5**, Scholar Core operates under a strict **Zero Document Storage Policy**:
- **Zero Full-Text Retention**: Scholar Core does NOT store full proprietary PDFs, copyrighted manuscripts, or full paper texts on its servers.
- **Verifiable Citation & Metadata Pointers**: The Source Library retains only structured cryptographic metadata, canonical references, DOIs, URLs, and client-authorized cloud storage pointers.
- **Cloud Drives (Google Drive & Microsoft OneDrive)**:
  - **Google Drive**: Automatic metadata inference (Authors, Year, Publisher, Doc Type) and direct `↗ Open in Google Drive` navigation.
  - **Microsoft OneDrive & SharePoint**: Instant zero-setup share link ingestion (`https://1drv.ms/...`), institutional email workspace connect, and graceful Azure OAuth handling.
- **Project Selector & Thematic Taxonomy**:
  - **Ongoing Project Selector**: Interactive dropdown and quick-toggle pills (`listProjects()`) linking sources directly to project research workbenches for in-text citations (`(Author, Year)`) and references bibliography generation.
  - **Thematic Tags**: Cross-project conceptual and methodological taxonomy (`#mixed-methods`, `#climate-policy`) powering library-wide semantic search and AI literature review synthesis.
- **Literature Review Synthesis Matrix**: Automated comparative matrix extraction, continuous review narrative generation, and grounded multi-source analytical Q&A ("Ask Your Sources").
- **Reference Manager Integrations**:
  - **Zotero Web API**: Direct two-way sync for collections, tags, and DOI metadata.
  - **Mendeley & BibTeX**: Instant batch parsing of `.bib` records into structured Canonical References.
  - **DOI & Web Scraping**: Live CrossRef / DataCite metadata lookup and client-side extraction.
- **Retraction Scanning**: Automated Crossref and OpenAlex retraction radar for flagging compromised citations in real time.
- **Comprehensive Guide**: See [`docs/KNOWLEDGE_VAULT_AND_CLOUD_DRIVE.md`](docs/KNOWLEDGE_VAULT_AND_CLOUD_DRIVE.md) for full configuration and workflow details.

---

## 🧠 Resilient AI Infrastructure & Multi-Provider Engine

Scholar Core eliminates fragile hardcoded model lists in favor of an enterprise-grade, dynamic AI orchestration layer:
- **Dynamic Account-Level Discovery (`/models`)**: Live discovery of models actually accessible to the user's specific account (Groq, Gemini, OpenRouter, Anthropic, OpenAI) with zero hardcoded model lock-in.
- **Defensive Capability Normalization**: Derives context window, structured JSON, tool use, and vision strictly from provider metadata rather than fragile model-name heuristics.
- **Composite Routing & Dynamic In-Provider Failover**: Automatic in-provider failover (`${provider}::${model}`) upon 404 / retirement before crossing provider boundaries.
- **Provider Health State Machine & Session Blacklisting**: Model 404s blacklist only the broken model, keeping the provider healthy. Shared bounded exponential backoff for HTTP 429 rate limits prevents retry storms across concurrent agents.
- **Request-Scoped Execution & Active Model Badges**: Each agent run executes in an isolated scope with live UI status badges (`Primary Model`, `BACKUP ACTIVE`, `Exhausted`) preventing concurrent agent crosstalk.
- **Stage-Wide Transactional Retry**: Automatic checkpoint and resume semantics across Literature Discovery, Evidence Extraction, Draft Assembly, Peer Review, and Publication Readiness.
- **Proactive 8-Step Diagnostics Engine**: Integrated live health, DNS, credential format, discovery, model availability, probe generation, and structured output verification.
- **Zero Plaintext Secret Storage**: Web Crypto AES-GCM local encryption with blind 32-bit hash fingerprinting (`fp_...`) ensuring API keys never appear in storage, logs, telemetry, or diagnostic output.

---

## 🚀 Quick Start & Development

### Prerequisites
- Node.js 20+
- PostgreSQL or Supabase account

### Installation
```bash
npm install
```

### Environment Configuration
Create a `.env` file from `.env.example`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3000
```

### Running Locally
```bash
# Start Vite development server & Node backend
npm run dev
```

### Running Test Suites
```bash
# Run all Desk test suites
npx vitest run src/desk/

# Run 26 Journal Article Workspace test suites (176 tests)
npx vitest run src/desk/workspace/__tests__/

# Verify strict WCAG contrast and CSP security
npm run lint
```

### Production Build
```bash
# Build Vite frontend and bundled Node server
npm run build
```

---

## 🔬 5-Phase, 25-Stage Journal Article Workspace (`OT-10`)

Scholar Core structures peer-reviewed journal manuscript production into **5 distinct phases** across **25 sequential stages** (see [`docs/03-workflow/35-JOURNAL-ARTICLE-WORKSPACE-STAGES.md`](docs/03-workflow/35-JOURNAL-ARTICLE-WORKSPACE-STAGES.md)):

- **Phase I: Conceptualization & Gap Definition (Stages 1–6)**: Definition, literature discovery, gap identification, gap selection, working title selection, and immutable title lock.
- **Phase II: Evidence Extraction & Review (Stages 7–14)**: Primary vault sources, vault source approval, primary dataset ingestion, structured evidence extraction, external research, external approval, claims analysis, and 4-pillar evidentiary dossier review.
- **Phase III: Manuscript Drafting (Stages 15–20)**: Journal discovery, journal submission requirements, section-by-section drafting, citation provenance audit, originality check, and unified manuscript draft preview.
- **Phase IV: Peer Review (Stages 21–22)**: 7-Lens Academic Critique Matrix (Methodology, Novelty, Structure, Evidence, Clarity, Impact, Ethics) with triage/waiver workflow, and side-by-side Before/After diff patch revision studio.
- **Phase V: Publication (Stages 23–25)**: Publication Markdown Studio with academic toolbar and live preview, 6-pillar submission compliance gate, and multi-format camera-ready export (PDF, LaTeX, Typst, Word DOCX, dossier bundle).

### Core Workspace Invariants
- **Deliberate Researcher Action**: Zero artificial `setTimeout` auto-advances. All stage progressions require explicit researcher interaction in sticky action docks.
- **Grounding Foundation Ribbons**: Every stage displays standardized top ribbons showing active Phase Badges, locked titles, selected gaps, target journals, and evidence counters.
- **Resilient Offline Synthesis**: Intelligent local fallback engines ensure smooth, uninterrupted workflows even if remote AI streaming drops.

---

## 🖥️ Modern Dual-Pane AI Agent Workspace
Scholar Core implements a ChatGPT/Claude-style dual-pane layout for deep academic research and writing:
- **Left Navigation Pane (`<aside>`)**: 260px fixed width with `flex-shrink-0`, full-width `+ New Project` button, platform links (Knowledge Vault, Editorial Agents, AI Access), Settings, and anchored multi-account profile menu (`dropUp={true}`).
- **Desktop Collapsibility**: Toggle between full navigation and distraction-free reading mode (`w-0`) via the aside collapse button or top-left panel toggle icon.
- **Responsive Mobile Drawer**: Slide-over navigation with an interactive backdrop overlay (`fixed inset-0 z-40 bg-black/40`) for natural tap-to-dismiss.
- **Custom Agentic Scrollbars**: `.scholar-scrollbar` webkit styling with 6px track and subtle thumb mapped to `var(--theme-fg)/20`.
- **Pinterest-Inspired Destructive Interactions**: Standalone `#E60023` red text `Delete` buttons on project cards and confirmation modals with clear typography and zero distracting glyphs.
- **Declare It Once Account Model**: Streamlined 3-tab settings modal (Personal Info, Security, Subscription) with multi-account linking, profile switching, and sign-out consolidated exclusively into the profile menu popover. See [`docs/ACCOUNT_SETTINGS_AND_NAVIGATION.md`](docs/ACCOUNT_SETTINGS_AND_NAVIGATION.md).

---

## 📦 Database & Migrations

Database schema and security policies are managed via Supabase:
```bash
# Push migrations to the linked Supabase project (project ref: gfjhsijrwodjvkisouzw)
SUPABASE_ACCESS_TOKEN=<your-personal-access-token> npx supabase db push

# Or authenticate interactively via CLI
npx supabase login
npx supabase db push
```

---

## 🌓 Strict Day / Night Theming System
Scholar Core replaces muddy legacy themes with a high-contrast, toggleable Day/Night engine:
- **Night Mode (ChatGPT-Inspired True Dark)**:
  - Sidebar: Pure deep black (`#000000`) with subtle `1px` right border (`#262626`).
  - Canvas: Deep neutral gray (`#171717`) with elevated cards at (`#212121`).
  - Typography: Crisp white primary text (`#ECECEC`) and muted secondary text (`#9B9B9B`). Zero muddy navy or blue tints.
  - Buttons: Solid white pill buttons (`#FFFFFF`) with deep black text and active scaling micro-animations.
- **Day Mode (Sand & Snow Academic Aesthetic)**:
  - Canvas: Warm sand canvas (`#F7F5F0`).
  - Cards & Sidebar: Elevated pure white cards (`#FFFFFF`) with soft drop shadows (`--shadow-card`).
  - Typography: Deep charcoal primary text (`#111111`) and secondary text (`#666666`).
  - Buttons: Solid black pill buttons (`#000000`) with pure white text.
- **Theme Switcher**: An interactive Sun/Moon button anchored in the bottom of the Left Sidebar dynamically toggles `data-theme="light"` / `data-theme="dark"` and persists choices in `localStorage['scholar-theme']`.

---

## 🌀 Smooth Animated AI Logo & Brand Mark
Scholar Core features an animated "AI Breathing" brand mark tuned for smooth, fluid, organic motion:
- **Core Asset**: `cognitive_authority_veena_logo_v7b_colored_details.png` (4-armed spiraling knowledge motif with vibrant warm orange `#FF7A00` core and magenta `#E02875` details).
- **Continuous 360° Rotation**: Hardware-accelerated rotation over **4s** using buttery-smooth `linear` easing with zero stutter.
- **Gentle Breathing Pulse**: Enclosing flex container scales between `scale(1.0)` and `scale(1.08)` across a soothing **3s** `ease-in-out` cycle.
- **Dynamic Aura Glow**: Multi-layered ambient drop-shadow in warm orange and magenta hues that synchronously pulses with the core.
- **Accessibility & Motion Preference**: Automatically respects `prefers-reduced-motion: reduce` by halting transforms and filter animations.

---

## ⚡ Contextual Inline Action Loaders (Zero Viewport Lockouts)
Scholar Core adopts an Airbnb / Gemini-style localized loading architecture:
- **Zero Global Viewport Lockouts**: Network queries and Supabase mutations (`authedFetch`) bypass full-screen backdrops, keeping the entire application viewport interactive.
- **Button-Absorbed Loading States**: Action points (sign-in, registration, project creation, deletion confirmation, source quick-add, and vault imports) transition the active button into an inline spinner (`animate-spin` circle) with `aria-busy` and disabled states.
- **Non-Blocking Component Suspense**: Lazy-loaded route fallbacks render localized inline spinners (`role="status"`, `aria-live="polite"`) rather than blocking overlays.
- **Smooth Active Processing Transitions**:
  - `.ai-loader-spin`: 1.8s `linear`.
  - `.ai-loader-breathe`: 1.8s `ease-in-out`.
  - `.ai-loading-overlay`: 180ms unmount fade duration with `pointer-events: none`.



---

## 🎨 Design System & Typography

Scholar Core features a warm, modern, Airbnb-inspired design system with geometric sans-serif typography (`Plus Jakarta Sans` & `Manrope`), generous leading for academic long-form reading, sentence-case tags, and WCAG AA/AAA certified contrast (82/82 pairings passing).
- **Specification Document**: [`docs/AIRBNB_TYPOGRAPHY_DESIGN_SYSTEM.md`](docs/AIRBNB_TYPOGRAPHY_DESIGN_SYSTEM.md)

---

## 📄 License & Attribution
Scholar Core © 2026. All rights reserved.
