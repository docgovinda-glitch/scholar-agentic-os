# Application Workflows

This document specifies the step-by-step user journeys and system processing flows currently active in **Scholar Core**.

---

## 1. Authentication & Onboarding Workflow

### Workflow Structure
```text
Landing / Auth Page
       ↓
User Submission (with Turnstile CAPTCHA)
       ↓
Backend Verification & Supabase Auth
       ↓
Onboarding Profile Form
       ↓
AI Setup Interstitial (if unconfigured)
       ↓
Knowledge Vault Setup Offer (if unconfigured)
       ↓
Project Dashboard (/projects)
```

### Steps
1. **Entry**:
   - User visits `/` (or clicks "Get Started" / "Sign In").
2. **User Action**:
   - Enters email, password, and completes Cloudflare Turnstile CAPTCHA verification widget.
3. **System Processing**:
   - Frontend validates client form fields.
   - Server verifies Turnstile token with Cloudflare (`/api/auth/verify-signup`).
   - Supabase Auth creates user record and returns JWT session.
4. **Result**:
   - User session is established in browser local state.
5. **Next Available Action**:
   - If user profile is incomplete, user is redirected to `/onboarding`.
   - Onboarding collects: Full Name, Role (Undergraduate, Postgraduate, PhD, Faculty), Institution, Primary Discipline, and Preferred Citation Style.
   - If AI provider is unconfigured, `<OnboardingGate>` renders AI Access onboarding.
   - Once completed, user arrives at the Project Dashboard (`/projects`).

---

## 2. Project Creation Workflow

### Workflow Structure
```text
Project Dashboard (/projects)
       ↓
Click "+ New Project"
       ↓
Select Deliverable Format & Set Parameters
       ↓
System Initialises Project Record
       ↓
Redirect to Dedicated Workspace (/projects/:projectId)
```

### Steps
1. **Entry**:
   - User clicks `+ New Project` on the dashboard or visits deep-link `/projects?newFormat=OT-01`.
2. **User Action**:
   - Selects deliverable format (e.g. `Coursework & Essay (OT-01)`, `Journal Article (OT-10)`, `Research Proposal (OT-19)`, `Academic Presentation (OT-22)`).
   - Inputs Title, Target Word Count, Academic Level, and Citation Style.
   - Clicks `Create Project`.
3. **System Processing**:
   - Frontend executes `POST /api/projects`.
   - Backend creates record in `public.projects`.
   - For `OT-01`, backend also initializes the 4-phase state structure in `public.assignment_projects`.
4. **Result**:
   - Project is created with unique UUID.
5. **Next Available Action**:
   - Browser navigates directly to `/projects/:projectId`, mounting the format-tailored workspace.

---

## 3. Coursework & Essay Workflow (`OT-01`)

The Coursework & Essay module guides students through 4 interconnected phases:

```text
Phase 1: Understand & Structure
             ↓
Phase 2: Sources & Literature Discovery
             ↓
Phase 3: Drafting & Section Planner
             ↓
Phase 4: Submission & Verification Audit
```

---

### 3.1 Phase 1: Understand & Structure
 
1. **Unified Setup & Question Input**:
   - **User Action**: Pastes the assignment question/prompt (or uploads brief document `.pdf`, `.docx`), sets target word count via interactive stepper (`−`/`+`) or numeric input, and selects Academic Level, Assignment Type, Citation Style, and Writing Tone within the unified setup box.
   - **Result**: Context parameters and prompt are staged cleanly in a single workspace component without rigid 2000-word limits, dynamically driving downstream section budgets and drafting compliance gates.
2. **Brief-Specific Structure Generation**:
   - **User Action**: Clicks `Save & Build`.
   - **System Processing**: Client and server outline services display an animated loading state (*"Analyzing Brief & Generating Tailored Assignment Structure..."*). The engine extracts inquiry directives, sentence questions ending in `?`, domain acronyms, and technical terms directly from the brief text (`extractBriefInquiriesAndConcepts`, `buildBriefSpecificSpecs`). Bespoke H1/H2/H3 structures are generated that substantively mirror the assignment brief's requirements without generic Introduction/Body/Conclusion placeholders.
   - **Result**: The tailored structure displays immediately in the unified workspace via `DynamicStructurePlanner`.
