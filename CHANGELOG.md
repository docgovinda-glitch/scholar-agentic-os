# Changelog

All notable changes to the Scholar Agentic OS project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-09-17

### Added
- **Workspace Dashboard Apple-Inspired Aesthetic Overhaul (`ProjectListScreen.tsx`)**:
  - **Conversational Header**: Replaced repetitive "Scholar Workspace" header and tag clutter with the warm, human inquiry: *"What would you like to write today?"*.
  - **Clutter Removal**: Removed technical breadcrumbs, redundant pill badges, and subtitle jargon mentioning "initialize", as well as the duplicate secondary `+ New Project` button in the canvas area to keep project initialization centralized in the primary sidebar.
  - **Full-Width AI Prompt Bar**: Inserted a distraction-free, tactile input bar (`w-full max-w-3xl px-6 py-4 rounded-full`) with gentle focus rings and placeholder prompt (*"Start a literature review, brainstorm an outline, or drop a syllabus here..."*).
  - **Apple-Style Tactile Template Cards**: Redesigned template cards into continuous-geometry interactive tiles (`rounded-2xl border border-gray-100 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-200/50 cursor-pointer p-6` with dark mode support).
  - **Human-Centric Content Focus**: Purged all technical serial codes ("OT-01", "OT-10", "OT-22"), green "Ready to boot" status indicators, and separated footer action links, displaying strictly the format icon, title, and description wrapped in an accessible `<button>`.
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

