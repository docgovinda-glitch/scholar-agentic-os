# Direct Landing Workspace & In-Page Authentication Specification

## Overview

This document specifies the direct landing page architecture, in-page authentication system, and bottom Website Assistant in **Scholar Core**.

---

## 1. Core Architectural Requirements

1. **Direct Landing Command Center & Bottom-Anchored Architecture**:
   - Visitors navigating to `https://scholar.gkshah.com.np/` (or `/`, `/signin`, `/signup`) immediately land on the full academic command center workspace (`ProjectListScreen.tsx`) without full-page redirects away to separate auth walls.
   - **ChatGPT & Google Gemini Layout Alignment**:
     - The main workspace utilizes full viewport height (`h-screen overflow-hidden`) with a scrollable center viewport and a bottom-docked prompt interaction area.
     - **Centered Workspace Gallery**: The 4 curated academic deliverable template cards (*Coursework & Essays*, *Journal Article*, *Research Proposal*, *Slides & Keynotes*) sit comfortably centered in the viewport above the input area, preceded by the workspace inquiry (*"Where will your research begin?"* and *"Select an academic deliverable or paste your assignment guidelines below."*). Template card headers display clean category icons with zero clutter, omitting unnecessary floating info indicators (`i`) or secondary popover triggers.
     - **Bottom-Docked Unified Prompt Area**: Docked at the bottom of the viewport with an Apple-style upward gradient fade (`bg-gradient-to-t from-white via-white to-transparent dark:from-[#171717] dark:via-[#171717] dark:to-transparent`), pinned `max-w-4xl mx-auto` horizontal container alignment, auto-growing input with drag-and-drop/clipboard paste, and an institutional rubric verification disclaimer footer (*"Scholar Core Socratic Engine · Verify citations against official institutional rubrics."*).

2. **In-Page Authentication ("Sign In on This Page Only")**:
   - Directly re-wires the canonical, production-engineered screens (`SignInScreen`, `SignUpScreen`, `ForgotScreen`, `RegisteredScreen`, `ResendVerificationScreen`) inside `EmbeddedAuthModal` without code or schema duplication.
   - Preserves all battle-tested functionality: username availability checks, email availability checks, phone country code normalization, user type and education level selectors, password strength validation, Supabase CAPTCHA challenges, and Google OAuth.
   - Preserves researcher context: clicking any workspace format card while unauthenticated triggers the modal with an informative context notice (e.g. *"Sign in to create your Journal Article project"*), automatically launching that workspace format upon successful authentication via `?newFormat=<formatId>`.

3. **Gemini-Inspired Responsive Website Assistant**:
   - Positioned at the bottom of the page (`#website-assistant`) to provide strictly bounded guidance on navigating Scholar Core and utilizing its features.
   - **Gemini-Style Seamless Capsule**: Replaced fragmented inputs with a continuous capsule pill containing an animated sparkle icon, transparent prompt field, and an integrated circular submit button (`↑`) on the right that lights up dynamically upon typing.
   - **Actionable Direct Deep-Links**: Answers include one-click actions (`[Open AI Access Settings ↗]`, `[Open Knowledge Vault ↗]`, `[Browse Academic Workspaces ↑]`, `[Jump to Active Projects ↓]`).
   - **Contextual Follow-ups**: Provides dynamic multi-turn suggestion chips beneath responses.
   - **Gemini Shimmer Wave**: Renders an iridescent gradient sparkle avatar and animated shimmer wave thinking state.
   - **Responsive & Touch-Friendly**: Chips automatically scroll horizontally with snapping on mobile devices (`<640px`) and flex-wrap on desktop viewports.
   - One-click copy response button with checkmark feedback.
   - Strictly limited to platform help; refuses general writing, coding, web search, or document generation with polite redirection to the relevant dedicated workspace.

---

## 2. Routing & Authentication Flow

```mermaid
graph TD
    User([Visitor navigates to /]) --> Gate{Session Status?}
    Gate -->|Unauthenticated| Landing[Direct Landing on ProjectListScreen]
    Gate -->|Authenticated| OnboardingCheck{Completed Onboarding?}
    OnboardingCheck -->|No| Onboard[Onboarding Flow]
    OnboardingCheck -->|Yes| LandingAuth[ProjectListScreen with Projects]

    Landing --> Action{Researcher Action}
    Action -->|Clicks 'Log In' / 'Sign Up' in Top Bar| AuthModal[In-Page EmbeddedAuthModal]
    Action -->|Clicks 'Guest Researcher' Card in Sidebar| AuthModal
    Action -->|Clicks Workspace Card e.g. 'Journal Article'| ContextAuth[In-Page Modal with Context & Intent]
    Action -->|Clicks 'Platform Guide' / FAQ Chip| Assistant[Scrolls to Bottom Website Assistant]

    ContextAuth -->|Completes Auth| AutoInit[Auto-boots Project /projects/new?format=OT-10]
    AuthModal -->|Completes Auth| Refresh[Refreshes Session In-Page & Loads User Projects]
```

