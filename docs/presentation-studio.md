# Scholar OS Presentation Studio Specification & Architecture

## 1. Overview & Architectural Principles

Scholar OS **Presentation Studio** is a web-native, academic-grade slide authoring and presentation delivery suite. It adheres strictly to the Apple/Airbnb design system and matches the UX of Scholar OS Coursework and Essay drafting environments, completely eliminating developer jargon, database leakage, orphaned elements, and UI bloat.

```
01 Understand ──▶ 02 Design ──▶ 03 Edit Slides ──▶ 04 Present
```

### Core Design Pillars
1. **Coursework & Essay UX Alignment**: Replaces confusing jargon (*"Scaffolding"*, *"Decomposition"*, *"5-Beat Narrative"*) with plain English (*"Understand"*, *"Topic"*, *"Key Points"*).
2. **Subtle & Private Auto-Save**: Replaces developer database strings (`"Saved to PostgreSQL"`) with a quiet, non-intrusive status indicator (`● Saved` or `◌ Saving changes...`) with green/amber status dot and timestamp.
3. **Collapsible Right-Side "Ask Scholar" Copilot**: Matches the Coursework `Advisor.tsx` layout architecture. Renders inside an anchored `<aside>` container with avatar, subtitle `"Slide & Outline Advisor"`, 4 quick action chips, scrollable chat thread, and firmly anchored bottom dock input pill (zero orphaned floating inputs).
4. **Header Navigation Hygiene**: Completely purges the premature `Present Fullscreen` pill from Steps 01, 02, and 03. Presentation controls are relocated exclusively to Step 04 ("04 Present") where `"Start Presentation (F)"` triggers the native browser Fullscreen API and Live Slide Player.
5. **Zero-Ghost Outlines & 1-to-1 Scope Binding**: Before a user enters a topic or uploads a brief, a clean dashed empty-state prompt appears. Once generated, the 5 points from the Green Scope Box map directly 1-to-1 into the 5 slide outline cards.
6. **Zero "Key Analytical Synthesis" Anti-Pattern**: All generic placeholders and repetitive titles are eradicated across the codebase.
7. **Apple-Grade 3-Tab Theme Studio**: Top segmented switcher (`[ Curated Styles (4) ]` | `[ Explore Library ]` | `[ 📸 Screenshot Cloner ]`) with 4 handcrafted aesthetic heroes, searchable theme library, and client-side screenshot palette extraction.
8. **Presentation Style Writing Tone & Narrative Architecture**: `Presentation Style` dropdown actively controls writing tone, bullet constraints (`strict-6x6`, `conversational-brief`, `data-led`), and layout distribution.

---

## 2. Layout & Workspace Architecture

`src/desk/presentation/PresentationWorkspace.tsx` and `src/layouts/AppLayout.tsx` integrate Presentation Studio seamlessly into the Scholar Core navigation shell:

```tsx
<div className="flex h-screen w-full overflow-hidden bg-[#F7F5F0] dark:bg-[#171717] text-neutral-900 dark:text-neutral-100 font-sans">
  {/* Left Sidebar Shell (Scholar Core Navigation Rail) */}
  <ScholarSidebar
    isCollapsed={sidebarCollapsed}
    onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
    activeItem="presentation"
  />

  {/* Main Workspace Column */}
  <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
    {/* Global Header (Height: 56px / h-14) - Zero ✕ exit cross, Apple/Airbnb ← Workspace back button */}
    <PresentationHeader
      onNavigateBack={handleNavigateBack}
      isSidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
    />

    {/* Scrollable Canvas Body */}
    <main className="flex-1 overflow-y-auto px-6 py-8 min-h-0">
      <div className="max-w-5xl mx-auto w-full">
        {currentStep === 'understand' && <Step01Understand />}
        {currentStep === 'design' && <Step02Design />}
        {currentStep === 'studio' && <Step03EditSlides />}
        {currentStep === 'delivery' && <Step04Present />}
      </div>
    </main>
  </div>

  {/* Right Collapsible Ask Scholar Drawer */}
  {isAskScholarOpen && (
    <aside className="w-80 lg:w-96 flex-shrink-0 border-l border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] h-full shadow-lg z-20">
      <AskScholarPresentationDrawer onClose={() => setIsAskScholarOpen(false)} />
    </aside>
  )}
</div>
```

