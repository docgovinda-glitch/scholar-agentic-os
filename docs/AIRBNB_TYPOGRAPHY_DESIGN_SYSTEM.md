# Airbnb-Inspired Typography & Design System Specification

## 1. Overview

The Scholar Workspace design system pivots away from high-contrast brutalist aesthetics toward a warm, approachable, Airbnb-inspired design architecture. The system optimizes for deep academic focus, long-form legibility, and refined typography-driven hierarchy rather than harsh visual borders.

---

## 2. Typography Stack & Font Hierarchy

### Global Font Stack
- **Primary Geometric Sans-Serif**: `Plus Jakarta Sans`, `Manrope`, `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `Helvetica Neue`, `Arial`, `sans-serif`.
- **Google Fonts Import**: Preconnected and loaded with display swap for weights `400`, `500`, `600`, `700`, and `800`.
- **Global Monospace Elimination**: Monospaced typography (`--font-mono`) is aliased globally to `--font-sans`. Monospace fonts have been eliminated from the UI layer to maintain a soft, human aesthetic.

### Type Scale & Weight Hierarchy
| Hierarchy Level | Tailwind Classes | Weight | Tracking & Line Height | Tone / Color | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page Title** | `text-2xl sm:text-3xl font-extrabold` | 800 | `tracking-tight leading-tight` | `neutral-900` / `#1E293B` | Main dashboard & page headings |
| **Hero Title** | `text-3xl sm:text-6xl font-extrabold` | 800 | `tracking-tight leading-[1.1]` | `neutral-900` | Landing hero header |
| **Card Heading** | `text-lg font-bold` | 700 | `tracking-tight` | `neutral-900` | Format & project card titles |
| **Sub-labels & Secondary** | `text-sm font-medium` / `text-xs font-normal` | 400 - 500 | `tracking-normal leading-normal` | `neutral-500` / `#717171` | Contextual subtitles & metadata |
| **Academic Body Copy** | `text-sm sm:text-base font-normal` | 400 | `leading-relaxed` / `leading-loose` | `neutral-700` / `neutral-800` | Long-form academic drafting & reports |
| **Pills & Badges** | `text-xs font-medium` / `font-semibold` | 500 - 600 | `tracking-normal` (Sentence Case) | `neutral-600` / `emerald-700` | Workflow stages, formats & status |

---

## 3. Visual Geometry & Elevation

- **Card Radii**: Shifted from sharp 0px corners (`rounded-none`) to soft, tactile geometry (`rounded-2xl` for cards, `rounded-xl` for inner components, `rounded-full` for badges, search bars, and filter pills).
- **Search Capsule Input**: Designed as a modern pill (`rounded-full`) with a soft white ground (`bg-white`), subtle neutral border (`border-neutral-300`), smooth focus ring (`focus:ring-neutral-900/15`), and clear magnifying glass icon.
- **Diffuse Shadows**:
  - `shadow-2xs`: `0 1px 2px rgba(0, 0, 0, 0.04)`
  - `shadow-xs`: `0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)`
  - `shadow-sm`: `0 2px 8px -2px rgba(0, 0, 0, 0.06), 0 1px 3px -1px rgba(0, 0, 0, 0.04)`
  - `shadow-md`: `0 8px 24px -4px rgba(0, 0, 0, 0.08), 0 3px 8px -2px rgba(0, 0, 0, 0.04)`
- **Borders**: Refined from heavy 2px dark charcoal borders to delicate neutral borders (`border-neutral-200/80` or `border-neutral-300`).

---

## 4. Modal & Dialog Patterns

### Delete Confirmation Dialog
- **Card Affordance**: Replaced the previous trash can icon with a calm, tactile pill button that strictly writes **`Delete`** in red text (`text-red-600 font-semibold bg-red-50 hover:bg-red-100 border border-red-200 rounded-full px-3 py-1 font-sans`). Zero icons are used.
- **Typography-Driven Layout**: Stripped all distracting warning icons to maintain visual calm and eliminate unnecessary visual urgency. Information hierarchy is communicated through pure typography.
- **Dialog Title**: `Delete Project` (`text-xl font-extrabold text-neutral-900 tracking-tight font-sans`).
- **Tone & Copy**: Clear, refined academic grammar without ambiguity:
  > *"Are you sure you want to delete \"[Project Title]\"? All associated notes, drafts, and evidence will be permanently removed. This action cannot be undone."*
- **Action Buttons**:
  - **Negative Option**: Dismiss action labeled strictly **`Cancel`** (`bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded-full font-semibold`).
  - **Primary Action**: Destructive action strictly labeled **`Delete`** written in red color (`text-red-600 font-semibold bg-red-50 hover:bg-red-100 border border-red-200 rounded-full`) with zero icons inside.
