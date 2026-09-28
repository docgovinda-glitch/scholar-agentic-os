# Scholar OS — Core Design System, Tokens & UI Component Primitives Audit

> **Authoritative Reference & Visual Architecture Audit**  
> **Status:** Production Reference Artifact  
> **Generated:** 2026-09-28  
> **Scope:** Theme Configuration, CSS Custom Properties, Typography Scale, Elevation, UI Primitives, and Visual Debt  
> **Authority Decisions:** `docs/06-decisions/60-DESIGN-DIRECTION.md`, `docs/06-decisions/64-SCIENTIFIC-MONOCHROME.md`, `docs/DAY_NIGHT_THEME_SYSTEM_SPECIFICATION.md`, `docs/AIRBNB_TYPOGRAPHY_DESIGN_SYSTEM.md`

---

## Executive Summary

This document establishes the centralized architectural baseline for Scholar OS's visual language, token system, and UI component primitives. It compiles a read-only audit across `src/index.css`, `vite.config.ts`, `scripts/verify-contrast.mjs`, and all 64+ React `.tsx` component modules in `src/`.

Scholar OS operates on **Tailwind CSS v4** (`@tailwindcss/vite: ^4.1.14`) coupled with native CSS custom properties. It delivers a dual-theme aesthetic: **Day Mode (Sand & Snow `#F7F5F0` / `#FFFFFF`)** designed for long-form academic reading and low cognitive strain, and **Night Mode (Charcoal & Slate `#171717` / `#1C1C1E`)** inspired by modern conversational AI canvases (e.g., ChatGPT and Claude).

---

## 1. Color Hierarchy & Surfaces

### 1.1 Styling Engine Architecture
- **Engine**: Tailwind CSS v4 (`@tailwindcss/vite`) imported via `@import "tailwindcss";` in `src/index.css`.
- **Configuration File**: Zero `tailwind.config.{js,ts}` file exists. All theme variables, variants, and custom properties are declared directly inside `src/index.css`.
- **Dark Mode Variant**: Declared via `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *, .dark, .dark *));`. This enables both the class-based `.dark` and the attribute-based `[data-theme="dark"]` DOM selectors.
- **Pre-Paint Hydration**: Managed by an inline script in `index.html` reading `localStorage.getItem("scholar-theme")` to eliminate Flash of Unstyled Content (FOUC). Verified by automated SHA-256 hash checks in `server.ts` and `scripts/verify-csp-hash.mjs`.

---

### 1.2 Core Semantic Palette Matrix

The core color system is defined in `src/index.css` across `:root` (Light / Day Mode baseline) and `:root[data-theme="dark"]` / `.dark` (Dark / Night Mode). Every foreground-to-background pairing is cryptographically verified by `scripts/verify-contrast.mjs` against WCAG 2.1 AAA/AA relative luminance standards.

| Token Name | Light (Day Mode) | Dark (Night Mode) | Contrast Ratio (Light) | Contrast Ratio (Dark) | Semantic Role & Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--surface-canvas` | `#F7F5F0` (Sand Off-White) | `#171717` (Charcoal Gray) | Ground baseline | Ground baseline | Page root ground, full-viewport backdrop |
| `--surface-raised` | `#FFFFFF` (Pure White) | `#1C1C1E` / `#212121` | 1.09:1 vs canvas | 1.11:1 vs canvas | Primary cards, panels, modals, dropdowns |
| `--surface-inset` | `#EFECE6` (Warm Well) | `#1A1A1A` (Deep Inset) | Inset baseline | Inset baseline | Input backgrounds, wells, secondary trays |
| `--surface-sunken` | `#E5E1D6` (Darker Recess) | `#141414` (Deep Charcoal) | Recessed baseline | Recessed baseline | Recessed tracks, disabled tracks, tab gutters |
| `--surface-hover` | `#EFECE6` (Hover Tint) | `#2A2A2A` (Hover Slate) | Transient | Transient | Row and list-item interactive hover states |
| `--text-primary` | `#111111` (Deep Crisp) | `#ECECEC` (Crisp Off-White) | **18.88:1** (AAA) | **15.18:1** (AAA) | Headings, primary labels, core body text |
| `--text-secondary` | `#52525B` (Zinc-600) | `#9B9B9B` (Neutral-400) | **7.73:1** (AAA) | **6.45:1** (AA+) | Secondary copy, subheaders, active metadata |
| `--text-muted` | `#52525B` (Zinc-600) | `#8E8E93` (System Gray) | **7.73:1** (AAA) | **5.50:1** (AA) | Placeholders, hints, timestamps, micro-copy |
| `--text-inverse` | `#FFFFFF` (White) | `#000000` (Black) | **21.00:1** (AAA) | **21.00:1** (AAA) | High-contrast text on solid accent buttons |
| `--border-subtle` | `#E4E4E7` (Zinc-200) | `#333333` (Slate-700) | Subtle rule | Subtle rule | Internal card dividers, section rules |
| `--border-default` | `#D4D4D8` (Zinc-300) | `#404040` (Slate-600) | Default rule | Default rule | Panel perimeters, outer card boundaries |
| `--border-control` | `#52525B` (Zinc-600) | `#737373` (Neutral-500) | **7.73:1** (3:1 WCAG) | **3.78:1** (3:1 WCAG) | Form input borders, unselected control outlines |
| `--border-strong` | `#111111` (Near Black) | `#A3A3A3` (Neutral-400) | **18.88:1** (3:1 WCAG) | **7.11:1** (3:1 WCAG) | Hovered inputs, focused controls, active tabs |
| `--accent` | `#111111` (Monochrome) | `#ECECEC` (High-Legibility) | **18.88:1** (AAA) | **15.18:1** (AAA) | Interactive links, active tab rules, icons |
| `--accent-hover` | `#000000` (Solid Black) | `#FFFFFF` (Pure White) | **21.00:1** (AAA) | **17.93:1** (AAA) | Hovered interactive elements |
| `--accent-solid` | `#000000` (Solid Black) | `#FFFFFF` (Pure White) | **21.00:1** (AAA) | **21.00:1** (AAA) | Solid primary buttons and filled chips |
| `--accent-subtle` | `#EFECE6` (Warm Off-White) | `#262626` (Neutral-800) | Ambient | Ambient | Selected chip grounds, input focus halos |
| `--accent-border` | `#111111` (Crisp Charcoal) | `#404040` (Slate-600) | Focus stroke | Focus stroke | Selected card perimeters |

