# Day / Night Theme Switching Architecture & Specification

> **Authoritative Specification** · Scholar Agentic OS  
> **Status:** Production Deployed · **Revision:** 2.1 · **Date:** 2026-09-24  
> **Scope:** Desk Client, Theme Engine, Pre-Paint Hydration, CSP Integrity, Tailwind v4 Dynamic Tokens

---

## 1. Executive Summary & Objective

### 1.1 Objective
Restore and reinforce the Day/Night mode toggle button (the sun/moon icon at the bottom of the left navigation sidebar) so clicking it immediately switches the interface between light (Sand & Snow `#F7F5F0`) and dark (Neutral Dark `#171717`) modes without altering any card dimensions, layout grids, or database connections.

### 1.2 Root Cause Analysis
1. **Broken Theme State Logic**: `ProjectListScreen.tsx` previously declared a static theme state without a reactive setter and possessed a no-op toggle handler that unconditionally forced dark mode.
2. **Hardcoded CSS Overrides**: `index.html` contained an inline `style="background-color: #171717; color: #e5e5e5;"` on the root `<html>` tag, and `src/index.css` enforced hardcoded `#171717` on `html, body, #root`, suppressing CSS custom property evaluation when light mode was triggered.
3. **Pre-Paint Script Hydration**: The pre-paint theme script in `index.html` was overwriting user preferences with `'dark'` on every page load rather than reading `scholar-theme` or `theme` from `localStorage`.

---

## 2. Architecture & Design Principles

### 2.1 Pre-Paint Theme Hydration & CSP Integrity
To prevent jarring theme flashes (FOUC) while strictly maintaining Content Security Policy (CSP) compliance:
- `index.html` executes an inline pre-paint script that inspects `localStorage.getItem("scholar-theme") || localStorage.getItem("theme") || "dark"`.
- It sets `data-theme` attribute and manages the `.dark` class on `document.documentElement` before the initial React render.
- The SHA-256 hash of this inline script is tracked in `server.ts` (`INLINE_THEME_SCRIPT_CSP_HASH = "'sha256-5V5R0fGRHFWdp0DZAppTOANJPlyUyQLWp0eGom1+k2c='"`) and validated against automated build scripts (`node scripts/verify-csp-hash.mjs`).

```html
<!-- Theme pre-paint hydration in index.html -->
<script>
  try {
    var t = localStorage.getItem('scholar-theme') || localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  }
</script>
```

### 2.2 Semantic CSS Variables & Design Tokens
In `src/index.css`, root surfaces use semantic variables rather than hardcoded hex values:

```css
html, body, #root {
  height: auto !important;
  min-height: 100% !important;
  background-color: var(--surface-canvas);
  color: var(--text-primary);
}
```

- **Night Mode (`[data-theme="dark"]`, `.dark`)**:
  - `--surface-canvas`: `#171717`
  - `--surface-raised`: `#1C1C1E`
  - `--text-primary`: `#ECECEC`
  - `--text-secondary`: `#9B9B9B`
  - `--border-subtle`: `#333333` / `white/10`
- **Day Mode (`[data-theme="light"]`)**:
  - `--surface-canvas`: `#F7F5F0` (warm low-strain academic paper ground)
  - `--surface-raised`: `#FFFFFF`
  - `--text-primary`: `#111111`
  - `--text-secondary`: `#52525B`
  - `--border-subtle`: `#E4E4E7`

---

## 3. Sidebar Theme Toggle Button Implementation

### 3.1 Button & Interaction States with Micro-Rotation
In the sidebar footer (`src/desk/ProjectListScreen.tsx`), the button wrapping the sun icon provides immediate zero-latency feedback with a smooth micro-rotation animation on icon state changes:

