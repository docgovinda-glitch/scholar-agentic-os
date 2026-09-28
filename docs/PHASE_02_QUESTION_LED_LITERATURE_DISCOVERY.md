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

## 7. Workspace User Interface

### 7.1 Interactive Matrix Table View
The Workspace Table View provides a side-by-side comparison matrix of discovered sources:

| Source | Year | Relevance | Role in Assignment | Venue / Publisher | Methodology | Citations | Actions |
| :--- | :---: | :---: | :---: | :--- | :--- | :---: | :---: |
| Recent relevant study | `2026 Recent` | `Very High` | `Empirical evidence` | International Security | Mixed-Methods | 42 | ⭐ Approve |
| Recent theoretical study | `2025` | `High` | `Theoretical framework` | Foreign Affairs | Qualitative | 89 | ⭐ Approve |
| Relevant comparative study | `2025` | `High` | `Comparative evidence` | World Politics | Comparative Case | 67 | ⭐ Approve |
| Foundational study | `1999 Foundational` | `High` | `Core theory` | Cambridge University Press | Theoretical | 4,120 | ⭐ Approve |

### 7.2 Multi-View Synchronized Surfaces
- **Card View** ([`CuratedSourceCard.tsx`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/desk/assignment/components/CuratedSourceCard.tsx)): Features the "How it supports your assignment prompt" alignment box, role badge, 2026 recency tag, and expandable abstract.
- **List View** ([`CuratedSourceListView.tsx`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/desk/assignment/components/CuratedSourceListView.tsx)): Compact row representation with prompt part indicator (`🎯 supportsPart`).
- **Compact View** ([`CuratedSourceCompactView.tsx`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/desk/assignment/components/CuratedSourceCompactView.tsx)): High-density row view with status and role indicators.
- **Lecture / Course Source Uploader** ([`LectureUploadDropzone.tsx`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/desk/assignment/components/LectureUploadDropzone.tsx)): Clean drag-and-drop workspace uploader with background evidence chunking and instant visible uploaded item status pills.

---

## 8. Verification and Quality Gates

| Test Suite | File | Tests | Status |
| :--- | :--- | :---: | :---: |
| Question-Led Discovery | `src/desk/assignment/__tests__/Phase2QuestionLedLiteratureDiscovery.test.tsx` | 8 | ✅ Pass |
| Curated Discovery & Quality | `src/desk/assignment/__tests__/AssignmentCuratedLiteratureDiscovery.test.tsx` | 17 | ✅ Pass |
| End-to-End Workflow | `src/desk/assignment/__tests__/AssignmentE2EFlow.test.tsx` | 24 | ✅ Pass |
| Full Assignment Suite | `src/desk/assignment/__tests__/*.test.tsx` | 144 | ✅ Pass (18/18 files) |
| TypeScript Typecheck | `npx tsc --noEmit` | — | ✅ 0 errors |