---

### 1.3 Semantic Feedback & Status Tokens

| Semantic Token | Foreground | Subtle Surface Background | Light Contrast | Dark Contrast | Used For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--state-success` | `#047857` (Emerald-700) | `#ECFDF5` (Emerald-50) | **5.48:1** | **9.33:1** | Rubric pass, completed stages, saved states |
| `--state-warning` | `#92400E` (Amber-800) | `#FFFBEB` (Amber-50) | **7.09:1** | **10.74:1** | Word budget warnings, pending reviews |
| `--state-danger` | `#B91C1C` (Red-700) | `#FEF2F2` (Red-50) | **6.47:1** | **6.48:1** | Citation mismatch, errors, delete dialogs |
| `--state-info` | `#111111` (Charcoal) | `#F4F4F5` (Zinc-100) | **18.88:1** | **15.18:1** | Advisory notices, neutral metadata callouts |

---

### 1.4 Dual-Pane Workspace Variables
To support the ChatGPT/Claude dual-pane workspace architecture:
- `--theme-bg`: Maps dynamically to `var(--bg-canvas)` (`#F7F5F0` in Light, `#171717` in Dark).
- `--theme-fg`: Maps dynamically to `var(--text-primary)` (`#111111` in Light, `#ECECEC` in Dark).
- `--theme-border`: Maps dynamically to `var(--border-subtle)` (`#E4E4E7` in Light, `#333333` in Dark).

---

### 1.5 Legacy Compatibility Bridge
To maintain backward compatibility with components originating from the retired Sci-Fi themes (ADR 60), `src/index.css` provides the following backward aliases:
```css
--color-navy-0: var(--surface-sunken);
--color-navy-1: var(--surface-canvas);
--color-navy-2: var(--surface-raised);
--color-navy-3: var(--surface-inset);
--color-navy-4: var(--border-default);
--color-luminous-blue: var(--accent);
--color-luminous-blue-dim: var(--accent-hover);
--color-border-luminous: var(--border-strong);
--color-border-subtle: var(--border-subtle);
--color-surface-0: var(--surface-canvas);
--color-surface-1: var(--surface-raised);
--color-surface-2: var(--surface-inset);
--color-surface-3: var(--surface-raised);
```

---

## 2. Typography Scale

### 2.1 Font Family Architecture
Declared in `src/index.css` `@theme`:
```css
@theme {
  --font-sans: "Plus Jakarta Sans", "Inter", "Circular Std", "Circular", "Manrope",
               ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
               "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-serif: var(--font-sans);
  --font-display: var(--font-sans);
  --font-mono: var(--font-sans);
}
```
> **Key Finding**: In `src/index.css`, `--font-mono` is globally aliased to `--font-sans`. While 421 occurrences of `font-mono` exist across the codebase (e.g. for DOIs, word counts, timestamps, badges), all are rendered in the geometric sans-serif font stack.

