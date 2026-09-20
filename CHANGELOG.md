# Changelog

All notable changes to the Scholar Agentic OS project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-09-20

### Changed
- **Top Navigation Scholar Core Assistant Logo Toggle & Conditional Hiding (`ProjectListScreen.tsx`, `ScholarAgenticDashboard.tsx`, `ProjectListScreen.test.tsx`)**:
  - Replaced legacy/advisor icon and tooltips with the custom Scholar Core swirling star logo (`ScholarCoreLogo`) in the top navigation bar.
  - Completely removed all hover tooltip and `title` text attributes ("Advisor Center", "Open Scholar Assistant") to keep navigation clean and uncluttered.
  - Conditionally rendered the toggle button so it ONLY appears when the Assistant sidebar is closed (`{!isAiSidebarOpen && ...}` / `{!isSidebarOpen && ...}`).
  - When the sidebar is open, the star logo toggle is completely unmounted from the top navigation to eliminate visual clutter.
  - Closing the sidebar via the `X` ("Close Assistant") button smoothly restores the star logo button in the top navigation.
  - Added comprehensive unit tests in `ProjectListScreen.test.tsx` verifying full lifecycle: rendering without tooltip, opening sidebar, hiding from navigation, and restoring on close.

### Added
- **Scholar Agentic OS Dashboard & Integrated AI Assistant (`src/desk/ScholarAgenticDashboard.tsx`)**:
  - Implemented single-page scientific dashboard with integrated AI assistant sidebar for Scholar Agentic OS following strict 5-phase SDLC architecture and user reference specifications.
  - Smooth flex layout with collapsible `flex-1` main research canvas and fixed-width `w-96` right-anchored slide-in sidebar without layout jank.
  - Global utility header featuring a pill-shaped "Share" button (`Lock` icon) and circular multi-color Gemini-style sparkle AI toggle button.
  - Empirical research document canvas with left document tabs, unit economics / resource allocation budget table matching user reference, and inline floating AI prompt pill (`Plus`, `SlidersHorizontal`, text input with `Tab` badge, and circular submit button).
  - "Scholar Core Assistant" sidebar with horizontal recommendation pill carousel ("How do I set up AI?", "What is Knowledge Vault?", "How do I create a research project?", "What is the Evidence phase?", "How do I add sources?", "Where can I find my projects?"), scrollable chat history canvas with quick action deep-links, and bottom floating pill input with `Plus`, borderless/ringless input, and circular `ArrowUp` submit button.

### Changed
- **Live AI Assistant Slide-In Sidebar & Scholar Core Logo Toggle (`ProjectListScreen.tsx`, `ScholarAgenticDashboard.tsx`)**:
  - Integrated the AI Assistant slide-in right sidebar directly into the active live dashboard route (`https://scholar.gkshah.com.np/projects`).
  - Replaced the third-party Gemini sparkle icon with Scholar Core's own animated breathing Veena logo in the top-right toggle button and conversation indicators.
  - Removed the Share button (`Lock` icon pill) from the top-right header per user instruction, keeping the header clean and dedicated solely to the circular AI Assistant toggle.
  - Removed the redundant inline bottom chatbox to achieve a clean, breathable, uncluttered, and relaxing workspace, making the slide-in drawer the single dedicated AI assistant experience.
  - Clicking the toggle smoothly expands the `w-96` right sidebar while the `flex-1` main workspace transitions smoothly without layout jank.
  - Sidebar features the horizontal FAQ chip carousel, interactive chat canvas, and pinned floating pill input with `Plus`, borderless input, and circular `ArrowUp` submit button.
- **Global Brand Name Removal & Canonical Domain Binding (`scholar.gkshah.com.np`, `ScholarAgenticDashboard.tsx`)**:
  - Performed a global search-and-destroy audit across the entire repository to purge all third-party brand references ("Try Moodie", "trymoodie.com", "trymoodie").
  - Formally bound the official website name and domain `scholar.gkshah.com.np` into the global utility header, document metadata, welcome dialogues, and one-click clipboard share controls.
  - Verified zero lingering instances via whole-repo regex audit and validated clean compilation (`tsc --noEmit`) and production bundling (`npm run build`).
- **Sleek Minimal Dashboard & Hero Heading Removal (`ProjectListScreen.tsx`, `ProjectListScreen.test.tsx`, `DeskApp.test.tsx`, `OnboardingJourney.test.tsx`)**:
  - Removed the hero heading *"What would you like to write today?"* and prompt input box entirely per user instruction.
  - The dashboard now opens with an immediate, minimal focus directly on the 4 Academic Workspace Cards (Assignment, Journal Article, Research Proposal, Presentation), followed by the Projects section and Scholar Core Website Assistant.
