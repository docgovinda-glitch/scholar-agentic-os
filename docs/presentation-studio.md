# Scholar OS Presentation Studio Specification

## 1. Overview & Architecture

Scholar OS **Presentation Studio** is a web-native, academic-grade slide authoring and delivery suite. It replaces dated legacy slide wizards with an intuitive **4-Step Guided Studio** modeled on the UX of Scholar OS Coursework and Essay drafting environments.

```
01 Scaffolding ──▶ 02 Themes & Templates ──▶ 03 Canvas Studio ──▶ 04 Delivery & Export
```

### Core Design Pillars
1. **Universal 5-Beat Narrative Deconstruction**: Transforms complex academic theses into high-impact, single-idea slides.
2. **Cognitive Presentation Guardrails**: Eliminates slide clutter via 1-idea constraints, Action Headlines (30–40pt scale), strict 6x6 bullet constraints, and the 3-Second Billboard Filter.
3. **60/30/10 Visual Distribution & BYOT**: Enforces harmonious visual hierarchy (60% background canvas, 30% structural elevated card, 10% accent signal) with WCAG AA contrast ratio validation.
4. **100% WYSIWYG Editable Card Canvas**: Direct inline editing with live word-count warning badges and an in-slide AI prompt copilot.
5. **Dual-Mode Consumption**: Instant switching between minimal live **Stage View** and citation-rich **Leave-Behind View**.
6. **PostgreSQL Persistence with Debounced Autosave**: Automatic 500ms debounced synchronization via `/api/presentations/:id`.

---

## 2. The 4-Step Guided Workflow

### Step 01: Scaffolding & Decomposition (`Step01Scaffolding.tsx`)
- **Intake Modes**:
  - **Academic Topic Prompt**: Generates complete 5-beat academic presentation decks from freeform topic titles (e.g., *"Quantum Computing & Fault-Tolerant Cryptographic Verification"*, *"Corporate Restructuring Under High Rates"*, *"Biomedical Ethics in Autonomous Clinical Trials"*).
  - **Raw Coursework / Draft Markdown**: Ingests draft sections, decomposing headings and text into single-idea slides.
- **Cognitive Frameworks**:
  - `Universal-5Beat` (Default)
  - `SCR` (Situation · Complication · Resolution)
  - `WhatIsCouldBe` ("What Is" vs. "What Could Be")
  - `ABT` (And · But · Therefore)
- **Live Preview Rail**: Displays thumbnail cards of the 5 beats with action headlines, layout types, and delivery notes.

### Step 02: Theme Studio & Bring Your Own Template (`Step02ThemeTemplate.tsx`)
- **Preset Academic Themes (60/30/10 Rule)**:
  - **Sand Academic** (`#F7F5F0` ground, `#FFFFFF` elevated card, `#0F172A` text, `#2563EB` signal).
  - **Minimal Slate** (`#F1F5F9` ground, `#FFFFFF` elevated card, `#1E293B` text, `#0F172A` signal).
  - **Deep Charcoal** (`#171717` ground, `#1C1C1E` elevated card, `#F8FAFC` text, `#60A5FA` signal).
  - **Editorial Warm** (`#FAF8F5` ground, `#FFFDF9` elevated card, `#292524` text, `#C2410C` signal).
- **Bring Your Own Template (BYOT)**:
  - Custom color picker with real-time **WCAG AA contrast validation badge** (`≥ 4.5:1` ratio against elevated cards).
  - Typography pairings: `Inter`, `Helvetica Neue`, `Noto Sans`, `Newsreader Serif`.
  - Surface treatment toggle: **Subtle Elevation** (`shadow-xl`) or **Hairline Divider** (`border-neutral-200/80` light, `border-white/10` dark).

### Step 03: 100% WYSIWYG Editable Studio & Copilot (`Step03StudioCanvas.tsx`)
- **Direct Canvas Editing**:
  - Action Headlines: Editable text area at 30pt–40pt typographic scale.
  - Category Badges: Click-to-edit category tags.
  - 6x6 Bullet Constraint: Inline list items with real-time word-count badges alerting when any bullet exceeds 6 words.
  - Big Metric Callout: Editable metric value (`text-5xl md:text-7xl font-black`) and context description.
  - 2-Column Comparative: Side-by-side editable headers and bullet arrays.
  - Bottom Drawer: Rehearsal notes and word-for-word delivery cues.
- **In-Slide AI Prompt Copilot**:
  - Prompt bar embedded at the base of the active slide card.
  - Natural language mutations dispatch immediately to local state and PostgreSQL (e.g., *"Convert bullets to a 4.2x metric callout"*, *"Make this slide a 2-column comparison"*, *"Condense into 6-word action bullets"*).