3. **Structure Customization & Word Count Allocation (CRUD)**:
   - **User Action**: User edits heading/subheading titles inline with visual edit affordances, adds/deletes headings and nested subheadings without restrictive length barriers, reorders sections with Up/Down buttons, and calibrates word allocations using section-level (`-50`/`+50`), subheading-level (`-50`/`+50`), or direct numeric inputs.
   - **Dynamic Word Status & Auto-Balancing**: Live status bar tracks `Target: X words · Allocated: Y words · Remaining: Z words (or Over: W words / Balanced)`. 1-click `Auto-Balance` proportionally synchronizes all section allocations to match the user's target word count.
4. **Voice & Tone Selection**:
   - **User Action**: Selects an academic style (e.g. *Analytical*, *Argumentative*, *Critical*, *Natural & Engaging*, or *Match My Writing*).
5. **Phase Progression & Canonical Persistence**:
   - **User Action**: Clicks `Proceed` (formerly "Confirm Structure & Proceed to Sources").
   - **System Processing**: The confirmed structure with stable internal IDs is saved into canonical project keys (`assignment_structure`, `structure`, `sectionBudgets`, `assignment_internal_sections`, `targetWordCount`, `word_count`, `word_limit`).
   - **Result**: Phase 1 is completed; Phase 2 unlocks using the exact confirmed structure.

---

### 3.2 Phase 2: Sources & Literature Discovery

1. **Question Deconstruction & Search**:
   - **User Action**: Clicks `Run Scholarly Discovery` or adds lecture materials.
   - **System Processing**: Server invokes `scholarlyDiscoveryService.ts`. The prompt is deconstructed into core conceptual entities, explanatory variables, and disciplinary bounds. The system searches OpenAlex/Crossref, prioritizing recent empirical literature (2024-2026) alongside seminal classics.
   - **Result**: Discovered literature cards appear in a 2-column grid (`CuratedSourceCard`), tagged with roles (`Empirical evidence`, `Theoretical framework`, `Core theory`) and "Why this source?" justifications.
2. **Lecture Material Ingestion**:
   - **User Action**: User drops lecture slides (`.pptx`, `.pdf`) or syllabus files into `LectureUploadDropzone`.
   - **System Processing**: Files are parsed, chunked, and stored with source badge `USER UPLOADED`.
3. **Evidence Approval**:
   - **User Action**: User reviews cards, clicks `+ Add Source` to assign them to specific Phase 1 subheadings.
   - **Result**: Approved sources populate the `ApprovedReferencesShelf`. Subheading indicators change from `⚪ Not researched` to `🟢 Sufficient evidence`.
4. **Phase Progression**:
   - **User Action**: Clicks `Proceed to Phase 3 Drafting`.

---

### 3.3 Phase 3: Drafting

1. **Section Selection**:
   - **User Action**: Selects a subheading from the `DraftingSectionIndex` navigation rail.
2. **Evidence-Guided Drafting**:
   - **User Action**: Clicks `Generate Section Draft` or drafts manually in the TipTap canvas.
   - **System Processing**: If AI drafting is requested, the system prompts the language engine with:
     - The active subheading title and author notes.
     - Section word budget constraints.
     - Selected writing tone and stylistic voice profile.
     - Approved evidence quotes and references assigned to this section.
   - **Result**: Generated text streams into the editor with formatted citations (e.g. `(Smith, 2024)`).
3. **Manual Citation Insertion**:
   - **User Action**: User opens the Evidence Drawer, selects a source, and clicks `Insert Citation` or `Insert Quote`.
   - **Result**: Pre-formatted citation is placed at the cursor.
4. **Progress Monitoring**:
   - **User Action**: User watches live word count dials comparing section actuals against target allocations.
5. **Phase Progression**:
   - **User Action**: Clicks `Proceed to Phase 4 Submission`.

---

### 3.4 Phase 4: Submission & Verification

1. **Rubric Compliance Evaluation**:
   - **User Action**: Clicks `Run Rubric Evaluation`.
   - **System Processing**: Server evaluates full draft against a 10-point academic rubric (Thesis clarity, argument progression, evidence density, critical depth, voice consistency).
   - **Result**: Detailed score report with strengths and actionable revision suggestions.
