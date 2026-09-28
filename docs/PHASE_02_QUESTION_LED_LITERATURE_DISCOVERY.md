# Phase 02: Question-Led, Evidence-Oriented, Discipline-Aware & Recency-First Literature Discovery

**Scholar Core — Coursework & Essay Engine (`OT-01`)**
**Authoritative Architectural Specification — Revision 4.1 (2026)**

---

## 1. Executive Summary

Phase 02 (Curated Literature & Course Sources) replaces broad, disciplinary-based search queries with a **strictly question-led, evidence-oriented, discipline-aware, and recency-first discovery engine**.

Rather than searching broad academic disciplines (e.g. searching "International Relations" or "Political Science" in general), the engine decomposes the assignment question into its constituent **entities, variables, theoretical frameworks, geographic scope, and causal/comparative relationships**. The academic discipline serves exclusively as a **contextual constraint** governing scholarly venue credibility and peer-reviewed rigor. Literature is prioritized by **recency (2026/2025/2024 first)**, while anchoring foundational seminal works as **Core theory**.

---

## 2. Core Discovery Hierarchy

Source discovery follows a strict priority chain:

$$\text{Assignment Question} \longrightarrow \text{Key Concepts \& Variables} \longrightarrow \text{Research Requirements} \longrightarrow \text{Discipline Constraint} \longrightarrow \text{Relevant Literature} \longrightarrow \text{Recency}$$

```
+-------------------------------------------------------------+
|                     Assignment Question                     |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|    Question Deconstruction Engine                           |
|    - Primary Entities & Cases (e.g. Taiwan Strait, Ukraine) |
|    - Independent, Dependent, Explanatory Variables          |
|    - Theoretical Frameworks (Realism, Deterrence, PTT)       |
|    - Geographic Scope & Empirical Cases                     |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|    Discipline as Contextual Constraint                      |
|    - Venue credibility filter (APSR, International Security)|
|    - Entity guardrails (Blocks unrelated P5/BRI leakages)   |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|    Targeted Scholarly Retrieval & Synthesis                 |
|    - 2026 Recent Empirical Studies                          |
|    - 2025 Theoretical Framework Applications                |
|    - 2025 Comparative Evidence Papers                       |
|    - Seminal Anchors (1979/1999 Core Theory)                |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|    Relevance & Role Evaluation                              |
|    - Role in Assignment: Empirical, Theoretical, Core Theory|
|    - Relevance Category: Very High, High, Moderate          |
|    - Question Alignment: supportsPart, evidenceType         |
+-------------------------------------------------------------+
```

---

## 3. Question Deconstruction Engine

The discovery engine decomposes the user's assignment prompt into six structured research facets:

```typescript
export interface DeconstructedQuestion {
  primaryEntities: string[];    // e.g. ["China", "United States", "Taiwan"]
  keyConcepts: string[];        // e.g. ["balance of power", "deterrence", "escalation"]
  variables: {
    independent: string[];      // e.g. ["nuclear modernization", "economic coercion"]
    dependent: string[];        // e.g. ["crisis stability", "alliance cohesion"]
    explanatory: string[];      // e.g. ["miscalculation", "credibility"]
  };
  theories: string[];           // e.g. ["Power Transition Theory", "Deterrence Theory"]
  geographicScope: string;      // e.g. "Indo-Pacific" | "Eastern Europe" | "Global"
  cases: string[];              // e.g. ["2022 Russian Invasion", "Taiwan Strait"]
  relationships: string[];      // e.g. ["causal", "comparative"]
}
```