---

### 2.2 Typographic Hierarchy & Scale Distribution

| Hierarchy Level | Tailwind Classes | Computed Size / Leading | Weight | Tracking | Codebase Call Sites | Primary Applications |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Display / Hero** | `text-4xl` / `text-5xl` | 36px - 48px / 1.1 - 1.2 | `font-extrabold` (800) | `tracking-tight` | 6 | Landing page hero headers (`ScholarCoreLanding.tsx`) |
| **Page Title** | `text-2xl sm:text-3xl` | 24px - 30px / 1.25 | `font-semibold` (600) | `tracking-tight` (-0.011em) | 110 | Main dashboard & Phase headers (`AssignmentUnderstandStage.tsx`) |
| **Section Heading** | `text-xl` | 20px / 1.35 | `font-bold` (700) | `tracking-tight` | 107 | Modal headers, major card section titles |
| **Card / Sub-Heading**| `text-lg` / `text-[15px]`| 15px - 18px / 1.4 | `font-semibold` (600) | `tracking-tight` | 85 | Format tile titles (`FORMAT_TILES`), stage step titles |
| **Body Primary** | `text-sm` | 14px / 1.5 (`leading-relaxed`)| `font-normal` (400) / `medium` (500) | `tracking-normal` | 696 | Long-form drafting, rubric criteria, stage guidelines |
| **UI Body / Dense** | `text-xs` | 12px / 1.5 (`leading-relaxed`)| `font-normal` (400) / `medium` (500) | `tracking-normal` | **2,097** | Inputs, list rows, source metadata, buttons, descriptions |
| **Micro Labels & Tags**| `text-[10px]` / `text-[11px]`| 10px - 11px / 1.2 | `font-semibold` (600) / `bold` (700) | `tracking-wider` (uppercase) | 350+ | Status chips, citation keys, timestamp metadata |

---

### 2.3 Weight & Motion Distribution
- **Font Weights**:
  - `font-bold` (700): 1,188 occurrences (dominant on buttons, titles, indicators)
  - `font-semibold` (600): 906 occurrences (card headers, primary navigation)
  - `font-medium` (500): 683 occurrences (sub-labels, form labels, badges)
  - `font-normal` (400): 54 occurrences (paragraphs, long copy)
  - `font-black` (900): 55 occurrences (high-contrast numbers)
  - `font-extrabold` (800): 16 occurrences (hero titles)
- **Tracking Distribution**:
  - `tracking-wider`: 296 occurrences (paired with uppercase micro-labels)
  - `tracking-tight`: 119 occurrences (paired with headings `text-xl` to `text-3xl`)
  - `tracking-wide`: 16 occurrences
- **Animation & Transitions**:
  - `--motion-fast`: `120ms` (hover feedback, pill toggles)
  - `--motion-base`: `180ms` (dialog transitions, inputs, dropdowns)
  - `--motion-slow`: `220ms` (page fade-ins, sidebar collapse)
  - `--motion-ease`: `cubic-bezier(0.16, 1, 0.3, 1)` (Apple/Airbnb-style spring curve)

---

## 3. Border Radius & Elevation Standards

### 3.1 Border Radius Tokens & Usage

The project's CSS variables specify an approachable, rounded curve system:
```css
:root {
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;
}
```

#### Tailwind v4 Utility Class vs. CSS Variable Token Split
Because `--radius-*` tokens in `src/index.css` are declared inside `:root` rather than the Tailwind `@theme` directive, Tailwind v4 does not automatically remap `rounded-md` to `--radius-md`. Consequently, components across the codebase utilize two competing styling patterns:

| Radius Token / Utility | Target Value | Measured Usage | Primary UI Element Assignment |
| :--- | :--- | :--- | :--- |
| `rounded-full` | `9999px` | **666** | Action buttons, search capsules, status chips, filter pills |
| `rounded-xl` / `rounded-[var(--radius-md)]` | `12px` | **884** (`641` class + `243` var) | Selection cards, form inputs, toolbars, icon backdrops |
| `rounded-2xl` / `rounded-[var(--radius-lg)]` | `16px` | **314** (`270` class + `44` var) | Main canvas panels, format cards, rubric cards, modals |
| `rounded-lg` / `rounded-[var(--radius-sm)]` | `8px` | **588** (`443` class + `145` var) | Inner buttons, small badges, toast alerts, dropdown items |
| `rounded-md` | `6px` | **129** | Legacy inner elements, skeletons, kbd shortcuts |
| `rounded-3xl` | `24px` | **7** | Ad-hoc modal containers (`KnowledgeVault.tsx:1007`) |
| `rounded-[var(--radius-xl)]` | **UNDEFINED** | **12** | **Broken Token**: Modals & cards (`LiteratureMatrixModal.tsx`) |

