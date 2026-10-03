# Scholar OS Presentation Studio Specification

## 1. Overview & Architecture

Scholar OS **Presentation Studio** is a web-native, academic-grade slide authoring and delivery suite. It aligns with the design system and intuitive UX of Scholar OS Coursework and Essay drafting environments, purging academic jargon, developer database leakages, and feature bloat.

```
01 Understand ──▶ 02 Design ──▶ 03 Edit Slides ──▶ 04 Present
```

### Core Design Pillars
1. **Coursework & Essay UX Alignment**: Replaces confusing jargon (*"Scaffolding"*, *"Decomposition"*, *"5-Beat Narrative"*) with clean English (*"Understand"*, *"Topic"*, *"Key Points"*).
2. **Subtle & Private Auto-Save**: Replaces developer database strings (`"Saved to PostgreSQL"`) with a quiet, non-intrusive status indicator (`"All changes saved"` or `"Saving changes..."`) with a clean green/amber status dot.
3. **Four Curated Design Themes & Custom Accent**: Replaces 20+ filter chips and AI cloners with 4 aesthetic presets (`Sand Academic`, `Minimal Clean`, `Editorial Warm`, `Deep Midnight`) plus an accessible custom accent color picker with live WCAG AA contrast calculation.
4. **Native Image Upload & Split-Media Layouts**: First-class support for `Split Image + Text` (`image-split`) and hero layouts with drag-and-drop file upload (`.png`, `.jpg`, `.webp`), URL input, responsive `16:9`/`4:3` aspect ratios, and editable captions.
5. **Human, Natural Slide Titles**: Concise headline generation (max 8–10 words) stating immediate conclusions rather than AI word salads.
6. **Purged Feature Bloat**: Completely removed unnecessary extras such as `Defense Tools` dropdowns, 22 filter chips, and AI theme cloners.

---

## 2. The 4-Step Guided Workflow

### Step 01: Understand Your Presentation (`Step01Understand.tsx`)
- **Intake Modes**:
  - **📁 Upload Brief or Paper (.pdf, .docx, .txt, .md)**: Drag-and-drop document upload (up to 50MB) with automatic word count detection, excerpt preview, auto-detected title, and slide generation.
  - **🎯 Presentation Topic or Question**: Generates clean slide outlines from natural topic inputs (e.g., *"Why Zappos Pays New Hires to Quit"*, *"Quantum Computing & Cryptographic Verification"*).
  - **📄 Raw Notes / Draft Markdown**: Ingests draft sections and bullet points.
- **Presentation Style Selector**:
  - `Standard Story` (Context → Problem → Evidence → Solution → Takeaway)
  - `Problem & Solution` (Executive briefing & immediate resolution)
  - `Comparison` (Side-by-side analysis & evaluation)
- **Outline Preview Cards**:
  - Displays slide cards with natural takeaways and 1-idea-per-slide clarity, avoiding repetitive *"Key Insight 1: Grounded Analysis..."* boilerplate.

### Step 02: Design Themes & Visual Direction (`Step02ThemeTemplate.tsx`)
- **4 Curated Academic Presets**:
  1. **Sand Academic** (`#F7F5F0` light canvas, `#FFFFFF` crisp card, slate text, `#2563EB` royal blue accent).
  2. **Minimal Clean** (`#FFFFFF` background, `#FAFAFA` elevated card, sharp dark gray typography `#1E293B`, subtle hairline borders).
  3. **Editorial Warm** (`#FAF8F5` canvas, `#FFFDF9` cream card, rich charcoal text `#292524`, `#C2410C` warm terracotta accent).
  4. **Deep Midnight** (`#171717` dark canvas, `#1C1C1E` elevated card, light gray text `#F8FAFC`, `#38BDF8` sky blue accent).
- **Custom Accent Picker**:
  - Preset color swatches (Royal Blue, Terracotta, Emerald, Violet, Sky Blue, Tomato Red, Solid Black).
  - Native HTML5 color picker.
  - Real-time **WCAG AA contrast calculation** badge (`≥ 4.5:1` ratio against cards).

### Step 03: Edit Slides (`Step03StudioCanvas.tsx`)
- **100% WYSIWYG Editable Card Canvas**:
  - Click-to-edit Action Headlines at 30–40pt typographic scale.
  - Click-to-edit Category Badges.
  - 6x6 Bullet Constraint: Inline items with live word-count alert badges (`⚠️ >6 words`).
  - Big Metric Focus: Editable metric stat and empirical context note.
  - 2-Column Comparison: Side-by-side editable headers and bullet arrays.
  - Quote / Highlight: Editable quote text and attribution.
- **Split Image + Text Layout (`image-split`)**:
  - Left: 50% responsive image container with `16:9` / `4:3` aspect ratio, rounded corners, hairline borders, and hover replace/remove controls.
  - Right: Key bullet points with real-time word counting.
  - Local image upload (`.png`, `.jpg`, `.webp`), image URL input, and editable figure caption.
- **In-Slide AI Prompt Copilot**:
  - Clean input bar with one-click quick actions (*"Add an image to this slide"*, *"Change to 2 columns"*, *"Focus on big metric"*, *"Shorten bullets"*).
- **Speaker Rehearsal Notes Drawer**:
  - Expandable bottom drawer for word-for-word delivery cues and timing reminders.

### Step 04: Present (`Step04Delivery.tsx`)
- **Presentation Engine**: Fullscreen slide projection with keyboard shortcut traversal.
- **Rehearsal Timer**: Integrated elapsed timer in `MM:SS` with pause and reset controls.
- **Speaker Delivery Script**: Word-for-word speech cues and target durations.
- **Dual Consumption Modes**:
  - **Stage View**: Minimal visual soundtrack designed for live speaking.
  - **Leave-Behind View**: Displays methodology notes, citations, and research provenance.
- **Export Formats**:
  - JSON deck export.
  - Marp-compatible Markdown export.

---

## 3. Natural Slide Headline Generator (`slideTitleGenerator.ts`)

Replaces run-on academic jargon with punchy, human titles (max 8–10 words):
- *"Autonomous Knowledge Grounding in Multi-Agent Scientific Synthesis Solves Fundamental"* ➔ **"How Multi-Agent Systems Verify Scientific Papers"**
- Repetitive *"Key Insight 1: Grounded Analysis of MN6094NI"* ➔ **"Why Zappos Pays New Hires to Quit"**

---

## 4. Keyboard Shortcuts Reference

| Key Combination | Action | Scope |
| :--- | :--- | :--- |
| `ArrowRight` / `Space` / `PageDown` | Advance to next slide | Disabled when editing text |
| `ArrowLeft` / `PageUp` | Return to previous slide | Disabled when editing text |
| `Home` | Jump to first slide | Disabled when editing text |
| `End` | Jump to last slide | Disabled when editing text |
| `KeyF` / `f` | Toggle Fullscreen Mode | Global |