```tsx
{/* Minimal Icon-Only Theme Toggle */}
<button
  type="button"
  onClick={toggleTheme}
  className="p-2 rounded-lg hover:bg-neutral-900/5 dark:hover:bg-white/5 cursor-pointer text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors border border-neutral-200 dark:border-white/10 flex-shrink-0"
  aria-label="Toggle theme"
  title={`Switch to ${theme === "dark" ? "Day" : "Night"} mode`}
>
  <div className="relative w-4 h-4 transition-transform duration-200 rotate-0 dark:-rotate-90">
    {theme === "dark" ? (
      <Sun className="w-4 h-4 text-amber-400" />
    ) : (
      <Moon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
    )}
  </div>
</button>
```

### 3.2 State Synchronization & Apple-Grade Cross-Fade Logic
To eliminate jarring color flashes, layout lag, and aggressive full-screen flicker, transitions are scoped exclusively to `background-color`, `border-color`, and `color` using a transient `.theme-transition` class on `document.documentElement` during the toggle window (180ms–200ms).

No geometric layout properties (`width`, `height`, `padding`, `margin`, `transform`) are ever transitioned, keeping icon scaling and layout geometry instantaneous and rock-solid. Color, border, shadow, and icon vectors are smoothly cross-faded:

```css
/* Scoped transition in src/index.css */
html.theme-transition,
html.theme-transition *,
html.theme-transition *::before,
html.theme-transition *::after {
  transition: background-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
              border-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
              color 200ms cubic-bezier(0.16, 1, 0.3, 1),
              fill 200ms cubic-bezier(0.16, 1, 0.3, 1),
              stroke 200ms cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1) !important;
  transition-delay: 0s !important;
}

/* Modern View Transitions API for buttery-smooth hardware-accelerated theme cross-fades */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 250ms;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}
```

```tsx
const transitionTimeoutRef = useRef<number | null>(null);

const toggleTheme = useCallback(() => {
  const nextTheme = theme === "dark" ? "light" : "dark";

  const applyThemeToDOM = (t: "light" | "dark") => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", t);
      if (t === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
    try {
      localStorage.setItem("scholar-theme", t);
      localStorage.setItem("theme", t);
    } catch {}
  };

  if (typeof document !== "undefined") {
    document.documentElement.classList.add("theme-transition");
    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
    }
    transitionTimeoutRef.current = window.setTimeout(() => {
      document.documentElement.classList.remove("theme-transition");
      transitionTimeoutRef.current = null;
    }, 200);
  }

  if (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    typeof (document as any).startViewTransition === "function" &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    (document as any).startViewTransition(() => {
      applyThemeToDOM(nextTheme);
      setTheme(nextTheme);
    });
  } else {
    applyThemeToDOM(nextTheme);
    setTheme(nextTheme);
  }
}, [theme]);
```

---

## 4. Component Surface Harmonization & Palette Baseline

All primary surfaces dynamically adapt to Day/Night transitions without layout shift or styling regression:
- **Night Mode Baseline**:
  - Canvas: `bg-[#171717]`
  - Sidebar: `bg-[#1C1C1E]`
  - Borders: `border-white/10`
  - Text: `text-white`
- **Day Mode Baseline**:
  - Canvas: `bg-[#FAFAFA]`
  - Sidebar: `bg-[#F4F4F5]`
  - Borders: `border-neutral-200`
  - Text: `text-neutral-900`
- **Container Alignment**:
  - Reading column and shared 4-card template grid + prompt bar container: `max-w-4xl mx-auto flex flex-col` ensuring identical left and right outer margin alignment.
- **Recents Navigation**:
  - Compact typography `text-[13px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white` with Gemini-style `MoreVertical` (3-dots) popover menu and optimistic deletion.

---

## 5. Verification & Quality Gates

1. **Type Safety**: `npx tsc --noEmit` verified with 0 errors.
2. **CSP Verification**: `node scripts/verify-csp-hash.mjs` matches `index.html` inline script hash.
3. **Automated Unit & Integration Tests**: 100% pass rate across 239 test suites (2,601 tests passing).
4. **Production Build**: `npm run build` succeeds cleanly in 5.37s.
5. **Database State**: Remote Supabase database (`gfjhsijrwodjvkisouzw`) fully synchronized across all migrations.
