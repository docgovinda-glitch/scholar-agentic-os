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
- **Affordance**: Each project card displays an accessible circular delete trigger (`w-8 h-8 rounded-full border border-neutral-200/90 text-neutral-400 hover:text-red-600 hover:bg-red-50/70`).
- **Modal Header**: Prominent red delete/trash icon housed in a soft red rounded circle (`w-12 h-12 rounded-full bg-red-50 border border-red-100 text-red-600`).
- **Dialog Title**: `Delete Project` (`text-lg font-bold text-neutral-900 tracking-tight`).
- **Tone & Copy**: Clear, refined academic grammar without ambiguity:
  > *"Are you sure you want to delete \"[Project Title]\"? All associated notes, drafts, and evidence will be permanently removed. This action cannot be undone."*
- **Action Buttons**:
  - **Negative Option**: Dismiss action labeled strictly **`Cancel`** (`bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded-full`).
  - **Primary Action**: Destructive action labeled strictly **`Delete`** with zero typos (`bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold`).
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

## 6. Verification Commands

```bash
# Verify WCAG contrast compliance
node scripts/verify-contrast.mjs

# Verify CSP hash integrity
node scripts/verify-csp-hash.mjs

# Run component test suites
npx vitest run src/desk/__tests__/ScholarCoreLanding.test.tsx src/desk/__tests__/ProjectListScreen.test.tsx src/desk/__tests__/DeskApp.test.tsx

# Production build validation
npm run build
```