### Route Configurations (`DeskApp.tsx` & `DeskAuthGate.tsx`)

- **`RootOrProjectsRoute`**:
  - Handles `/`, `/signin`, and `/signup`.
  - When unauthenticated, renders `ProjectsIndexRoute` directly, opening `EmbeddedAuthModal` if the route is `/signin` or `/signup`.
  - When authenticated, redirects to `/projects` protected inside `RequireAuth` -> `RequireOnboarding` -> `OnboardingGate`.
- **`RequireAuth`**:
  - Unauthenticated hits to protected deep-links (e.g. `/projects/:id`) redirect to `/signin?redirect=${redirect}` so the user lands on the workspace with the auth modal pre-opened and returns to their destination upon sign-in.
- **`OnboardingGate`**:
  - Guest sessions bypass onboarding checks: `if (session.status !== "signed-in") return <Outlet />;`.

---

## 3. Visual & Functional Components

### 3.1 Header Sticky Top Bar
- When `!userEmail`: Displays **Log In** (ghost button) and **Sign Up** (solid dark pill button) in the sticky top bar next to theme and notification controls.
- When `userEmail`: Displays the full active researcher profile and quick project shortcuts.

### 3.2 Sidebar Profile Card (`UserAccountMenu.tsx`)
- Unauthenticated visitors see a guest profile card:
  ```tsx
  <button onClick={onOpenAuth} className="...">
    <Avatar initials="GR" />
    <div>
      <p className="font-semibold">Guest Researcher</p>
      <p className="text-blue-600">Sign In / Register →</p>
    </div>
  </button>
  ```
- Authenticated researchers see their name, institution, tier badge, and account switching popover.

### 3.3 Main Command Center Layout
Strictly aligns with the flagship visual design:
1. **Hero Title**: *"What would you like to write today?"* (`text-3xl font-bold tracking-tight`).
2. **Sub-headline**: *"Select a research blueprint to initialize your academic workspace."*
3. **4 Academic Workspace Cards** (4-column responsive grid):
   - **Assignment** (`OT-01`): Structured essays, coursework, and term papers with rubric compliance.
   - **Journal Article** (`OT-10`): Empirical research, IMRaD manuscripts, and systematic reviews.
   - **Research Proposal** (`OT-22`): Grant applications, thesis proposals, and methodology design.
   - **Presentation** (`OT-04`): Defense slides, conference presentations, and lecture decks.
4. **Active Projects**:
   - Header with count indicator (`Active Projects 0 of 0`) and search bar.
   - Empty state card: *"Initialize your first project"* with `[Browse Templates]` and `[Import from Zotero / PDF]` secondary actions.

### 3.4 In-Page Website Assistant (`#website-assistant`)
- Located at the bottom of the canvas with a clear section heading: *"Scholar Core Platform Guide & Assistant"*.
- Contains 10 interactive starter chips:
  1. *How do I set up AI?*
  2. *What is Knowledge Vault?*
  3. *How do I create a research project?*
  4. *What is the Evidence phase?*
  5. *How do I add sources?*
  6. *What does this feature do?*
  7. *Where can I find my projects?*
  8. *How does the Journal Article workflow work?*
  9. *What is Scholar AI Engine?*
  10. *How do I configure an AI provider?*
- Conversation thread records assistant answers with clear formatting and references to specific Scholar Core features.
- Out-of-scope query guard: Refuses general writing, coding, or homework solving, directing users to the appropriate structured workspace.

---

## 4. Test & Verification Coverage

Automated tests in `src/desk/__tests__/ProjectListScreen.test.tsx` verify:
- Unauthenticated guest access renders the full landing page without redirects.
- Clicking workspace cards opens the in-page auth modal with custom intent context.
- Top-bar "Log In" and "Sign Up" triggers open the auth modal.
- Sidebar "Platform Guide" button scrolls smoothly to `#website-assistant`.
- Website Assistant answers platform queries and refuses out-of-scope writing requests.
- All 75 test suites (599 tests) across `src/desk/` pass with zero regressions.