- **Hero Input Box Removal for Direct Transition into Academic Workspace Cards (`ProjectListScreen.tsx`, `ProjectListScreen.test.tsx`)**:
  - Removed the hero input box ("Start a literature review, brainstorm an outline, or drop a syllabus") below *"What would you like to write today?"* per user instruction.
  - The hero header now transitions directly into the 4 Academic Workspace Cards (Assignment, Journal Article, Research Proposal, Presentation) without any input distraction.

### Fixed
- **PWA Service Worker Precache Elimination & Instant Live Updates (`vite.config.ts`, `server.ts`)**:
  - Removed `vite-plugin-pwa` precaching which hijacked navigation requests with stale cached bundles.
  - Added automated `/sw.js` self-destruct route that unregisters existing service workers, clears client cache storage, and forces a clean reload across client devices.
  - Configured explicit `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0` headers on all HTML responses from the production Express server (`server.ts`).
- **React 19 Hook Order Mismatch & Blank Screen Elimination (`DeskApp.tsx`, `ErrorBoundary.tsx`, `main.tsx`)**:
  - **Fatal Hook Count Mismatch (Minified React Error #310)**: Resolved fatal runtime crash where `OnboardingGate` conditionally returned before invoking `useAiSetupStatus`, `useVaultSetupStatus`, and `useState(false)`. For authenticated visitors where `useDeskSession()` starts in `"loading"` and resolves to `"signed-in"`, the number of hooks differed across renders, causing React 19 to unmount the entire DOM tree inside `#root`. Moved all hooks unconditionally to the top of `OnboardingGate` with safe nullable inputs (`userId = session.status === "signed-in" ? session.userId : null`).
  - **Top-Level ErrorBoundary**: Implemented a comprehensive `ErrorBoundary` in `src/components/ErrorBoundary.tsx` wrapping the application root in `src/main.tsx`. Features automatic retry with cache busting for stale PWA chunks (`Failed to fetch dynamically imported module`), graceful recovery controls ("Reload Workspace" / "Clear Cache & Restart"), and branded Scholar Core fallback UI to completely eliminate blank screen failures.

### Database
- **Remote Supabase Database Synchronization (`supabase db push`)**:
  - Pushed and verified all migrations, tables, RLS policies, and roles against remote Supabase project `gfjhsijrwodjvkisouzw` using CLI access token. Confirmed database state is completely up to date.

## [Unreleased] - 2026-09-18

### Changed
- **Hero Prompt Bar Restoration & Live Production Synchronization (`ProjectListScreen.tsx`, `ProjectListScreen.test.tsx`)**:
  - Restored the hero prompt `<input>` element below "What would you like to write today?" strictly styled with CSS variables (`bg-[var(--surface-card)]`, `border-[var(--border-subtle)]`, `text-[var(--text-primary)]`, `placeholder-[var(--text-secondary)]`) without hardcoded Tailwind `dark:` classes.
  - Fully initialized `aiPrompt` and `setAiPrompt` at the top of `ProjectListScreen` alongside `creating`, `userEmail`, `openAuth`, and `handleCreate`.
  - Fixed `executeAgenticLLM` invocation taskType from `"chat"` to `"simple"` resolving TypeScript compilation.
  - Synchronized and verified against production deployment at `https://scholar.gkshah.com.np/projects`.
- **UI Revisions: Sidebar & Hero Layout Simplification (`ProjectListScreen.tsx`)**:
  - **Sidebar Clean-up**: Removed the "Platform Guide" button from the left navigation sidebar per user request.
  - **Hero Input Box Removal**: Removed the prompt input box ("Start a literature review, brainstorm an outline, or drop a syllabus") below "What would you like to write today?", providing a direct, distraction-free pathway to the 4 academic workspace cards.
- **UI Revisions: Scholar Core Branding, Compact Assistant & Auth Unification (`ProjectListScreen.tsx`, `UserAccountMenu.tsx`)**:
  - **Logo & Branding Consistency**: Purged all Gemini branding, 4-point sparkle SVGs, and Gemini-specific styling. Replaced with the official Scholar Core animated Veena logo mark (`ScholarCoreLogo.tsx`) across all headers, avatars, and thinking states to preserve application-wide visual identity.
  - **Compact & Balanced Chat Box**: Re-architected the Website Assistant into a sleek, responsive, and compact container that spans the grid column naturally without dominating screen space or leaving awkward whitespace. Constrained message scroll height (`max-h-[200px] min-h-[70px]`), compacted padding (`p-4 sm:p-5`), streamlined typography and inquiry pills (`text-[11px]`), and integrated a seamless capsule input bar.
  - **Single Source of Truth for Authentication**: Eliminated duplicate top-right "Log In" / "Sign Up" buttons to establish the bottom-left sidebar user card (`UserAccountMenu`) as the sole source of truth for authentication, guest sign-in, account switching, and registration.
  - **Projects Workspace Clean-up**: Renamed the section heading to simply "Projects", removed "Browse Templates" and "Import from Zotero/PDF" distractors, introduced a clean minimalist file-browser empty state, and established 1:1 parity between the sidebar Projects folder button and the main workspace listing.
- **Gemini-Inspired Responsive Website Assistant & Direct Auth Wiring (`ProjectListScreen.tsx`, `EmbeddedAuthModal.tsx`, `AuthFlow.tsx`, `AuthLayout.tsx`)**:
  - **Previously Engineered Auth Re-Wiring**: Refactored `EmbeddedAuthModal.tsx` to directly host the previously engineered and battle-tested `SignInScreen`, `SignUpScreen`, `ForgotScreen`, `RegisteredScreen`, and `ResendVerificationScreen` from `AuthFlow.tsx`. Preserved all canonical fields (Full name, Username with live availability checks, Email with live availability checks, Phone with country code selector, User Type, Education Level, Password strength checks, CAPTCHA challenge, and Google OAuth) with zero custom form duplication.
  - **Gemini-Style Seamless Input Bar**: Replaced disconnected input/button layout with a continuous, seamless capsule pill container featuring an animated 4-point sparkle icon, transparent text field, and an integrated circular submit button (`↑`) on the right that lights up upon typing.
  - **Actionable Direct Deep-Links & Contextual Follow-ups**: Responses now provide one-click action buttons (`[Open AI Access Settings ↗]`, `[Open Knowledge Vault ↗]`, `[Browse Academic Workspaces ↑]`, `[Jump to Active Projects ↓]`) and dynamic contextual follow-up inquiry chips.
  - **Gemini Shimmer Wave & Copy Feedback**: Added an iridescent gradient sparkle avatar, animated shimmering wave thinking state, and one-click copy response button with visual confirmation.
  - **Mobile-Responsive Chips Layout**: Common inquiry chips automatically format as a smooth horizontal scrolling track with snapping on mobile devices (`<640px`) and flex-wrap cleanly on tablet and desktop viewports.
- **Fix Runtime Crash & Strict CSS Variable Styling (`ProjectListScreen.tsx`)**:
  - Initialized core variables (`aiPrompt`, `setAiPrompt`, `creating`, `userEmail`, `openAuth`, `handleCreate`) at the very top of the component to eliminate runtime initialization crash and black screen issues.
  - Refactored hero prompt `<input>` element to strictly use design system CSS variables (`bg-[var(--surface-card)]`, `border-[var(--border-subtle)]`, `text-[var(--text-primary)]`, `placeholder-[var(--text-secondary)]`) and purged all hardcoded Tailwind `dark:` classes.
- **Workspace Dashboard AI Prompt Bar Synchronization (`ProjectListScreen.tsx`, `ProjectListScreen.test.tsx`)**:
  - Exact hero section alignment with reference specification: restored the sleek AI prompt bar directly below *"What would you like to write today?"* with placeholder `"Start a literature review, brainstorm an outline, or drop a syllabus"`.
  - Full keyboard submit support: pressing Enter initializes academic workspace creation or triggers contextual auth for guests.
  - Remote Supabase database synchronized: verified schemas, migrations, and roles on remote instance `gfjhsijrwodjvkisouzw` using CLI access token.
- **Direct Landing on Command Center & In-Page Authentication (`DeskApp.tsx`, `DeskAuthGate.tsx`, `ProjectListScreen.tsx`, `UserAccountMenu.tsx`)**:
  - **Direct Landing Without Redirects**: Configured `/`, `/signin`, and `/signup` via `RootOrProjectsRoute` so visitors navigating to `https://scholar.gkshah.com.np/` land directly on the complete academic command center workspace. Preserved guest access to the UI without forcing full-page redirects away to separate auth walls.
  - **Contextual In-Page Auth (`EmbeddedAuthModal`)**: Replaced all full-page sign-in and sign-up redirects with in-page modals supporting Google OAuth, email/password credentials, and registration. Clicking any workspace template card contextually triggers the modal with intent awareness and auto-initializes the selected workspace format upon sign-in (`?newFormat=<formatId>`).
  - **Guest Profile & Top-Bar Controls**: Added a dedicated guest researcher profile card (*"Guest Researcher / Sign In / Register →"*) to the left navigation sidebar and sticky top-bar "Log In" and "Sign Up" action buttons.
  - **In-Page Website Assistant at the Bottom (`#website-assistant`)**: Relocated the assistant to the bottom of the main canvas with a clean section header and 10 interactive starter FAQ chips. Strictly limited to platform help, navigation, and workflow guidance with refusal logic for general research/writing queries. Streamlined UI strictly to Conversation -> Text Input -> Send button with zero media, file upload, or model selector clutter.
- **Command Center Layout Refinement, Sidebar Active Projects & Minimal Website Assistant (`ProjectListScreen.tsx`)**:
  - **Sidebar Active Projects Integration**: Embedded a dedicated Active Projects list directly inside the left navigation sidebar under Platform links with real-time manuscript counts, format color indicators (Assignment, Journal, Proposal, Presentation), truncated titles, and instant one-click navigation.
  - **Overall Status / Summary 4-Metric Strip**: Added a balanced, proportional 4-card system overview strip (*Active Pipeline*, *Knowledge Vault Grounding*, *AI Engine Connection*, *Editorial Integrity*) providing researchers with an immediate, high-level summary of active drafts, provenance verification, multi-tier routing, and quality gates.
  - **Balanced Academic Workspaces Section**: Organized the 4 curated workspace summary cards (*Assignment*, *Journal Article*, *Research Proposal*, *Presentation*) into a balanced 4-column responsive grid with strict height parity, category tags, word/slide budget footnotes, gentle upward lift hover effects, and direct one-click booting.
  - **Minimal Website Assistant**: Introduced an intentionally minimal, supportive website guide accessible via both the sidebar navigation and a floating trigger button. Strictly answers platform questions (AI configuration & BYOK, Knowledge Vault provenance, creating research projects, Evidence phase & sourcing, Journal Article 25-stage pipeline, and project navigation) with a streamlined **Conversation → Simple Text Input → Send Button** workflow, completely free of attachments, file uploads, voice inputs, or model selectors.
- **Full Conversational AI Chatbot & Research Blueprint Launchpad (`ProjectListScreen.tsx`)**:
  - **Flagship Chatbot Prompt Card**: Upgraded the static text field into a modern conversational AI prompt container featuring an auto-growing multi-line textarea (Shift+Enter support, Enter to send), inline file attachment chip, attachment button (paperclip), `Scholar 3.7` intelligence badge, quick format selector dropdown (Auto-Detect, Assignment, Journal Article, Research Proposal, Presentation), Knowledge Vault grounding toggle, and an elevated circular submit button (`↑`).
  - **Conversational Starter Prompt Chips**: Integrated curated academic starter chips below the prompt box (*CRISPR Base Editing Review*, *LLM Reasoning Benchmark*, *Clean Energy Microgrid Proposal*, *Clinical Trial Slide Deck*) that instantly boot the chatbot session.
  - **Active Multi-Agent Chat Session**: Chatbot executes domain grounding and research intent analysis with realistic multi-agent thinking indicators. Produces a comprehensive, publication-grade academic execution blueprint with tailored working title, core research gap, 3-phase execution roadmap, and reference benchmark targets.
  - **One-Click Workspace Initialization**: Added direct action buttons to boot the recommended workspace pre-seeded with the generated blueprint into intake answers, alongside blueprint copying and multi-turn follow-up scoping.
  - **Minimize & Resume Session Support**: Provided intuitive session controls (`+ New Chat`, `Minimize`, and `Resume Active Chat` badge banner) allowing researchers to fluidly switch between conversational strategy and traditional workspace cards.
- **Hero & Input Area, Template Cards, Empty State & Sidebar Contrast Refinements (`ProjectListScreen.tsx`)**:
  - **Interactive Hero Prompt Container**: Converted the static prompt box into an interactive action bar featuring an attachment paperclip button with file indicator, quick-tag workspace dropdown menu (`+ Select Workspace`), and an inline submit/enter arrow button with active gradient states. Tightened headline-to-input vertical distance (`mb-2.5`) with enhanced typography contrast, `border-slate-200`, and subtle ambient elevation (`shadow-xs`).
  - **Upgraded Workspace Template Cards**: Added interactive lift (`hover:-translate-y-1`), soft tinted rounded-square icon badges (warm amber, blue, indigo, emerald), subtle top-right launchpad arrow-up-right icons (`↗`), and strict min-height parity (`min-h-[185px]`) across both the dashboard and format selector modals.
  - **Streamlined Empty State**: Eliminated the redundant black `+ New Project` button in the empty state to remove visual competition with the primary sidebar CTA. Rendered a subtle dotted outline skeleton of project cards, compacted vertical padding (`py-9`), and introduced secondary action buttons (`Browse Templates` and `Import from Zotero / PDF`).
  - **Left Sidebar & Architectural Hierarchy**: Visually anchored the left sidebar with a crisp 1px border (`border-r border-slate-200/80`), subtle tinted surface tone (`bg-[#F8F9FA] dark:bg-[#121212]`), an active indicator pill for the selected "Projects" view, and scaled the Scholar Core brand logo icon to 32px (`size="md"`).

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

