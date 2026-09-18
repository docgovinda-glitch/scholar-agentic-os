# Changelog

All notable changes to the Scholar Agentic OS project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-09-18

### Changed
- **Curated 4 Academic Workspace Cards & Responsive Alignment (`ProjectListScreen.tsx`)**:
  - **Removed Thesis / Dissertation from UI**: Cleanly removed `OT-09` from primary workspace format cards (`FORMAT_TILES`) and filter tabs, focusing on the 4 core formats: *Assignment*, *Journal Article*, *Research Proposal*, and *Presentation*. Full thesis workspace codebase (`ThesisWorkspace.tsx`), route handlers (`OT-09`/`OT-07`), and data models remain fully intact.
  - **Balanced Responsive Grid Alignment**: Replaced the previous 3-column breakpoint (`lg:grid-cols-3`) with a balanced 4-column responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5` with `h-full justify-between`). Renders a seamless 4-across layout on desktop, a clean 2×2 grid on tablets/medium displays, and 1 column on mobile with zero orphaned or empty slots.
- **Removed `/agents` UI & Redirected Route (`DeskApp.tsx`, `ProjectListScreen.tsx`)**:
  - Deprecated standalone `AgentsScreen.tsx` and removed the "Editorial Agents" link from the platform navigation sidebar and welcome banner.
  - Added clean client-side redirect routing `/agents` directly to `/projects`.

### Added
- **Workspace Dashboard Airbnb Typography & Input Grid Alignment Overhaul (`ProjectListScreen.tsx`)**:
  - **Punchy Airbnb Header Typography**: Decreased header size and increased weight for a confident, modern editorial tone: `text-3xl font-bold tracking-tight text-[var(--text-primary)]`.
  - **Grid-Aligned Prompt Bar**: Removed `max-w-3xl` restriction and applied `w-full`, forcing the prompt bar to stretch and align flush with the left and right boundaries of the template card grid. Upgraded text to `text-base font-medium text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]`.
  - **Airbnb Template Card Typography & Proportions**: Scaled card titles to punchier, tighter typography (`text-base font-semibold tracking-tight text-[var(--text-primary)] mb-1.5`) and descriptions to `text-sm font-normal text-[var(--text-secondary)] leading-snug`. Calibrated grid gutters to `gap-5` across both the dashboard and format selector (`grid w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5`).
  - **Active Projects Header & Search Alignment**: Standardized the section header to `text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-5` and refined search bar alignment.
- **Workspace Dashboard Master Alignment, Grid Un-squishing & Dark Mode Contrast Overhaul (`ProjectListScreen.tsx`, `index.css`)**:
  - **Master Container & Flush-Left Alignment**: Wrapped the Header, AI Prompt Bar, Template Cards, and Active Projects in a unified, left-aligned container (`max-w-6xl mx-auto w-full flex flex-col items-start text-left gap-10`), eliminating center-floating misalignment.
  - **Left-Aligned Header**: Streamlined the H1 inquiry (*"What would you like to write today?"*) to `text-4xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 text-left`.
  - **Dark Mode AI Prompt Bar**: Upgraded prompt bar input to support seamless dark theme transitions (`w-full max-w-3xl px-6 py-5 rounded-2xl bg-white dark:bg-[#171717] border border-gray-200 dark:border-neutral-800 shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-gray-100 dark:focus:ring-neutral-800 text-gray-700 dark:text-gray-200 text-lg placeholder-gray-400 dark:placeholder-gray-500`).
  - **Un-squished Responsive Grid**: Replaced the cramped 5-column layout with a spacious, responsive 4-column grid (`grid w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6`) across both the primary dashboard and `ChooseOutputType`.
  - **Dark Mode Card Aesthetics & Pure White Elimination**: Overhauled card backgrounds (`bg-white dark:bg-[#171717] border border-gray-100 dark:border-neutral-800 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-black/50 cursor-pointer`), badge containers (`bg-gray-50 dark:bg-neutral-800/80 text-gray-900 dark:text-gray-100`), titles (`text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 leading-tight`), and descriptions (`text-sm text-gray-500 dark:text-gray-400 leading-relaxed`) with zero unwanted truncation or hyphenation.
  - **Active Projects Flush-Left Alignment & Dark Search Bar**: Aligned Active Projects header flush-left and upgraded the search bar to support dark mode (`w-full !rounded-full !border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#171717] pl-10 pr-9 py-2.5 text-xs font-normal text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500`).
  - **Tailwind v4 Dark Mode Synchronization**: Declared `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *, .dark, .dark *));` in `src/index.css` and coupled `document.documentElement.classList.toggle('dark', ...)` with `data-theme` updates for instantaneous, glitch-free theme transitions.
- **Workspace Dashboard Apple-Inspired Aesthetic Overhaul (`ProjectListScreen.tsx`)**:
  - **Conversational Header**: Replaced repetitive "Scholar Workspace" header and tag clutter with the warm, human inquiry: *"What would you like to write today?"*.
  - **Global Clutter Removal**: Removed technical breadcrumbs, redundant pill badges (`Scholar Workspace` / `Command Center`), and subtitle jargon mentioning "initialize" across all dashboard components (including `ChooseOutputType`), as well as all secondary `+ New Project` buttons in the canvas and header areas to keep project initialization strictly centralized in the primary sidebar.
  - **Full-Width AI Prompt Bar**: Inserted a distraction-free, tactile input bar (`w-full max-w-3xl px-6 py-4 mb-8 rounded-full bg-white border border-gray-200 shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-gray-100 text-gray-700 text-lg`) directly beneath the header.
  - **Apple-Style Tactile Template Cards**: Standardized template cards across the dashboard and chooser into continuous-geometry interactive tiles (`rounded-2xl border border-gray-100 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-200/50 cursor-pointer p-6 flex flex-col gap-2`).
  - **Complete De-cluttering**: Completely purged all technical serial codes ("OT-01", "OT-10", "OT-22"), green "Ready to boot" status indicators, and separated footer action links, displaying strictly the format icon, title, and description.
- **25-Stage Publication-Grade Journal Article Workspace (`OT-10`)**:
  - **Phase I: Conceptualization & Gap Definition (Stages 1–6)**: Overhauled `definition`, `literature`, `gap_identification`, `gap_selection`, `title_selection`, and `title_lock` with research domain grounding, candidate gap matrices, title taxonomies, and immutable project title locking.
  - **Phase II: Evidence Extraction & Review (Stages 7–14)**: Built evidentiary pipeline across `vault_sources`, `source_approval_vault`, `additional_data`, `evidence_extraction`, `external_research`, `source_approval_external`, `evidence_analysis`, and `manual_review` 4-pillar dossier sign-off.
  - **Phase III: Manuscript Drafting (Stages 15–20)**: Implemented venue matching and requirements extraction in `journal_discovery` and `journal_requirements`, section-by-section draft generation in `draft`, provenance checks in `citation_audit`, originality analysis in `originality_check`, and unified manuscript assembly in `draft_preview`.
  - **Phase IV: Peer Review (Stages 21–22)**: Designed the 7-Lens Academic Critique Matrix (`peer_review`) covering Methodology, Novelty, Structure, Evidence, Clarity, Impact, and Ethics with waiver/triage actions, and side-by-side Before/After diff patch revision studio (`revision`).
  - **Phase V: Publication & Camera-Ready Export (Stages 23–25)**: Created the full-featured Publication Markdown Studio (`final_editor`) with formatting toolbar and split preview, pre-flight 6-pillar submission compliance gate (`publication_readiness`), and multi-format camera-ready export engine (`export`) supporting PDF, LaTeX bundle, Typst, Word DOCX, and publication dossier zip.
- **Deliberate Advancement Invariant**: Eliminated all artificial `setTimeout` auto-advances across all 25 stages, ensuring transitions occur strictly through intentional researcher interaction in sticky action docks.
- **Grounding Foundation Ribbons**: Standardized top ribbons across every stage connecting active UI synthesis to upstream anchors (locked title, target journal, selected gap, evidence counts).
- **Resilient Offline Synthesis Engines**: Domain-aware local synthesis fallbacks for every stage ensuring uninterrupted workflows when network streams or AI providers disconnect.
- **Comprehensive Workspace Test Coverage**: Added 26 dedicated test suites with 176 unit and integration tests under `src/desk/workspace/__tests__/`.
- **Dual-Pane Agentic Workspace Layout**: Left navigation sidebar and scrollable main content canvas optimized for high-density academic research workflows.
- **Strict Day/Night CSS Engine**:
  - **Day Mode (Sand & Snow)**: Warm sand/off-white background (`#F7F5F0`), pure white cards (`#FFFFFF`) with subtle elevation, deep charcoal text (`#111111`).
  - **Night Mode (ChatGPT-Inspired)**: Pure OLED black sidebar (`#000000`), deep neutral gray canvas (`#171717`), elevated cards (`#212121`), subtle 1px border separation (`#333333`), and inverted action buttons. Zero muddy navy or blue tinting.
- **Pinned Sticky Modal Footer**: Always-visible action footer in `AccountSettingsScreen` preventing save button cutoff across smaller laptop viewports.
- **Enter-to-Submit**: Form submission integration allowing immediate profile saves on <kbd>Enter</kbd> keypress.
- **AI Access Modal Modernization & Cognitive Load Reduction**:
  - **Condensation from 7 Tabs to 4 Action-Oriented Tabs**:
    - `Overview`: High-level connection counts, quick-access summary tiles, and active connections.
    - `Providers`: Merged Local AI, Free AI, and Pro / BYOK into a single unified provider directory.
    - `Subscription`: Replaced "Premium" with clear self-service plan requesting and allowance inspection.
    - `Preferences`: Consolidated Models and Settings into three clean vertical sections (Routing, Active Models, Privacy & Security).
  - **Sidebar Architecture & Typography**: Stripped away all secondary subtitle text hints and applied `font-semibold` and `tracking-tight` to active navigation items.
  - **Responsive 3-Column Providers Grid**:
    - Replaced heavy vertical lists with a clean `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` CSS grid.
    - Implemented segmented pill filtering (`[ All ] [ Local Runners ] [ Cloud Providers ]`) plus instant search.
    - Designed minimal cards displaying strictly Provider Logo, Provider Name, and small tier badge (`Free`, `Pro`, `Local`, `Connected`) — completely removing explanatory text clutter.
  - **Unified Connection Workflow**:
    - Provider cards trigger a unified setup slide-over drawer modal with backdrop blur.
    - Added in-modal tier switching (`[ Free Tier ] [ Pro / BYOK Key ]`) for freemium providers to configure keys without UI route splitting.
  - **Preferences Consolidation & Hoverable Tooltip**:
    - Structured into Routing (Default / Fallback dropdowns), Active Models (model mapping), and Privacy & Security (Local AI only checkbox).
    - Encapsulated the 3 heavy encryption bullets inside an accessible hoverable `(?)` popover tooltip to prevent vertical fatigue.
- **Strict Theme Preservation**: Kept `index.css` variables, background colors, and standard theme layouts completely untouched outside the modal refactor.
- **Smooth Day/Night Theme Transition**: Added global transitions (`background-color 0.3s ease-in-out, color 0.3s ease-in-out, border-color 0.3s ease-in-out`) targeting `body, main, aside` in `src/index.css` for a gentle visual crossfade without layout jitter.

### Changed
- **Settings Navigation Architecture**:
  - Relocated "Settings" back as a standalone navigation item in the lower section of the sidebar (`ProjectListScreen.tsx`), positioned directly above the user profile block with standard gear icon and text.
  - Removed "Settings" from the User Profile Popover (`UserAccountMenu.tsx`), retaining "Help & Support" and multi-account switching cleanly inside the popover.
  - Reverted bulky wide "Day mode [Light]" toggle to a minimal, clean icon-only button (sun/moon icon) placed unobtrusively alongside Settings in the sidebar action row.
- **Airbnb Typography Hierarchy**:
  - Global font stack configured to strictly prioritize 'Plus Jakarta Sans' and 'Inter' in `@theme` and Google Fonts imports.
  - Applied punchy `font-semibold` and `tracking-tight` across sidebar navigation items, user trigger, and dropdown actions to give them solid visual weight.
- **Dual-Pane Layout Implementation**:
  - Restructured `ProjectListScreen.tsx` into a full-viewport flex container (`h-screen w-full flex overflow-hidden`).
  - Fixed left sidebar (`<aside>`) housing branding, full-width "+ New Project" button, workspace navigation, action row with Settings and minimal Day/Night toggle, and anchored user profile menu at the bottom.
  - Centered right-hand scrollable canvas (`<main>`) wrapping project categories in a focused `max-w-4xl` layout.
- **Force Cache Busting & Service Worker Upgrade**:
  - Upgraded service worker cache in `sw.js` to `scholar-os-v3` with immediate `self.skipWaiting()` and `self.clients.claim()` invocation to drop stale PWA caches on deploy.
- **WCAG Contrast Compliance**: Verified all 82 contrast pairings across both light and dark themes using `scripts/verify-contrast.mjs`.

### Fixed
- Resolved modal viewport overflow clipping on 13-inch and 14-inch laptop screens.
- Eliminated redundant standalone settings navigation buttons and links across all sidebars and top headers.
- Sanitized international phone inputs with automated dial-code deduplication.
- **AI Drafting & Draft Preview Infinite Loops**: Fixed `setInterval` leaks across all workspace stage components (`DraftStage`, `DraftPreviewStage`, `EvidenceExtractionStage`, `OriginalityCheckStage`, `CitationAuditStage`, `EvidenceAnalysisStage`, `ExternalResearchStage`) by adopting `useRef` handles, guaranteed `finally`/`error` clearing, and `useEffect` unmount hooks.
- **Protocol Disconnect on `/draft-preview`**: Upgraded the endpoint to Server-Sent Events (`text/event-stream`) with automatic fallback to local project answers (`manuscript_draft` / `assembled_draft`) when Supabase is offline or unconfigured.
- **Draft Persistence Gap**: Fixed `/draft` endpoint in `server/routes/project/agentic.ts` to persist generated manuscript sections directly into `project.answers.manuscript_draft`.
- **Silent Stream Stalls in `authedStreamFetch`**: Added JSON and non-SSE HTTP response handling to prevent unhandled promise rejections and UI freezes.
- **Model Unavailable Failover Diagnostics**: Expanded `isModelUnavailableError` regex patterns on HTTP 400 responses so missing or retired models trigger automatic failover rather than halting execution.
- **Final Editor JSON Parsing & REST Protocol**: Converted relational GET/PUT endpoints (`/manuscript`, `/evidence`, `/critiques`) to return standard JSON rather than SSE text chunks, enabled instant draft hydration from `project.answers` in `FinalEditorStage`, and made formatting toolbar buttons functional.

