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

### 2.3 Academic Writing Tone & Style Selector (`WritingToneSelector.tsx`)
Configures writing style parameters persisted into `state.brief.writingTone` to guide the Phase 3 drafting engine and AI copilot:
- **Preset Academic Tones**:
  1. **Scholarly & Rigorous** (Default): Formal, authoritative third-person, dense academic vocabulary.
  2. **Critical & Evaluative**: Interrogates theoretical frameworks, emphasizes counter-arguments and methodological limitations.
  3. **Objective & Analytical**: Data-focused, empirical, neutral syntax, clear causal linkages.
  4. **Applied & Reflective**: Balanced first/third-person tailored for professional practice, education, clinical nursing, or case studies.
- **"Match My Writing Style" (Custom Upload / Paste)**:
  - Allows students to paste a sample excerpt (~200–500 words) from their past writing or upload a sample document (`.docx`, `.pdf`, `.txt`).
  - Automatically analyzes word count, lexical density, and register notes to replicate the student's authentic academic voice in Phase 3.

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
export interface SectionBudgetItem {
  id: string;
  title: string;
  targetWordCount: number;
  isCustom?: boolean;
}

export type WritingTonePreset =
  | 'scholarly_rigorous'
  | 'critical_evaluative'
  | 'objective_analytical'
  | 'applied_reflective'
  | 'custom_sample';

export interface WritingToneConfig {
  preset: WritingTonePreset;
  customSampleText?: string;
  customSampleFileName?: string;
  styleNotes?: string;
}

export interface AssignmentBriefState {
  rawPrompt: string;
  academicLevel: AcademicLevel;
  assignmentType: AssignmentType;
  targetWordCount: number;
  wordBudget: AssignmentWordBudget;
  sectionBudgets?: SectionBudgetItem[];
  writingTone?: WritingToneConfig;
  citationStyle: string;
  // ... course & rubric details
}
```

---

## 4. Verification & Testing

- **TypeScript Typecheck**: `npx tsc --noEmit` → **0 errors**.
- **Vitest Suite**: `npx vitest run src/desk/assignment` → **16/16 test files passed, 132/132 tests passing**.
- **Production Build**: `npm run build` → **Compiled cleanly in 5.19s**.
- **Database Migrations**: `SUPABASE_ACCESS_TOKEN=... npx supabase db push` → **Remote database up to date**.