- **Dynamic Layout Switcher**:
  - Segmented control to toggle between `Header & 6x6 Bullets`, `Big Metric Focus`, `2-Column Comparative`, and `Quote / Evidence`.
- **Slide Navigation Rail**:
  - Add, reorder, duplicate, and delete slide cards.

### Step 04: Delivery & Presentation Mode (`Step04Delivery.tsx`)
- **Presentation Engine**: Fullscreen slide projection with keyboard shortcut traversal.
- **Rehearsal Timer**: Integrated elapsed timer in `MM:SS` with pause and reset controls.
- **Speaker Delivery Script**: Floating drawer (`KeyP`) displaying word-for-word speech cues and target durations.
- **Dual Consumption Modes**:
  - **Stage View**: Minimal visual soundtrack designed for live speaking without clutter.
  - **Leave-Behind View**: Displays methodology notes, citations, and research provenance.
- **Export Formats**:
  - JSON deck export.
  - Marp-compatible Markdown export.

---

## 3. Universal 5-Beat Narrative Breakdown Engine

| Beat | Narrative Role | Visual Layout Focus | Cognitive Requirement |
| :--- | :--- | :--- | :--- |
| **Beat 1: The Action Hook** | Establishes immediate empirical authority | Big Metric Focus (`4.2x`, `84%`, etc.) | Answers: *What is the singular high-impact conclusion?* |
| **Beat 2: Tension & Context** | Unpacks current operational friction | Action Header & 6x6 Bullets | Establishes the cost of inaction before the solution |
| **Beat 3: The Mechanical Principle** | Explains the underlying theory/mechanism | 2-Column Comparative Layout | Side-by-side contrast: Baseline vs. Grounded model |
| **Beat 4: Empirical Proof & Case Studies** | Humanized real-world validation | Benchmark Metrics & Bullets | Verifiable trials avoiding raw data dumps |
| **Beat 5: Strategic Horizon & Synthesis** | Actionable roadmap and next steps | Strategic Roadmap Bullets | Concrete research and deployment milestones |

### Cognitive Guardrails
- **Action Headlines**: Automatic transformation of passive topic labels (e.g., *"The Problem"*, *"Overview"*, *"Results"*) into pre-digested analytical assertions.
- **6x6 Bullet Constraint**: Strictly enforced limit of 6 bullets per list, 6 words per bullet.
- **3-Second Billboard Filter**: Explanatory paragraphs (> 2 lines) are routed into `speakerNotes` rather than the slide canvas.

---

## 4. Keyboard Shortcuts Reference

| Key Combination | Action | Isolation Scope |
| :--- | :--- | :--- |
| `ArrowRight` / `Space` / `PageDown` | Advance to next slide | Disabled when typing in `<input>`, `<textarea>`, or contenteditable |
| `ArrowLeft` / `PageUp` | Return to previous slide | Disabled when typing in `<input>`, `<textarea>`, or contenteditable |
| `Home` | Jump to first slide | Disabled when typing in `<input>`, `<textarea>`, or contenteditable |
| `End` | Jump to last slide | Disabled when typing in `<input>`, `<textarea>`, or contenteditable |
| `KeyF` / `f` | Toggle Fullscreen Mode | Global |
| `KeyP` / `p` | Toggle Speaker Notes Drawer | Global |
| `Escape` | Exit Fullscreen Mode | Global |

---

## 5. PostgreSQL Database Schema & Persistence

### Table: `presentation_decks`
```sql
CREATE TABLE IF NOT EXISTS presentation_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  topic VARCHAR(255),
  framework VARCHAR(50) DEFAULT 'Universal-5Beat',
  theme_id VARCHAR(50) DEFAULT 'sand-academic',
  custom_theme JSONB DEFAULT NULL,
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_module VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentation_decks_created_at ON presentation_decks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presentation_decks_topic ON presentation_decks(topic);
```

### REST API Endpoints (`server/routes/presentations.ts`)
- `GET /api/presentations`: List all decks ordered by `updated_at DESC`.
- `GET /api/presentations/:id`: Retrieve single presentation deck.
- `POST /api/presentations`: Create a new presentation deck.
- `PUT /api/presentations/:id`: Debounced autosave (500ms) for slides, themes, and metadata.
- `DELETE /api/presentations/:id`: Remove deck.
- `POST /api/presentations/:id/copilot`: Natural language in-slide transformation endpoint.
