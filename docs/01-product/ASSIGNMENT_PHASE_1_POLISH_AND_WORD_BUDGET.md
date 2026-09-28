# Assignment Workspace — Phase 1 (Understand) UI Polish, Editable Word Budget & Writing Tone

**Document Version**: 1.0  
**Updated**: September 2026  
**Status**: Implemented & Verified (16/16 Test Suites, 132/132 Vitest Tests Passing)

---

## 1. Executive Summary

Phase 1 (`AssignmentUnderstandStage.tsx`) of the Coursework & Essay Engine (`OT-01`) has been refactored to eliminate visual clutter, provide direct word count editing with custom sections (`+ Add Section`), integrate an Academic Writing Tone & Style Selector (with sample paste/upload analysis), streamline the Advisor copilot panel branding, and ensure seamless JSONB state persistence in Supabase `assignment_projects`.

---

## 2. Key Architectural Updates

### 2.1 Header & Canvas Decluttering
- **Single Source of Truth for Word Count**: The duplicate `0 / 2,000 words` counter in the global workspace header (`AssignmentWorkspace.tsx`) has been purged. The word progress badge lives exclusively on the right rail of `AssignmentStageNavigation.tsx`.
- **Streamlined Assessment Brief Intake**:
  - Replaced the monolithic input area with a clean dual-tab card: `[ Paste Prompt ]` vs. `[ Upload Brief Document (.pdf, .docx) ]`.
  - Supports direct drag-and-drop / file upload with client-side and server-side text extraction.
- **Compact Calibration Controls**:
  - Academic Level (`Undergraduate` / `Postgraduate`), Assignment Type dropdown, and Citation Style dropdown are aligned horizontally in a compact, unified card.
- **Collapsible Secondary Metadata**:
  - Course Code, University / Institution, Deadline, and Marking Rubric criteria are neatly collapsed inside `+ Additional Course Details & Rubric (Optional)`.

---

### 2.2 Dynamic Word Budget Planner (`SectionBudgetPlanner.tsx`)
- **Default Baseline Allocation**:
  - Introduction (~10%)
  - Body Paragraphs (~80%)
  - Conclusion (~10%)
- **Direct Word Count Editing**:
  - Users can click and directly edit the target word count number for any section with instant live recalculation.
- **Custom Section Adder (`+ Add Section`)**:
  - Students can add custom sections or sub-headings (e.g., "Literature Review", "Methodology", "Empirical Evaluation", "Case Analysis").
  - Each custom section row includes an editable title, an editable target word count, and a delete action (`trash` icon).
- **Live Validation & Auto-Balancing**:
  - Displays a real-time badge comparing total allocated section words against the project target word count (e.g., `Allocated: 2,000 / 2,000 words`).
  - Includes an "Auto-balance" tool that proportionally redistributes words when the allocation is over or under budget.

---

### 2.3 Academic Writing Tone & Style Selector (`WritingStyleSelector.tsx`)
Configures writing style parameters persisted into `state.brief.writingStyle` and `state.brief.writingTone` to guide the Phase 3 drafting engine and AI copilot:
- **6 Human-Sounding Academic Styles**:
  1. **Analytical**: Breaks down causes, patterns, and connections between concepts.
     - *Example*: *"Local grocers lose market share primarily because digital platforms eliminate travel and checkout friction for suburban households."*
  2. **Argumentative**: Takes a clear stance, defends a thesis, and addresses counter-arguments.
     - *Example*: *"While physical stores emphasize personalized service, convenience and price discounts consistently override customer loyalty."*
  3. **Critical**: Questions assumptions, weighs trade-offs, and exposes flaws or limitations.
     - *Example*: *"Reports celebrating delivery convenience overlook hidden trade-offs; platform subscription fees frequently make online orders more expensive than local shopping."*
  4. **Expository**: Explains concepts clearly, directly, and authoritatively without dense jargon.
     - *Example*: *"Online platforms dominate grocery retail through bulk purchasing, centralized warehousing, and automated dispatch systems."*
  5. **Natural & Engaging (Human Voice)**: Authentic, conversational academic rhythm. Avoids predictable AI clichés ("delve", "testament", "multifaceted") while remaining credible.
     - *Example*: *"Most shoppers leave local grocers for a simple reason: after a long workday, seamless doorstep delivery beats community loyalty every time."*
  6. **Match My Writing (Custom Voice)**: Clones your natural sentence structure, pacing, and vocabulary level.
     - *Interface*: Clean dual-input area with paste textarea (200–500 words) and file dropzone (`.docx`, `.pdf`, `.txt`, `.md`).

---

### 2.4 Advisor Copilot Branding & Polish (`ContextPanel.tsx`)
- **Brand Identity**: Replaced generic book/star icon with official `<ScholarCoreLogo size="sm" withText={false} />`.
- **Sidebar Efficiency**: Removed redundant `"Stage Context"` info card to maximize vertical chat space.
- **Refined Quick Actions**:
  - `"Analyze prompt & key command verbs"`
  - `"Recommend writing tone for this brief"`
  - `"Auto-detect rubric grading criteria"`

---

## 3. Data Schema & Persistence

All new fields are fully serializable and safely persisted into the `brief` column of the `assignment_projects` PostgreSQL table (Supabase JSONB):

```typescript
export type WritingStylePreset =
  | 'analytical'
  | 'argumentative'
  | 'critical'
  | 'expository'
  | 'natural'
  | 'custom';

export interface WritingStyleConfig {
  preset: WritingStylePreset;
  customSampleText?: string;
  customFileName?: string;
  description?: string;
}

export interface SectionBudgetItem {
  id: string;
  title: string;
  targetWordCount: number;
  isCustom?: boolean;
}

export interface AssignmentBriefState {
  rawPrompt: string;
  academicLevel: AcademicLevel;
  assignmentType: AssignmentType;
  targetWordCount: number;
  wordBudget: AssignmentWordBudget;
  sectionBudgets?: SectionBudgetItem[];
  writingStyle?: WritingStyleConfig;
  writingTone?: WritingToneConfig;
  citationStyle: string;
  // ... course & rubric details
}
```

---

## 4. Verification & Testing

- **TypeScript Typecheck**: `npx tsc --noEmit` → **0 errors**.
- **Vitest Suite**: `npx vitest run src/desk/assignment` → **17/17 test files passed, 137/137 tests passing**.
- **Production Build**: `npm run build` → **Compiled cleanly in 4.85s**.
- **Database Migrations**: `SUPABASE_ACCESS_TOKEN=... npx supabase db push` → **Remote database up to date**.