---

### 3.2 Elevation & Shadow Hierarchy

The system defines 3 ambient elevation levels in `src/index.css` for Light mode, with shadows completely disabled in Dark mode to rely on border contrast:

```css
/* Light Mode */
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);

/* Dark Mode */
--shadow-sm: none;
--shadow-md: none;
--shadow-lg: none;
```

#### Actual Tailwind Shadow Usage in Components
Because Tailwind's built-in shadow utilities (`shadow-xs`, `shadow-sm`, etc.) generate static box-shadow rules independent of CSS variables, shadows are frequently rendered in dark mode unless explicitly suppressed:

| Shadow Utility | Tailwind Value | Measured Usage | Component Role |
| :--- | :--- | :--- | :--- |
| `shadow-xs` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | **326** | Base cards, stage containers, primary buttons |
| `shadow-2xs` | `0 1px rgb(0 0 0 / 0.05)` | **157** | Small icon containers, list items, badges |
| `shadow-sm` | `0 1px 3px 0 rgb(0 0 0 / 0.1), ...` | **101** | Search capsules, hoverable format cards |
| `shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), ...` | **67** | Format card hover state (`hover:shadow-md`) |
| `shadow-2xl` | `0 25px 50px -12px rgb(0 0 0 / 0.25)` | **40** | Floating modals, command palette, slide preview |
| `shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1), ...` | **14** | User account dropdown menu, popovers |
| `shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), ...` | **18** | Floating toolbars, drawer menus |
| `shadow-none` | `none` | **7** | Explicit shadow resets |

---

## 4. Shared Component Matrix

> **Architecture Note**: There is **no shared primitive directory** (such as `src/components/ui/`) in this repository. All buttons, cards, badges, inputs, and modals are implemented inline and ad-hoc across feature components. Below is the comprehensive matrix of recurring patterns currently functioning as de facto primitives.

---

### 4.1 Buttons & Action Controls

| Primitive Role | Typical Call Sites | Default Tailwind Classes | Variants & State Styles |
| :--- | :--- | :--- | :--- |
| **Primary Action (Capsule / Pill)** | `AssignmentUnderstandStage.tsx`<br>`ProjectListScreen.tsx` | `px-7 py-3 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs flex items-center justify-center gap-2 cursor-pointer font-sans` | **Hover**: `hover:opacity-90`<br>**Active**: `active:scale-[0.99]`<br>**Disabled**: `disabled:opacity-50 disabled:cursor-not-allowed` |
| **Primary Action (Sidebar / Header)** | `ProjectListScreen.tsx:2054` | `w-full h-10 px-4 rounded-full text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm flex items-center justify-center gap-2 font-sans` | **Hover**: `hover:bg-neutral-800 dark:hover:bg-neutral-200`<br>**Active**: `active:scale-95` |
| **Secondary Button (Rounded XL)** | `RubricComplianceCard.tsx:51`<br>`AssignmentSourcesStage.tsx:965` | `px-4 py-2 rounded-xl text-xs font-semibold border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] text-neutral-600 dark:text-neutral-300 shadow-xs cursor-pointer inline-flex items-center gap-1.5` | **Hover**: `hover:border-neutral-300 dark:hover:border-white/20`<br>**Disabled**: `disabled:opacity-50` |
| **Secondary Pill / Outline** | `AssignmentSourcesStage.tsx:1236`<br>`UserAccountMenu.tsx:177` | `px-3.5 py-1.5 rounded-full text-xs font-semibold border border-[var(--theme-fg)]/15 bg-[var(--theme-bg)] text-[var(--theme-fg)] shadow-2xs cursor-pointer inline-flex items-center gap-2` | **Hover**: `hover:bg-[var(--theme-fg)]/5`<br>**Active**: `active:scale-95` |
| **Destructive / Delete Action** | `ProjectListScreen.tsx:3519`<br>`KnowledgeVault.tsx:781` | `px-5 py-2.5 rounded-full text-sm font-bold text-[#E60023] bg-[#E60023]/15 transition-all cursor-pointer font-sans flex items-center justify-center` | **Hover**: `hover:text-[#AD081B] hover:bg-[#E60023]/25`<br>**Disabled**: `disabled:opacity-50` |
| **Minimal Icon Toggle** | `ProjectListScreen.tsx:84` (Theme Toggle)<br>`Header.tsx` | `p-2 rounded-lg text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-white/10 flex-shrink-0 cursor-pointer transition-colors` | **Hover**: `hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white` |
| **Circular Send / Submit** | `ProjectListScreen.tsx:2713` (Prompt Bar) | `w-7 h-7 rounded-full flex items-center justify-center bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm cursor-pointer` | **Hover**: `hover:bg-neutral-800 dark:hover:bg-neutral-100`<br>**Disabled**: `disabled:bg-neutral-200 dark:disabled:bg-white/10 disabled:cursor-not-allowed` |
| **OAuth Identity Button** | `GoogleIdentityButton.tsx`<br>`AuthLayout.tsx` | GIS standard iframe wrapper with fallback: `rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm font-medium shadow-2xs` | **Loading**: Custom spinning indicator |