Implementation location: [`src/desk/assignment/services/scholarlyDiscoveryService.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/desk/assignment/services/scholarlyDiscoveryService.ts).

---

## 4. Discipline as Contextual Constraint

The discipline (e.g. *International Relations*, *Sociology*, *Economics*) is **not** the search topic. Instead, it:
1. Filters authoritative publishing venues and citation indices (e.g., *International Security*, *American Political Science Review*, *Foreign Affairs*, *Journal of Peace Research*, *Cambridge University Press*).
2. Enforces **Entity-Level Topic Guardrails**:
   - In prompts focused on Russia-Ukraine or South Asian nuclear deterrence, general IR literature regarding the UN Security Council veto or Chinese Belt and Road infrastructure is actively filtered out.
   - Prevents disciplinary noise from crowding out question-specific empirical evidence.

---

## 5. Recency-First Literature Ranking with Core Theory Anchors

The ranking algorithm ranks sources using a multi-factor scoring formula:

$$\text{Final Score} = \text{Question Relevance} + \text{Recency Weight} + \text{Seminal Core Theory Bonus}$$

* **2026/2025 Prioritization**: Recent studies receive a direct ranking boost, ensuring students have access to the latest peer-reviewed evidence and empirical datasets.
* **Core Theory Anchors**: Seminal foundational literature (e.g., Waltz 1979, Mearsheimer 2001, Keohane 1984) is categorized as `Core theory` and receives an anchor bonus so that students obtain essential theoretical foundations without displacing recent empirical studies.

---

## 6. Source Relevance and Assignment Role Evaluation

Every discovered source is evaluated and tagged with:
- **`roleInAssignment`**:
  - `Empirical evidence` (e.g., 2026 datasets and quantitative/qualitative findings)
  - `Theoretical framework` (e.g., 2025 theoretical model applications)
  - `Comparative evidence` (e.g., cross-national / cross-case comparisons)
  - `Core theory` (e.g., seminal foundational theory)
  - `Methodological framework`
  - `Contextual evidence`
- **`relevanceCategory`**:
  - `Very High` ($\ge 90$ match score)
  - `High` ($75 - 89$ match score)
  - `Moderate` ($< 75$ match score)
- **`questionAlignment`**:
  - `directScore`: Numerical prompt alignment score (0–100)
  - `supportsPart`: Direct prompt sub-question or concept addressed
  - `evidenceType`: Empirical, theoretical, comparative, or methodological

---

## 7. Workspace User Interface & Minimalist Card Grid

### 7.1 Streamlined Apple & Airbnb-Grade Card Grid
Step 02 eliminates dense view switchers, purple prose, and 41-source ghost states in favor of a clean, responsive 2-column card grid (`curated-sources-grid`):

- **Clean Typography & Hierarchy**: Strict alignment with Airbnb Typography and Apple design tokens (`--surface-canvas` `#F7F5F0`, `--surface-raised` `#FFFFFF`, `--color-border-subtle`).
- **Standardized Source Type Pills**: Clearly identifies `Journal`, `Book`, `Conference`, `Institutional`, or `Report` publications.
- **Evidence Role Badges**: Contextual tags indicating assignment function (`Empirical evidence`, `Theoretical framework`, `Core theory`, etc.).
- **Concise Scholarly Relevance**: Focused 2-line snippets explaining how the source contributes evidence directly to the student's assignment thesis.
- **Instant Toggle Actions**: One-click `+ Add Source` or `✓ Added` buttons that dynamically update evidence metrics and the top-bar drafting gate counter.

### 7.2 Core Step 02 Components
- **Curated Source Cards** ([`CuratedSourceCard.tsx`](file:///Users/aadityasah/Documents/Scholar%20Project/scholar-agentic-os/src/desk/assignment/components/CuratedSourceCard.tsx)): High-performance minimalist card rendering with author lists, year, venue, type pill, role badge, and toggle action.
- **Lecture & Materials Dropzone** ([`LectureUploadDropzone.tsx`](file:///Users/aadityasah/Documents/Scholar%20Project/scholar-agentic-os/src/desk/assignment/components/LectureUploadDropzone.tsx)): Single unified dropzone for syllabus, readings, and lecture slides with background evidence extraction.
- **Assignment Sources Stage** ([`AssignmentSourcesStage.tsx`](file:///Users/aadityasah/Documents/Scholar%20Project/scholar-agentic-os/src/desk/assignment/stages/AssignmentSourcesStage.tsx)): Step 02 stage manager orchestrating search query synthesis, literature generation, lecture chunking, and the `"Proceed to Drafting"` gate.

---

## 8. Verification and Quality Gates

| Test Suite | File | Tests | Status |
| :--- | :--- | :---: | :---: |
| Question-Led Discovery | `src/desk/assignment/__tests__/Phase2QuestionLedLiteratureDiscovery.test.tsx` | 8 | ✅ Pass |
| Curated Discovery & Quality | `src/desk/assignment/__tests__/AssignmentCuratedLiteratureDiscovery.test.tsx` | 17 | ✅ Pass |
| Phase 1 & 2 Integrated Flow | `src/desk/assignment/__tests__/AssignmentPhase1And2Flow.test.tsx` | 6 | ✅ Pass |
| End-to-End Workflow | `src/desk/assignment/__tests__/AssignmentE2EFlow.test.tsx` | 24 | ✅ Pass |
| Full Assignment Test Suite | `src/desk/assignment/__tests__/*.test.tsx` | **148** | ✅ **Pass (19/19 files)** |
| TypeScript Production Build | `npm run build` | — | ✅ 0 errors |