---

## 3. The 4-Step Guided Workflow

### Step 01: Understand Your Presentation (`Step01Understand.tsx`)
- **Intake Controls**:
  - **Slide Count**: Configurable slide deck length (3–15 slides, default 5).
  - **Presentation Style**: Controls writing tone and narrative mechanics:
    - `Standard Narrative` (Scholarly, linear, thesis-driven; strict 6x6 bullet rule).
    - `Problem & Solution (SCR)` (Direct, problem-focused, actionable; 2-column contrast friction).
    - `Case Study Analysis` (Empirical, investigative; grounded in organizational evidence).
    - `Executive Pitch` (Concise, high ROI emphasis, big metric callouts).
  - **Audience Level**: `Academic Seminar`, `Executive Board`, `General Public`, `Student Workshop`.
- **Zero-Ghost Empty State**:
  - When no topic or brief is loaded, renders a clean dashed prompt box (`"Ready to outline your presentation. Enter a topic or upload your assignment brief above to generate your slides."`) with zero fake cards.
- **Side-by-Side Scope Analysis Boxes**:
  - **Green Box (`What This Presentation Covers`)**: 5 key analytical points with count pill (`5 Key Points · Editable`), editable items, and `+ Add Key Point`.
  - **Yellow Box (`What to Avoid (Out of Scope)`)**: 4 guardrail rules (`4 Rules · Editable`), editable items, and `+ Add Rule`.
- **1-to-1 Outline Binding & Badge Stacking Fix (`SlideOutlinePillCard.tsx`)**:
  - Directly binds the 5 covered points into distinct, question-grounded slide cards:
    - **Slide 1**: `SLIDE 1` | `Key Points` — *"Why Zappos Pays New Hires $2,000 to Quit"* (Analyzes how financial exit bonuses filter for genuine cultural alignment).
    - **Slide 2**: `SLIDE 2` | `Framework` — *"Schein's 3 Levels: Artifacts, Espoused Values & Basic Assumptions"* (Deconstructs workplace culture across symbols, declared philosophies, and unconscious beliefs).
    - **Slide 3**: `SLIDE 3` | `2-Column Comparison` — *"The Limits of Artifacts: Why Changing Perks Fails to Shift Culture"* (Evaluates why cosmetic changes produce superficial compliance).
    - **Slide 4**: `SLIDE 4` | `Key Points` — *"Leadership Intervention: Targeting Values and Habits to Shift Assumptions"* (Assesses which cultural tier leaders must engage first).
    - **Slide 5**: `SLIDE 5` | `Key Points` — *"Assessing Organizational Culture in Candidate Job Interviews"* (Diagnostic framework for observing artifacts and probing unwritten rules).
  - **Badge Wrapping Fix**: Uses `inline-flex items-center justify-center whitespace-nowrap shrink-0` on `SLIDE {N}`, preventing wrapping on cards like `SLIDE 3`.

### Step 02: Choose Presentation Design (`Step02Design.tsx`)
- **Apple-Style Top Segmented Switcher**:
  - `[ Curated Styles (4) ]` | `[ Explore Library ]` | `[ 📸 Screenshot Cloner ]`.