---

### 4.2 Cards & Surface Containers

| Component Name | File Location | Structural Classes | Padding / Geometry | Visual Treatment |
| :--- | :--- | :--- | :--- | :--- |
| **Main Intake Canvas** | `AssignmentUnderstandStage.tsx:694` | `bg-white dark:bg-[#1C1C1E] border border-neutral-200/70 dark:border-white/10 shadow-xs space-y-7` | `p-6 sm:p-8 rounded-2xl` | Elevated card ground for primary form workflows |
| **Academic Format Tile** | `ProjectListScreen.tsx:2529` (`FORMAT_TILES`) | `bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 rounded-2xl flex flex-col justify-between shadow-[0_1px_3px_rgba(0,0,0,0.05)] cursor-pointer text-left` | `p-5 min-h-[16.5rem]` | **Hover**: `hover:-translate-y-0.5 hover:shadow-md hover:border-neutral-300 dark:hover:border-white/20` |
| **Curated Source Card** | `CuratedSourceCard.tsx:71` | `rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-4 shadow-xs` | `p-5` | **Normal**: `border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E]`<br>**Approved**: `border-emerald-500/50 bg-emerald-500/[0.03] dark:border-emerald-500/40 dark:bg-emerald-500/[0.04]` |
| **Rubric Compliance Card**| `RubricComplianceCard.tsx:78` | `bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-6` | `p-6 sm:p-7 rounded-2xl` | Standard academic audit container with grade pills |
| **Citation Audit Card** | `CitationReconciliationCard.tsx:23` | `bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-4` | `p-6 rounded-2xl` | Verification report card with reconciliation counts |
| **Selection Preset Card** | `WritingStyleSelector.tsx:221` | `rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between group` | `p-4` | **Normal**: `bg-white dark:bg-[#2C2C2E] border-neutral-200/80 dark:border-white/10`<br>**Selected**: `bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white shadow-xs ring-1 ring-neutral-900/10` |
| **Skeleton Loading Card** | `GlobalLoader.tsx:20` | `bg-[#1C1C1E] border border-white/5 space-y-4` | `p-6 rounded-2xl` | Permanent dark-mode pulse skeleton |

---

### 4.3 Badges, Chips & Status Indicators

| Badge Type | Codebase Example | Classes Applied | Visual Result |
| :--- | :--- | :--- | :--- |
| **Stage Stepper Pill** | `AssignmentUnderstandStage.tsx:680` | `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-neutral-200` | Soft gray pill identifying active workflow phase |
| **Verified / Success Chip**| `CuratedSourceCard.tsx:725` | `text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20` | Emerald indicator with checkmark |
| **Uploaded Document Badge**| `CuratedSourceCard.tsx:82` | `px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25 text-[10px]` | Blue chip for user-submitted PDF/DOCX |
| **Grade Prediction Badge** | `RubricComplianceCard.tsx:68` | `px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20` | Color-coded grade tier badge |
| **Feature / Preset Pill** | `WritingStyleSelector.tsx:247` | `text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300` | Contextual tag inside selection card |
| **Recent Year Pill** | `CuratedSourceCard.tsx:95` | `px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/60` | High-density year callout tag |

---

### 4.4 Form Controls & Inputs

| Input Primitive | Component Location | Visual Styling Classes | Focus State Classes |
| :--- | :--- | :--- | :--- |
| **Prompt Bar Textarea** | `ProjectListScreen.tsx`<br>`AssignmentUnderstandStage.tsx:739` | `w-full bg-neutral-50/70 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 rounded-xl p-4 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 leading-relaxed resize-y` | `focus:outline-none focus:ring-2 focus:ring-neutral-900/10 dark:focus:ring-white/15 focus:border-neutral-400 dark:focus:border-white/20` |
| **Word Count Input** | `TargetWordCountInput.tsx:128` | `w-full rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-xl font-semibold tracking-tight text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100` | `focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:border-neutral-100 dark:focus:ring-neutral-100` |
| **Capsule Search Input** | `KnowledgeVault.tsx:463` | `w-full h-9 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] pl-10 pr-9 text-xs text-[var(--text-primary)] placeholder:text-gray-400 shadow-2xs` | `outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-neutral-700` |
| **Bare Prompt Input** | `ProjectListScreen.tsx`<br>`src/index.css:553` (`.prompt-bare-input`) | `border-none outline-none shadow-none bg-transparent appearance-none text-sm text-neutral-900 dark:text-white` | `focus:border-none focus:outline-none focus:shadow-none` |
| **Global Base Inputs** | `src/index.css:535` (`@layer base`) | `background-color: var(--surface-raised); border: 1px solid var(--border-control); border-radius: var(--radius-md); color: var(--text-primary);` | `border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px var(--accent-subtle);` |

