# Changelog

All notable changes to the Scholar Agentic OS project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-09-17

### Added
- **Dual-Pane Agentic Workspace Layout**: Left navigation sidebar and scrollable main content canvas optimized for high-density academic research workflows.
- **Strict Day/Night CSS Engine**:
  - **Day Mode (Sand & Snow)**: Warm sand/off-white background (`#F7F5F0`), pure white cards (`#FFFFFF`) with subtle elevation, deep charcoal text (`#111111`).
  - **Night Mode (ChatGPT-Inspired)**: Pure OLED black sidebar (`#000000`), deep neutral gray canvas (`#171717`), elevated cards (`#212121`), subtle 1px border separation (`#333333`), and inverted action buttons. Zero muddy navy or blue tinting.
- **Pinned Sticky Modal Footer**: Always-visible action footer in `AccountSettingsScreen` preventing save button cutoff across smaller laptop viewports.
- **Enter-to-Submit**: Form submission integration allowing immediate profile saves on <kbd>Enter</kbd> keypress.

### Changed
- **"Declare It Once" Settings & Account Deduplication**:
  - Removed all standalone "Settings" and "Account Settings" links and buttons from navigation bars (including `Header.tsx` and `ResearchWorkspace.tsx`).
  - Integrated `UserAccountMenu` directly into the project top navigation (`Header.tsx`), ensuring "Account Settings" is strictly and exclusively triggered via the User Profile Popover across the entire platform.
  - Streamlined `AccountSettingsScreen` to 3 core tabs (Personal Info, Security, Subscription), removing redundant multi-account switching logic from the modal.
- **Dual-Pane Layout Implementation**:
  - Restructured `ProjectListScreen.tsx` into a full-viewport flex container (`h-screen w-full flex overflow-hidden`).
  - Fixed left sidebar (`<aside>`) housing branding, full-width "+ New Project" button, workspace navigation, Day/Night toggle, and anchored user profile menu at the bottom.
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