2. **Citation Reconciliation Audit**:
   - **User Action**: Views Citation Audit panel.
   - **System Processing**: System extracts all in-text citation patterns and cross-checks them against approved bibliography entries.
   - **Result**: Shows 100% match indicator or flags orphan citations.
3. **Document Export**:
   - **User Action**: Configures export options (Title Page, Table of Contents, Headers) and clicks `Download Word Document (.docx)` or `Download PDF`.
   - **System Processing**: Server or client builds structured `.docx` or PDF file using `docx` / `pdfmake`.
   - **Result**: File downloads to user's device.

---

## 4. Journal Article 25-Stage Pipeline Workflow (`OT-10`)

### 5-Phase Progression
```text
Phase I: Foundation (Stages 1-6)
   ↓
Phase II: Evidence (Stages 7-14)
   ↓
Phase III: Drafting (Stages 15-20)
   ↓
Phase IV: Review & Simulation (Stages 21-23)
   ↓
Phase V: Publication (Stages 24-25)
```

1. **Foundation**: User defines empirical domain, runs gap identification, and locks research question and working title.
2. **Evidence**: User connects Knowledge Vault sources, approves external empirical datasets, extracts quantitative/qualitative claims, and executes evidence analysis.
3. **Drafting**: User selects target journal to lock editorial guidelines, drafts empirical sections, audits citations, and previews the combined manuscript.
4. **Adversarial Peer Review Simulator**:
   - User clicks `Simulate Peer Review`.
   - 5 AI referee agents evaluate the paper:
     - Methodologist (evaluates rigor, sampling, and threats to validity)
     - Domain Specialist (checks literature coverage and theoretical contribution)
     - Biostatistician / Data Analyst (verifies quantitative interpretations)
     - Synthesizer (evaluates narrative flow and structural coherence)
     - Formal Editor (checks academic register and citation standards)
   - Generates simulated editorial decision: `Accept`, `Minor Revisions`, `Major Revisions`, or `Reject`.
5. **Publication**: User implements revision points, performs publication readiness audit, and exports submission-ready manuscript.

---

## 5. Knowledge Vault Ingestion Workflow

```text
Knowledge Vault Screen (/vault)
       ↓
Ingest Source (DOI, Cloud Drive, or BibTeX)
       ↓
System Fetches & Standardizes Metadata
       ↓
Canonical Reference Created in Vault
       ↓
Source Available for Linking across Projects
```

1. **Entry**: User navigates to `/vault`.
2. **User Action**:
   - **Option A (DOI)**: Enters DOI string (e.g., `10.1038/s41586-024-00000-0`).
   - **Option B (Cloud Drive)**: Connects Google Drive or pastes OneDrive share link.
   - **Option C (Reference File)**: Drops `.bib` (BibTeX) or `.ris` file.
3. **System Processing**:
   - For DOI: Calls Crossref / OpenAlex API via `/api/vault/doi`.
   - For Cloud Drive: Extracts file title and creates cloud pointer with authorized view link.
   - For BibTeX: Parses citation records into structured `CanonicalReference` objects.
   - Persists entry into `public.universal_vault_items` (storing metadata only, 0% proprietary full-text storage).
4. **Result**: Source appears in Vault list with citation pill, author list, year, and DOI link.
5. **Next Available Action**: Link source to active projects using the project selector.

---

## 6. AI Access & BYOK Management Workflow

```text
AI Access Screen (/ai-access)
       ↓
Select Provider (e.g. Anthropic, OpenAI, Gemini)
       ↓
Input API Key & Click "Test Key"
       ↓
System Executes Verification Probe
       ↓
Key Encrypted & Saved in User Settings
```

1. **Entry**: User navigates to `/ai-access/providers`.
2. **User Action**: Enters personal API key on provider card and clicks `Test Key`.
3. **System Processing**:
   - System calls `/api/ai/verify-key` with the key and provider name.
   - Executes a lightweight ping to the provider endpoint.
4. **Result**:
   - If valid: Green checkmark appears with response latency; key is envelope-encrypted and saved to user profile.
   - If invalid: Error banner displays exact provider error (e.g. `Invalid API Key`, `Quota Exceeded`).
5. **Next Available Action**: Select provider in Preferences tab as default for drafting or search.