---

### 4.5 Modals, Dialogs & Overlays

| Modal Identifier | File Location | Backdrop Classes | Container Dialog Classes |
| :--- | :--- | :--- | :--- |
| **Command Palette** | `CommandPalette.tsx:276` | `fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150` | `w-full max-w-xl rounded-2xl bg-white dark:bg-[#1E1E22] border border-neutral-200 dark:border-white/10 shadow-2xl overflow-hidden` |
| **Project Delete Dialog** | `ProjectListScreen.tsx:3487` | `fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150` | `w-full max-w-md bg-white dark:bg-[#1C1C1E] rounded-3xl p-6 shadow-2xl border border-neutral-100 dark:border-white/10` |
| **Vault Item Edit Modal**| `VaultItemEditModal.tsx:88` | `fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200` | `w-full max-w-lg rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-6 shadow-2xl` |
| **Literature Matrix Modal**| `LiteratureMatrixModal.tsx:93` | `fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150` | `w-full max-w-6xl max-h-[92vh] bg-[color:var(--surface-canvas)] border border-[color:var(--border-default)] rounded-[var(--radius-xl)] shadow-2xl` |
| **Embedded Auth Modal** | `EmbeddedAuthModal.tsx:85` | `fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/50 dark:bg-black/75 backdrop-blur-md animate-in fade-in duration-200` | `w-full max-w-md rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-2xl p-6` |
| **Global Loading Overlay**| `GlobalLoadingOverlay.tsx:47` | `fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md transition-opacity` | Full viewport overlay with active spinning/breathing core |

---

## 5. Visual Debt & Inconsistencies to Refactor

The audit reveals significant structural and visual fragmentation that has accumulated across previous iterations. The items below represent concrete, actionable targets for downstream refactoring.

### 5.1 Absence of a Centralized Component Layer (`src/components/ui/`)
- **Impact**: There are no shared atomic primitives for `Button`, `Card`, `Badge`, `Input`, `Dialog`, or `Dropdown`.
- **Consequence**: Every single screen, modal, and stage reinvents its own button padding, hover states, border colors, and dark-mode overrides. A simple change to button styling requires editing dozens of individual files.

---

### 5.2 Broken & Phantom Design Tokens
Multiple components invoke CSS custom properties that **do not exist** in `src/index.css`:
1. **`var(--surface-base)`**:
   - **Call Sites**: **108 occurrences** across `src/desk/workspace/stages/` (e.g., `TitleLockStage.tsx`, `DefinitionStage.tsx`, `Tray.tsx`).
   - **Defect**: Undefined in `src/index.css`. The browser falls back to `transparent`, causing cards and inputs to render without a solid background ground.
2. **`var(--surface-input)`**:
   - **Call Sites**: **31 occurrences** across `VaultItemEditModal.tsx`, `ProposalWorkspace.tsx`, `ThesisWorkspace.tsx`, and `SettingsView.tsx`.
   - **Defect**: Undefined in `src/index.css`. Inputs render with transparent backgrounds, revealing underlying canvas patterns.
3. **`var(--radius-xl)`**:
   - **Call Sites**: **12 occurrences** across `LiteratureMatrixModal.tsx`, `SettingsView.tsx`, `VaultItemEditModal.tsx`, `AddSourceModal.tsx`, `CitationConfirmationModal.tsx`, and `SourceLibraryScreen.tsx`.
   - **Defect**: Undefined in `src/index.css`. The CSS rule `rounded-[var(--radius-xl)]` is invalid, collapsing corners to sharp 0px squares.
4. **`var(--muted)`**, **`var(--text)`**, **`var(--border-hover)`**, **`var(--bg)`**:
   - Stray legacy variable calls with 1–2 usages each.

---

### 5.3 Severe Dark-Mode Hex Code Fragmentation
Instead of consuming `--surface-raised` or `--surface-canvas`, dark mode surfaces across the application hardcode **11 distinct arbitrary dark hex codes**:

