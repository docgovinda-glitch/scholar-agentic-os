# UI/UX Specification & Design System

This document specifies the current user interface, visual design tokens, component architecture, layout structures, user interaction models, and state handling across all active views in **Scholar Core**.

---

## 1. Design System & Theming

Scholar Core utilizes a **Scientific Monochrome / Minimalist Standard** built on semantic CSS custom properties and high-contrast accessibility standards.

### 1.1 Color Tokens
The design system avoids arbitrary hex codes in component styles, relying instead on CSS variables defined in `src/index.css`:

| CSS Variable | Dark Theme Value (Default) | Light Theme Value | Usage |
| :--- | :--- | :--- | :--- |
| `--surface-canvas` | `#171717` / `#121212` | `#F9FAFB` | Root application background |
| `--surface-raised` | `#1F1F1F` | `#FFFFFF` | Cards, panels, elevated sheets |
| `--surface-overlay` | `#262626` | `#F3F4F6` | Modals, popovers, dropdown menus |
| `--color-border-subtle` | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.08)` | Dividers, card borders, input borders |
| `--color-border-strong` | `rgba(255, 255, 255, 0.20)` | `rgba(0, 0, 0, 0.20)` | Active inputs, focused borders |
| `--text-primary` | `#F5F5F5` | `#111827` | Headings, primary body text |
| `--text-secondary` | `#A3A3A3` | `#4B5563` | Subtitles, metadata, card descriptions |
| `--text-muted` | `#737373` | `#9CA3AF` | Placeholders, inactive icons, timestamps |
| `--accent` | `#3B82F6` (Electric Blue) | `#2563EB` | Primary CTA buttons, active state indicators |
| `--accent-hover` | `#2563EB` | `#1D4ED8` | Hover state on primary actions |
| `--state-success` | `#10B981` | `#059669` | Completed steps, approved sources, high relevance |
| `--state-warning` | `#F59E0B` | `#D97706` | Word count budget alerts, citation warnings |
| `--state-danger` | `#EF4444` | `#DC2626` | Error banners, gap indicators, delete actions |

### 1.2 Day / Night Theme Hydration
- The theme is controlled via `data-theme="dark"` or `data-theme="light"` on the `document.documentElement`.
- Hydration is handled synchronously at initial script execution in `src/main.tsx` using `localStorage.getItem('scholar-theme')` to prevent theme flicker on page load.
- Users toggle theme via the Account Settings modal or the header toggle button.

### 1.3 Typography
- Inter / Outfit sans-serif typeface hierarchy.
- Fixed sizing scale: `text-xs` (11px, badges/metadata), `text-sm` (13px, standard UI/body), `text-base` (15px, reading view/prose), `text-lg` (18px, panel headings), `text-xl` (22px, page titles), `text-2xl` (28px, hero headings).

---

## 2. Global Shell & Navigation

### 2.1 Top Navigation Bar
- **Branding**: Official Scholar Core logo mark and title.
- **Project Title Breadcrumb**: Displays active project title with inline renaming capability.
- **Word Budget Meter**: Real-time counter showing `Current Words / Target Budget` with proportional progress bar.
- **Utility Actions (Right Header)**:
  - **Day/Night Theme Toggle**: Instant light/dark switch.
  - **Knowledge Vault Button**: Quick navigation to `/vault`.
  - **AI Access Button**: Quick navigation to `/ai-access`.
  - **Account Avatar / Menu**: Opens Account Settings (`/settings`) or multi-account switcher.
  - **Stage-Scoped Copilot Toggle**: Slidably opens/closes the contextual AI copilot drawer (`ContextPanel`).

### 2.2 Global State & Feedback
- **Global Loader (`GlobalLoader.tsx`)**: Minimalist top-line progress bar indicating background route switches and heavy view initialization.
- **Error Boundary (`ErrorBoundary.tsx`)**: Wraps application root and individual workspace modules, providing graceful error containment with a "Return to Dashboard" recovery action.

---

## 3. Project Dashboard (`/projects`)

### 3.1 Layout
- **Header**: Greeting, active profile indicator, global search bar, and prominent `+ New Project` button.
- **Format Filter Tabs**: All Projects, Coursework & Essays, Journal Articles, Theses & Dissertations, Proposals, Presentations.
- **Project Grid**: 2-column or 3-column responsive card grid displaying active projects.
- **Sidebar / Quick Links**: Direct access to Vault, AI Access, and Account Settings.