- **Tab 1: Curated Styles (4)**:
  1. **Sand Academic**: Canvas `#F7F5F0`, Card `#FFFFFF`, Slate text `#0F172A`, Royal blue accent `#2563EB`.
  2. **Minimal Clean**: Canvas `#F8FAFC`, Card `#FFFFFF`, Dark text `#1E293B`, Slate charcoal accent `#0F172A`.
  3. **Editorial Warm**: Canvas `#FAF8F5`, Card `#FFFDF9`, Charcoal text `#292524`, Terracotta accent `#C2410C`.
  4. **Deep Midnight**: Canvas `#171717`, Card `#1C1C1E`, Light text `#F8FAFC`, Sky blue accent `#60A5FA`.
  - **Live Dynamic Cards**: Renders actual Slide 1 action title instead of static mock strings.
  - **Docked Custom Accent Picker**: Custom color picker with live WCAG AA contrast calculation. Redundant inline `Day / Night` toggle pill purged; theme toggling belongs exclusively to the global Scholar Core sidebar switcher.

- **Tab 2: Explore Library (`ThemeLibraryGrid.tsx`)**:
  - **100 Curated Royalty-Free & Public Domain Slide Designs**:
    - **Academic & Thesis Defense (20)**: Oxford Empirical Monograph, Cambridge Quadrangle, Harvard Law Casebook, MIT Linear Algebra, Sorbonne Scholastic, Max Planck Quantum, etc.
    - **Executive & McKinsey/BCG Consulting (20)**: McKinsey Pyramid Principle, BCG Growth-Share Matrix, Bain Strategic Horizon, Deloitte Digital Transformation, etc.
    - **Apple Keynote & High-Growth Tech (20)**: Apple Cupertino Minimal, Space Black Pro, Stripe Developer Velocity, Linear Modernist, Arc Browser Glass, Figma Neo-Canvas, etc.
    - **Editorial & Publishing Longform (15)**: The New Yorker Monograph, The Economist Briefing, Financial Times Salmon, The Atlantic Longform, Monocle Tokyo Paper, etc.
    - **Scientific & Data-Dense Infographics (15)**: BioRender Cellular Topology, Genomic Atlas Chromosome, NASA Jet Propulsion Blueprint, Climate Science Flux, etc.
    - **Conference Showcase & TED Keynotes (10)**: TED Global Horizon, Y Combinator Demo Day Pitch, Davos World Economic Forum, SXSW Interactive Signal, etc.
  - **Diverse Layout Archetypes**:
    - `2x2-matrix`: Strategic 4-quadrant positioning cards with accent outlines.
    - `pillar-cards`: 3-column architecture breakdown cards with distinct header blocks.
    - `timeline-milestone`: Horizontal sequence track with connected milestone nodes.
    - `contrast-split`: Friction / Problem vs Breakthrough / Solution comparative split.
    - `executive-stat`: Oversized bold metric (+84.2%) with context note and trend indicator.
    - `quote-spotlight`: High-impact editorial quotation block with author/journal attribution.
  - **Instant Filtering & WCAG AA Verification**: Category pills (`All (100+)`, `Academic`, `Minimal`, `Executive`, `Editorial`, `Vibrant`, `Apple & Tech`, `Scientific`, `Conference`), Day/Night mode filter, and instant search across titles, motifs, and archetypes.
- **Tab 3: Screenshot Cloner (`ThemeScreenshotCloner.tsx`)**:
  - Drag-and-drop dropzone for slide screenshots, posters, and brand imagery.
  - Client-side HTML5 canvas color extraction (background luminance, card surface, structural typography, accent signal).
  - Real-time swatch inspection and instant live preview with `"Apply Cloned Theme"`.

### Step 03: Edit Slides (`Step03StudioCanvas.tsx`)
- **100% WYSIWYG Editable Card Canvas**:
  - Click-to-edit Action Headlines (max 8–10 words).
  - Click-to-edit Category Badges.
  - 6x6 Bullet Constraint: Inline items with live word-count warning badges (`⚠️ >6 words`).
  - Big Metric Focus: Editable metric stat (48–72pt) and empirical context note.
  - 2-Column Comparison: Side-by-side editable headers and bullet arrays.
  - Split Image + Text (`image-split`): 50% image dropzone/uploader + 50% action title and bullets.