| Dark Hex Code | Occurrences | Discovered Locations | Intended System Surface |
| :--- | :--- | :--- | :--- |
| `#1C1C1E` | **91** | `AssignmentSubmissionStage.tsx`, `CuratedSourceCard.tsx`, `ProjectListScreen.tsx` | `--surface-raised` |
| `#171717` | **40** | `AssignmentWorkspace.tsx`, `GlobalLoader.tsx`, `ProjectListScreen.tsx` | `--surface-canvas` |
| `#2C2C2E` | **26** | `WritingStyleSelector.tsx`, `ScholarAgenticDashboard.tsx`, `IntakePanel.tsx` | `--surface-raised` / `--surface-inset` |
| `#262626` | **21` | `LiveSlidePlayer.tsx`, `src/index.css` | `--surface-sunken` |
| `#18181A` | **3** | `UserAccountMenu.tsx:114` | `--surface-raised` |
| `#1E1E22` | **1** | `CommandPalette.tsx:280` | `--surface-raised` |
| `#121212` | **2** | `KnowledgeVault.tsx:689` | `--surface-inset` |
| `#18181B` | **3** | `ProjectListScreen.tsx:2743` (AI Assistant Sidebar) | `--surface-raised` |
| `#141414` | **5** | `src/index.css` | `--surface-sunken` |
| `#212121` | **6** | `src/index.css` | `--surface-raised` |
| `#000000` | **15** | `LiveSlidePlayer.tsx`, `src/index.css` | Canvas ground / Accent |

---

### 5.4 Light Mode Canvas Ground Conflict
- In `src/index.css`, the official Day Mode canvas ground is **Sand Off-White (`#F7F5F0`)** (per ADR 60 and ADR 64).
- In `AssignmentWorkspace.tsx` (lines 469, 490, 519) and `ProjectListScreen.tsx` (lines 1967, 2338, 2576), the ground is hardcoded as `bg-[#F8F9FA]` (Cool Gray Off-White) or `bg-[#FAFAFA]` (Zinc-50).
- This creates an abrupt visual temperature shift when navigating between landing (`#F7F5F0`), workspace canvas (`#F8F9FA`), and knowledge vault (`#FFFFFF`).

---

### 5.5 Permanent Dark-Mode "Islands" in Light Mode
Several components lack light/dark duality and are permanently hardcoded in dark styling:
1. **`GlobalLoader.tsx`**:
   ```tsx
   className="min-h-[60vh] w-full flex flex-col items-center justify-center p-8 bg-[#171717] text-neutral-400 select-none"
   ```
   *Defect*: When loading any screen while the user is in Day Mode (light theme), the screen abruptly flashes a pitch-black `#171717` container with a glowing blue dot (`bg-blue-500/80 animate-ping`).
2. **`ScholarAgenticDashboard.tsx`**:
   ```tsx
   className="flex h-screen w-full overflow-hidden bg-[#171717] font-sans text-neutral-200"
   ```
   *Defect*: Entire dashboard is hardcoded in dark mode; does not observe the `data-theme="light"` state.
3. **`LiveSlidePlayer.tsx`**:
   ```tsx
   className="fixed inset-0 z-50 bg-[#000000] text-[#ECECEC] ..."
   ```
   *Defect*: Purely dark presentation viewport without theme integration.

---

### 5.6 Rogue Color Accents
- **Pinterest Red (`#E60023` & `#AD081B`)**: Hardcoded across 20+ locations in `ProjectListScreen.tsx:3519` and `KnowledgeVault.tsx:781, 958, 1027` for delete dialogs and destructive actions. Contradicts the design system's `--state-danger` (`#B91C1C`) token.
- **Glowing Blue Accents (`#3B82F6` / `bg-blue-500`)**: Hardcoded in `KnowledgeVault.tsx` (inputs have `border-blue-500 focus:ring-blue-500/20`), `GlobalLoader.tsx` (`bg-blue-500/80 animate-ping`), and `CuratedSourceCard.tsx` (`bg-blue-500/15`). These are remnants of the retired Sci-Fi theme.
- **Scientific Charcoal (`#334155` / `#1E293B`)**: Hardcoded in several files left over from ADR 64, conflicting with neutral zinc/slate tokens.

---

### 5.7 Unstandardized Badges & Micro-Pills
Badge components across the application exhibit wide disparities in geometry and typographic treatment:
- **Paddings**: Ranging from `px-1.5 py-0.2` to `px-2 py-0.5`, `px-2.5 py-0.5`, `px-2.5 py-1`, and `px-3 py-1`.
- **Text Sizes**: Inconsistently set to `text-[9px]`, `text-[10px]`, `text-[11px]`, and `text-xs`.
- **Radii**: Mixing `rounded` (4px), `rounded-lg` (8px), `rounded-xl` (12px), and `rounded-full` (pill) for identical semantic roles.
- **Letter Spacing**: Arbitrary mix of `tracking-normal`, `tracking-wide`, and `tracking-wider` (with uppercase and sentence case mixed interchangeably).