### 3.2 Project Card Structure
- **Deliverable Type Badge**: Visual pill identifying format (e.g., `Coursework & Essay (OT-01)`).
- **Project Title & Topic**: Editable title with last modified timestamp.
- **Stage Progress Indicator**: Visual stepper showing completed phases.
- **Word Count Progress**: Active words versus target budget.
- **Actions**: One-click open, context menu (rename, duplicate, export, delete).

### 3.3 New Project Creation Modal
- Triggered by `+ New Project` or deep link (`/projects?newFormat=OT-01`).
- Displays 4 curated format cards:
  1. **Coursework & Essay** (`OT-01`)
  2. **Journal Article** (`OT-10`)
  3. **Research Proposal** (`OT-19`)
  4. **Academic Presentation** (`OT-22`)
- Includes dropdown for additional formats (e.g., `Thesis / Dissertation (OT-09)`).
- Inputs: Project Title, Target Word Count, Academic Level, Citation Style.
- Primary Action: `Create Project` navigates immediately to `/projects/:projectId`.

### 3.4 Conversational Ask Scholar & Dynamic Canvas Mode
- **Zero-Friction Inquiry**: Prominently featured on the main dashboard with contextual suggested inquiry chips.
- **Full-Screen Conversational Expansion**:
  - In resting state, displays starter deliverable cards alongside the inquiry input.
  - When the user sends their first message or begins active dialogue, starter cards smoothly collapse, transitioning Ask Scholar into an expansive, full-width/full-height conversational canvas.
  - Features real-time streaming, bibliographic citations, and one-click "Create Project from Chat" workflow.
  - Includes a clear `✕ Reset` button allowing instant return to template cards and resting state.

---

## 4. Coursework & Essay Workspace (`OT-01`)

The Coursework & Essay workspace provides a dedicated 4-phase linear workflow.

```text
Phase 1: Extract & Understand
             ↓
Phase 2: Sources & Literature Discovery
             ↓
Phase 3: Drafting & Section Planner
             ↓
Phase 4: Submission & Verification Audit
```

### 4.1 Stage Header & Navigation Stepper
- Located at the top of `AssignmentWorkspace.tsx`.
- Displays 5 canonical step pills:
  1. `01 Extract` (`AssignmentExtractStage.tsx`): Brief ingestion, file parsing, word count stepper, parameters.
  2. `02 Understand` (`AssignmentUnderstandStage.tsx`): Working thesis, theoretical framework, dynamic outline tree, section budgets.
  3. `03 Sources` (`AssignmentSourcesStage.tsx`): Scholarly discovery, Knowledge Vault, lecture slides, evidence ledger.
  4. `04 Drafting` (`AssignmentDraftingStage.tsx`): Structured PEEL drafting, word budgets, AI polish.
  5. `05 Submission` (`AssignmentSubmissionStage.tsx`): 10-point rubric audit, citation reconciliation, export.
- Stepper shows completion checks (`✓`), active pulse indicators, progress percentages, and allows free non-destructive traversal back and forth between unlocked phases.

---

### 4.2 Phase 1 · Extract Brief (`AssignmentExtractStage.tsx`, phase ID `extract`)
- **Purpose**: Unified brief intake (Paste Prompt or Upload Brief Document), target word count stepper (100–50,000w), academic level, assignment type, tone, and citation style.
- **Proceed Action**: Advances smoothly to Phase 2 Understand.

### 4.3 Phase 2 · Understand Assignment (`AssignmentUnderstandStage.tsx`, phase ID `understand`)
- **Purpose**: Core working thesis formulation, theoretical frameworks, bespoke analytical outline (`DynamicStructurePlanner.tsx`), section word budgets, and rule-indexed rubric criteria.
- **Back / Proceed Actions**: Allows returning back to Edit Brief (Phase 1) and advancing forward to Sources (Phase 3).

#### Layout
1. **Unified Assignment Setup Workspace**:
   - Single cohesive card containing all initial inputs in a clean, logical sequence:
     - **Header Tab Switcher**: Minimal toggles for `[ Paste Prompt ]` and `[ Upload Brief Document (.pdf, .docx) ]` with live entered word count.
     - **Assignment Question & Brief**: Prominent, auto-expanding text area for prompt, assignment brief, and questions.
     - **Interactive Target Word Count Stepper**: Stepper controls (`−` and `+` by 250 words) alongside direct numeric input (`e.g. 1500, 2500, 3000`), removing fixed default constraints and dynamically driving downstream section budgets and drafting compliance gates.
     - **Compact Parameters Row**: Inline controls for **Academic Level** (`Undergraduate` | `Postgraduate / Masters`), **Assignment Type** (`General Academic Essay` | `Coursework` | `Critical Review` | `Report` | `Case Study` | `Policy Brief` | `Literature Review`), **Citation Style** (`APA 7th` | `Harvard` | `Chicago` | `IEEE` | `MLA 9th` | `OSCOLA`), and **Writing Tone**.
     - **Single Primary CTA**: Prominent `[ Save & Build ]` trigger button with animated loading state (*"Analyzing Brief & Generating Tailored Assignment Structure..."*).