- **In-Slide AI Prompt Copilot**:
  - One-click quick actions (*"Add an image to this slide"*, *"Change to 2 columns"*, *"Focus on big metric"*, *"Shorten bullets"*).
- **Speaker Rehearsal Notes Drawer**:
  - Expandable bottom drawer for word-for-word delivery cues and timing reminders.

### Step 04: Present & Deliver (`Step04Delivery.tsx`)
- **Fullscreen Live Player Mode**:
  - `"Start Presentation (F)"` button triggers browser Fullscreen API and mounts `LiveSlidePlayer.tsx`.
  - Global presentation controls exclusively mounted in Step 04 header and canvas.
- **Rehearsal Timer**:
  - Integrated elapsed timer in `MM:SS` with pause and reset controls.
- **Dual Presentation Views**:
  - **Stage View**: Clean visual presentation designed for audience projection.
  - **Leave-Behind View**: Exposes methodology notes, research provenance, and citations.
- **Export Formats**:
  - Native JSON slide deck export.
  - Marp-compatible Markdown export.

---

## 4. Ask Scholar Presentation Drawer (`AskScholarPresentationDrawer.tsx`)

A dedicated slide copilot drawer matching Coursework `Advisor.tsx`:
- **Header**:
  - Avatar with ScholarCoreLogo.
  - Title: **"Ask Scholar"**.
  - Subtitle: `"Slide & Outline Advisor"`.
  - Close button: `✕`.
- **4 Quick Action Chips**:
  - `"Improve action headlines"`: Rewrites passive slide titles into conclusive, punchy claims.
  - `"Audit 6x6 bullet rules"`: Audits all slides against the 6-bullet / 6-words-per-bullet rule with violation reports.
  - `"Check visual pacing"`: Assesses balance between bullet lists and visual/metric callouts across deck length.
  - `"Suggest image ideas"`: Suggests relevant visual concepts and diagrams for the active slide.
- **Scrollable Chat Thread**:
  - Instant scholarly advice and recommendation cards.
- **Firmly Anchored Bottom Input Dock**:
  - Docked input pill with submit icon firmly anchored to drawer bottom (`shrink-0`). Never detaches or floats across header.

---

## 5. Keyboard Shortcuts Reference

| Key Combination | Action | Scope |
| :--- | :--- | :--- |
| `ArrowRight` / `Space` / `PageDown` | Advance to next slide | Disabled when editing text |
| `ArrowLeft` / `PageUp` | Return to previous slide | Disabled when editing text |
| `Home` | Jump to first slide | Disabled when editing text |
| `End` | Jump to last slide | Disabled when editing text |
| `KeyF` / `f` | Toggle Fullscreen Mode | Global / Step 04 |
| `p` / `P` | Toggle Presenter Notes View | Live Slide Player |
| `Escape` | Exit Fullscreen / Close Player | Global |

---

## 6. Verification & Automated Quality Gates

The Presentation Studio is protected by automated regression suites:
- **`scripts/verify-scholar-presentation-mega.mjs`**: Validates 8 core architectural gates:
  1. Zero `"Key Analytical Synthesis"` occurrences across repository.
  2. Ask Scholar drawer layout, subtitle, ✕ close button, and firmly anchored bottom dock.
  3. Header cleanup: zero premature fullscreen pills in Steps 01–03; exclusive Step 04 mounting.
  4. Step 02 Theme Studio visibility and 3-tab segmented control.
  5. Step 01 Scope 1-to-1 outline binding and `SLIDE {N}` `whitespace-nowrap` badge fix.
  6. Presentation Style writing tone and narrative scaffolding binding.
  7. Vitest test suite (22 test files, 110 tests passing).
  8. TypeScript (`tsc --noEmit`) and ESLint with 0 errors and 0 warnings.