---

### 5.8 Modal Backdrop & Z-Index Multiplicity
A search across the codebase reveals **43 separate modal dialogs**, each declaring its own custom overlay styling without standardization:
- **Backdrop Color & Opacity**: Inconsistently using `bg-black/40`, `bg-black/45`, `bg-black/50`, `bg-black/60`, `bg-black/65`, and `bg-slate-950/50 dark:bg-black/75`.
- **Backdrop Blur**: Alternating between `backdrop-blur-none`, `backdrop-blur-xs`, `backdrop-blur-sm`, and `backdrop-blur-md`.
- **Z-Index Layering**: Random assignments of `z-30`, `z-40`, `z-50`, `z-[100]`, and `z-[99999]`.
- **Dismissal Affordance**: Modals inconsistently use raw text characters (`✕`), Lucide `<X />` icons, or omit escape key listeners.

---

### 5.9 Icon Sizing Disparities
Lucide icons are applied without standardized bounding boxes, resulting in subtle optical misalignment inside buttons and toolbars:
- `w-3 h-3` (12px)
- `w-3.5 h-3.5` (14px)
- `w-4 h-4` (16px)
- `w-5 h-5` (20px)
- `w-6 h-6` (24px)
- In several components, icons omit width/height classes, causing them to default to Lucide's 24px natural dimensions.

---

### 5.10 Monospace Typographic Contradiction
- In `src/index.css`:
  ```css
  --font-mono: var(--font-sans);
  ```
- **The Issue**: Developers continue to add `font-mono` across 421 elements expecting monospaced tabular numbers for word budgets, DOIs, timestamps, and metrics. Because `--font-mono` is aliased to `Plus Jakarta Sans`, tabular figures are not monospace-aligned unless `font-variant-numeric: tabular-nums` is explicitly supplied.

---

### 5.11 Dark Mode Shadow Bleed
- In `src/index.css`, shadows in dark mode are explicitly set to `none` (`--shadow-sm: none; --shadow-md: none;`).
- However, components frequently apply Tailwind's built-in utilities (`shadow-xs`, `shadow-sm`, `shadow-md`, `shadow-2xl`).
- Because Tailwind utilities compile to hardcoded `rgba(0, 0, 0, ...)`, **cards and modals cast unnatural dark halos in dark mode** because `dark:shadow-none` is not included.

---

## 6. Actionable Refactoring Roadmap

To transition the codebase from its current fragmented state into an exemplary, state-of-the-art design system, subsequent refactoring phases should execute the following sequence:

1. **Establish `@/components/ui/` Primitive Suite**:
   - Create unified, accessible primitive components: `Button.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx`, `Textarea.tsx`, `Dialog.tsx`, `DropdownMenu.tsx`, `Tooltip.tsx`.
   - Built on standard Tailwind v4 tokens with strict Day/Night mode parity and zero hardcoded hex values.

2. **Heal CSS Variable Token Declarations in `src/index.css`**:
   - Declare missing tokens: `--surface-base: var(--surface-raised);`, `--surface-input: var(--surface-inset);`, `--radius-xl: 20px;`.
   - Map radius tokens inside Tailwind v4 `@theme` block (`--radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 20px;`).
   - Standardize `--font-mono` to support genuine tabular numerals (`font-variant-numeric: tabular-nums`) for academic data and counters.

3. **Consolidate Dark-Mode Hex Fragmentation**:
   - Systematically migrate all 91 occurrences of `dark:bg-[#1C1C1E]`, 26 occurrences of `dark:bg-[#2C2C2E]`, and stray dark hexes to semantic tokens (`dark:bg-surface-raised` or `bg-white dark:bg-neutral-900`).

4. **Remediate Rogue Accents & Permanent Dark Islands**:
   - Replace Pinterest Red (`#E60023`) with `--state-danger` (`#B91C1C` / Tailwind `text-red-600 dark:text-red-400`).
   - Refactor `GlobalLoader.tsx` to inherit `--surface-canvas` and `--text-secondary`, eliminating the jarring black flash in Day Mode.
   - Refactor `ScholarAgenticDashboard.tsx` to support the dual-pane Day/Night theme system.

5. **Standardize Modals into a Single `<Modal>` / `<Dialog>` Primitive**:
   - Unify backdrops to `fixed inset-0 z-50 bg-black/50 backdrop-blur-xs`.
   - Provide consistent <kbd>Escape</kbd> listener, outside click handling, and accessible ARIA attributes.