2. **Dynamic Analytical Structure Planner (`DynamicStructurePlanner.tsx`)**:
   - Transitions directly inside the unified workspace once generated.
   - **Brief-Specific Dynamic Generation**: Deconstructs explicit brief sub-tasks, questions ending with `?`, and domain terminology into tailored, substantive Main Headings and Subheadings (no generic or hardcoded templates).
   - **Dynamic Word Allocation Status Bar**: Real-time allocation metrics displaying `Target: X words · Allocated: Y words · Remaining: Z words` (or `Over: W words` / `Balanced`).
   - **Outline Tree Customization (CRUD) & Word Allocation**:
     - Full inline editing with visual edit affordances for all main headings and nested subheadings.
     - Unconstrained addition and deletion of main headings and subheadings (with empty state handling and 1-click `+ Add Subheading`).
     - Reorder sections with Up/Down buttons.
     - Section-level word count adjustments (`-50`, direct numeric input, `+50`) on main headings that proportionally scale nested subheadings.
     - Subheading-level word budget adjustments (`-50`, direct numeric input, `+50`).
     - `Auto-Balance`: 1-click proportional auto-balancing across all sections to align with the total target word count.
     - `Distribute Remaining`: Automatically assigns unallocated budget words across all subheadings.
     - Section Author Notes: Expandable text box for subheading-level research notes and writing guidance.
     - Stable Internal Identifiers: Preserves stable internal IDs (`headingId`, `subheadingId`) across renames for Phase 2 source attachment and Phase 3 drafting.
3. **Academic Writing Tone & Style Selector (`WritingStyleSelector.tsx`)**:
   - 6 distinct academic voice profiles:
     - *Analytical*: Objective, measured, hypothesis-driven.
     - *Argumentative*: Persuasive, thesis-first, counter-argument addressing.
     - *Critical*: Evaluative, questioning methodology and assumptions.
     - *Expository*: Informative, explanatory, clear definition-focused.
     - *Natural & Engaging*: Fluent, rhythmically varied, human-authored feel.
     - *Match My Writing (Custom Voice)*: Paste a sample past essay to mirror syntactic complexity and transition patterns.

#### User Actions
- `Save & Build`: Primary Phase 1 action; triggers question- and brief-specific structural decomposition with animated loading.
- `Proceed`: Replaces legacy approval labels; validates the balanced structure, commits canonical structure keys (`assignment_structure`, `structure`, `sectionBudgets`, `assignment_internal_sections`), and advances to Phase 2.

---

### 4.3 Phase 2 · Evidence, Sources & AI Analysis (`AssignmentSourcesStage.tsx` & `SectionAnalysisWorkspace.tsx`)

#### Purpose
Builds the unified evidence base for the assignment and synthesizes research-grounded analytical argumentation mapped directly to Phase 1 outline subheadings.

#### Architecture & Layout
1. **Unified Source Vault**:
   - Merges user-provided documents (PDFs, docs, spreadsheets, links) and AI-discovered literature into a single evidence collection.
   - Origin badges distinguish provenance without fragmenting the UI: `User`, `Ask Scholar`, and `AI Research`.
   - Filter tabs: `All`, `Ask Scholar`, `AI Research`, `Uploaded`, `Bookmarked`.
   - Table view with sortable columns: Status (`Included`), Source, Origin, Year, Relevance, Role in Assignment, Venue, Citations, and Actions.
2. **Unblocked Research Workflow**:
   - No mandatory approval bottleneck: sources accumulate automatically into the vault.
   - Direct, single-click source removal (`Source → Remove`) on every card and table row.
   - Advance to Analysis or Drafting at any time without manual approval requirements.