- **Interaction & State**: Supports backdrop click and <kbd>Escape</kbd> dismissal. Employs optimistic UI removal for instantaneous visual responsiveness.

---

## 5. Accessibility & Contrast Verification

- **Color Contrast Score**: **82/82 pairings passed** WCAG AA/AAA via `scripts/verify-contrast.mjs`.
- **Primary Text on Sand Off-White**: `13.43:1` (exceeds WCAG AAA 7.0:1 threshold).
- **Secondary Text on Sand Off-White**: `9.50:1` (exceeds WCAG AAA 7.0:1 threshold).
- **Action Buttons (`bg-neutral-900 text-white`)**: `16.0:1` (exceeds WCAG AAA threshold).
- **Destructive Button (`bg-red-600 text-white`)**: `4.8:1` (clears WCAG AA threshold for bold action buttons).
- **CSP Integrity**: Inline theme script verified with cryptographically compliant SHA-256 hash in `index.html`.

---

## 7. Dual-Pane AI Agent Workspace Architecture

Following the structural paradigms of modern AI interfaces (such as ChatGPT and Claude), the Scholar Workspace employs a clean dual-pane layout designed for focused reading and frictionless workflow orchestration:

### 7.1 Root Layout & Flex Container
- **Non-Scrolling Full Viewport**: The application container is configured as a full-viewport flexbox (`h-screen w-full flex overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-fg)] font-sans`).
- **Semantic Color Inheritance**: All surfaces, text, borders, and controls dynamically inherit `--theme-bg` (mapped to `--surface-canvas`) and `--theme-fg` (mapped to `--text-primary`), strictly preserving light/dark mode without hardcoded color values.

### 7.2 Left Navigation Sidebar (`<aside>`)
- **Fixed Width with Flex-Shrink Protection**: Strictly configured with `w-[260px]` and `flex-shrink-0` on desktop, preventing sidebar crushing or deformation when resizing the browser window.
- **Top Section**: Anchored Scholar Core icon, workspace indicator, collapse button, and a full-width primary `+ New Project` button.
- **Middle Section**: Vertical list of platform destinations (`Knowledge Vault`, `Editorial Agents`, `AI Access`) featuring clean wireframe glyphs and `hover:bg-[var(--theme-fg)]/5` interaction states.
- **Bottom Section**: Anchored `Settings` trigger and the `UserAccountMenu` profile card with `dropUp={true}` and `variant="sidebar"`, ensuring profile settings render cleanly above without overflow clipping.
- **Visual Separator**: 1px subtle divider `border-r border-[var(--theme-fg)]/15`.

### 7.3 Desktop Collapsibility (`isSidebarOpen`)
- **Distraction-Free Reading Mode**: Controlled by an `isSidebarOpen` state that dynamically collapses the `w-[260px]` aside to `w-0 border-r-0 overflow-hidden` with a smooth 300ms transition.
- **Header Toggle Icon Button**: A small panel toggle icon in the top-left of the main content area allows users to collapse or re-expand the sidebar at any point without leaving the reading flow.

### 7.4 Mobile Slide-Over Drawer & Clickable Backdrop
- **Slide-Over Drawer**: Responsive overlay on smaller screens (`max-width: 768px`) with `w-[260px] fixed inset-y-0 left-0 z-50`.
- **Clickable Backdrop Overlay**: Semi-transparent blurred backdrop (`fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden`) enabling users to dismiss the drawer by tapping anywhere outside.

### 7.5 Custom Agentic Scrollbars (`.scholar-scrollbar`)
- Custom webkit styling eliminates bulky native browser scrollbars in favor of a sleek, unobtrusive agentic aesthetic:
  - **Track**: Transparent 6px track.
  - **Thumb**: Rounded pill shape mapped to `color-mix(in srgb, var(--theme-fg) 20%, transparent)`, brightening to `35%` on hover.
  - **Standard Rule**: `scrollbar-width: thin; scrollbar-color: color-mix(...) transparent;`.

---

## 8. Verification Commands

```bash
# Verify WCAG contrast compliance (82 pairings checked)
node scripts/verify-contrast.mjs

# Verify CSP hash integrity
node scripts/verify-csp-hash.mjs

# Run component test suites (including dual-pane, collapse, drawer tests)
npx vitest run src/desk/__tests__/ScholarCoreLanding.test.tsx src/desk/__tests__/ProjectListScreen.test.tsx src/desk/__tests__/DeskApp.test.tsx

# Production build validation
npm run build
```