3. **AI Analysis Workspace (`SectionAnalysisWorkspace.tsx`)**:
   - Seamless top view switching between `[ Evidence Vault (N) ]` and `[ AI Analysis ]`.
   - **Left Rail**: Outline section navigator displaying claim counts per subheading.
   - **Main Panel**: 6-part analytical argument cards for each outline subheading:
     - **1. Core Claim**: Central academic thesis answering the section inquiry.
     - **2. Evidence & In-Text Citation**: Empirical/theoretical excerpt linked to live Citation Engine.
     - **3. Critical Interpretation**: Analytical explanation of the evidence's significance.
     - **4. Counterargument & Dissenting Debate**: Opposing theoretical perspectives and boundary conditions.
     - **5. Analytical Link**: Direct connection explaining how this answers the assignment brief.
4. **Citation Engine Bridge & Style Recalculation**:
   - Integrated with Citation Compliance Engine across APA 7, MLA 9, Harvard, Chicago, IEEE, and Vancouver.
   - Changing citation style updates citations across all analytical arguments in real time while strictly preserving custom user claim edits.
5. **Source-to-Citation Traceability**:
   - Clickable citation badge opens an interactive provenance popover displaying:
     `Claim → In-Text Citation → Source Details → Relevant Evidence Excerpt & Locator`.

#### User Actions
- `View Switcher`: Toggle between Evidence Vault and AI Analysis Workspace.
- `Edit Analysis`: Inline editing of claims, interpretations, counterarguments, and analytical links.
- `Strengthen Claim / Deepen Counterargument`: AI-assisted refinement of academic rigor.
- `Change Citation Style`: Instant recalculation across all generated citations.
- `Remove Source`: Single-click removal of unwanted sources.
- `Proceed to Phase 3 Drafting`: Advances to drafting with fully cited analytical arguments pre-grounded.

---

### 4.4 Phase 3 · Drafting (`AssignmentDraftingStage.tsx`)

#### Purpose
Drafts the full assignment section-by-section, enforcing the Phase 1 structure, section word budgets, selected writing tone, and approved evidence citations.

#### Layout
1. **Subheading Section Navigator (`DraftingSectionIndex.tsx`)**:
   - Left-hand navigation rail displaying all Phase 1 subheadings.
   - Visual progress indicators: Target words vs. actual drafted words per section.
   - Status indicators: `Drafted`, `In Progress`, `Empty`.
2. **Main Drafting Canvas**:
   - TipTap WYSIWYG editor configured with academic formatting (Headings, Paragraphs, Blockquotes, Numbered/Bulleted lists).
   - Word count gauge at the top-right of the editor updating live on keystroke.
3. **Evidence & Citation Insertion Drawer**:
   - Slides in from right when drafting a section.
   - Lists only the approved sources mapped to the active subheading.
   - Quick Action: `Insert In-Text Citation` (inserts `(Author, Year)` formatted in the assignment's active citation style).
   - Quick Action: `Insert Evidence Quote` (inserts exact referenced passage with blockquote formatting).
4. **Draft Section Action Bar**:
   - `Generate Section Draft`: Invokes the AI drafting engine to generate an initial draft for the active subheading using the approved evidence and selected tone.
   - `Refine Section`: Rewrites, expands, or tightens active section text.

---

### 4.5 Phase 4 · Submission & Verification (`AssignmentSubmissionStage.tsx`)

#### Purpose
Executes final compliance checks, audits citation integrity, generates the formal bibliography, and produces export-ready files.

#### Layout
1. **10-Point Rubric Compliance Evaluator**:
   - Automated assessment matrix checking:
     - Prompt Addressal & Thesis Clarity
     - Argumentative Progression & Flow
     - Theoretical Grounding
     - Empirical Evidence Density
     - Academic Voice & Register Consistency
     - Critical Analysis vs. Mere Description
     - Structural Balance (Actual vs. Target Section Budgets)
     - Citation Accuracy & Frequency
     - Bibliography Completeness
     - Formatting & Academic Integrity
   - Scores each dimension (0-10) with actionable improvement suggestions.
2. **Citation Reconciliation Auditor**:
   - Two-column reconciliation ledger:
     - Column A: Every in-text citation extracted from the draft (`(Smith, 2024)`, `(Doe et al., 2025)`).
     - Column B: Corresponding entry in the compiled bibliography.
     - Discrepancy Alert: Highlights orphan citations (in-text citation with no bibliography entry) or ghost sources (bibliography entry never cited in text).
3. **Export Panel**:
   - Options: Include Title Page, Include Abstract, Include Table of Contents, Running Header.
   - Primary Export Actions:
     - `Download Word Document (.docx)`: Generates fully formatted `.docx` file with styles, headers, and bibliography.
     - `Download PDF (.pdf)`: Generates clean, publication-ready PDF.

---

### 4.6 Stage-Scoped Copilot Drawer (`ContextPanel.tsx`)
Slidably accessible from the top header on any phase:
- **Phase 1**: Persona **Advisor** — Focuses on prompt deconstruction, command verb clarification (e.g. *critically analyze* vs. *evaluate*), and structural outlining.
- **Phase 2**: Persona **Librarian** — Focuses on search queries, peer-reviewed rigor, source suitability, and evidence gap identification.
- **Phase 3**: Persona **Scribe** — Focuses on paragraph synthesis, transition sentences, PEEL structure (Point, Evidence, Explanation, Link), and academic phrasing.
- **Phase 4**: Persona **Examiner** — Focuses on rubric scoring, marking criteria evaluation, and citation verification.

---

## 5. Knowledge Vault View (`/vault`)

### 5.1 Layout
- **Search & Filter Header**: Universal search bar searching across authors, titles, DOIs, and user tags.
- **Source Type Filter Bar**: `All`, `Journal Articles`, `Books`, `Conference Proceedings`, `Reports`, `User Files`.
- **Primary Actions**:
  - `+ Ingest DOI`: Opens modal to fetch metadata via Crossref/OpenAlex.
  - `Connect Cloud Drive`: Connects Google Drive or OneDrive folder.
  - `Import BibTeX / RIS`: File upload dropzone for `.bib` and `.ris` references.
- **Vault Item List / Grid**:
  - Displays source title, authors, publication year, journal/venue, DOI link.
  - Cloud Drive badge with direct `↗ Open in Google Drive` navigation.
  - Tag pills and associated project badges.

---

## 6. AI Access Control View (`/ai-access`)

### 6.1 Layout
- **Navigation Tabs**:
  - `Overview`: Current active provider, model name, connectivity status, latency meter.
  - `Providers`: BYOK management. Cards for OpenAI, Anthropic, Google Gemini, Groq, Mistral, Cohere, xAI, OpenRouter, Together AI. Each card provides an API key input, `Test Key` verification button, and active status pill.
  - `Local AI & Runners`: Discovered local engines (Ollama, LM Studio, vLLM). Displays host address (`http://localhost:11434`), installed local models, and system memory stats.
  - `Subscription / Premium`: Free tier quota and premium account status.
  - `Preferences`: Model selection dropdowns for primary drafting, fast search, and copilot chat.

---

## 7. Account Settings View (`/settings`)

### 7.1 Layout
- Modal sheet overlay or dedicated page.
- **Multi-Account Registry**: Displays all signed-in profiles with avatar, email, and institution. One-click `Switch Account` button.
- **Profile Details**: Name, Institution, Discipline, Academic Degree Level, Default Citation Style.
- **Theme Selection**: Explicit toggle between `Dark (Scientific Monochrome)` and `Light (Clean Day)`.
- **Security**: Password update fields and sign-out button.

---

## 8. View States & Responsive Adaptations

| State | Visual Treatment | User Guidance |
| :--- | :--- | :--- |
| **Initial State** | Clean, uncluttered layout with primary action prominently displayed. | Clear introductory helper text explaining the primary action. |
| **Loading State** | Skeleton loaders for cards and text blocks; top-edge progress bar for route changes; spinning indicator for async AI calls. | Action buttons disabled with loading spinner and descriptive status (e.g., "Analyzing prompt..."). |
| **Empty State** | Minimalist illustration, clear title, and single primary CTA button. | Encourages immediate user action (e.g., "No sources added yet. Run scholarly discovery to find literature."). |
| **Success State** | Subtle green checkmark badge, toast notification, and immediate unlocked progression. | Confirms completion and enables next phase navigation. |
| **Error State** | Red border highlights on invalid inputs, banner alerts with human-readable error explanations, retry button. | Actionable guidance explaining how to correct the issue. |
| **Disabled State** | 40% opacity, `cursor-not-allowed`, tooltip explaining prerequisite action. | Tooltip clarifies what prerequisite must be completed (e.g., "Complete outline before proceeding"). |

### 8.1 Responsive Adaptations
- **Desktop (≥ 1024px)**: Full multi-pane workspace with permanent navigation rails and side-by-side editing/evidence panels.
- **Tablet (768px - 1023px)**: Collapsible navigation rail; panels stack into tabs; Copilot opens as a full-height overlay drawer.
- **Mobile (< 768px)**: Activates **Scholar Pocket** companion view (`PocketApp.tsx`): Focuses on reviewing drafts, approving discovered sources, viewing reading lists, and quick Copilot queries rather than intensive desktop drafting.
