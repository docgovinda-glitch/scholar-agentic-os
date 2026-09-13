# ADR 64: Scientific Monochrome 334 155 Design System & Database Sync

> **Doc ID:** 64 · **Status:** Accepted · **Date:** 2026-09-13  
> **Authority:** Scientific Monochrome Design Directives & Database Integration

---

## 1. Context & Motivation

The Scholar Workspace dashboard and public entry surfaces previously featured dark styling, floating rounded cards (`rounded-xl`/`rounded-2xl`), multi-colored accent pills (orange, green, blue), and ambient background glows. 

To deliver an academic, highly precise, structural, and technical aesthetic, the UI has been unified under the **Scientific Monochrome 334 155** design system.

---

## 2. Core Design Directives

### 2.1 Two-Color Baseline
- **Background Ground**: Sand Off-White (`#F7F5F0`) — a warm, low-strain organic baseline reminiscent of archival academic paper.
- **Structural Foreground**: Charcoal (`#334155` / `#1E293B`) — deep, crisp high-contrast precision for all borders, body text, headings, wireframe icons, and active states.
- **Zero Color Accents**: Complete elimination of orange buttons, colored badges, and dropped elevation shadows (`--shadow-*: none`).

### 2.2 Technical Typography
- **Structural Text**: `Inter` (`--font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif`) for headers, body copy, and navigation labels.
- **Technical Data & Counters**: `JetBrains Mono` (`--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace`) for all tags (`OT-01`), status badges, word counts, and progress percentages.

### 2.3 Iconography & SVG Color Inversion
- All icons across the dashboard, top navigation, account dropdown, and category cards are 1px/1.5px stroke wireframe SVGs.
- Each icon mandates `fill="none"` and `stroke="currentColor"`. When parent containers invert to solid Charcoal (`bg-[#334155] text-[#F7F5F0]`), the child icons automatically invert to Sand Off-White without ad-hoc overrides.

### 2.4 Controlled 5% Opacity Hover States
- Large cards (`FORMAT_TILES` and `ProjectCard`) utilize subtle `hover:bg-[#334155]/5` hover feedback to prevent visual flashing while maintaining the calm background.

### 2.5 Geometric Sharpness
- All rounded elements have been replaced with sharp structural containers (`rounded-none`).
- All `--radius-*` tokens set to `0px`.
- Solid 1px and 2px Charcoal (`#334155`) borders define every panel and card boundary.

---

## 3. Database Synchronization & HTTP 406 Resolution

### 3.1 PostgREST HTTP 406 Error Root Cause
When querying user profiles via the Supabase JS SDK:
```typescript
supabase.from("profiles").select(...).eq("id", userId).single();
```
PostgREST appends `Accept: application/vnd.pgrst.object+json`. If a user in `auth.users` did not yet have a corresponding row in `public.profiles` (e.g. `userayuuid@gmail.com`), PostgREST returned HTTP 406 Not Acceptable (`PGRST116: The result contains 0 rows`).

### 3.2 Resolution & Self-Healing
1. **Query Hardening**: Switched `.single()` to `.maybeSingle()` in `src/services/supabaseAuthService.ts` (`signIn` and `getProfile`).
2. **Self-Healing Fallback**: If a profile row is missing, the service automatically inserts an active profile record or provides a graceful fallback, preventing crashes.
3. **Database Repair**: Inserted missing profile rows in `public.profiles` on the remote Supabase database (`gfjhsijrwodjvkisouzw`).
4. **Migration Verification**: Verified all 25 migrations in `supabase/migrations/` against remote `supabase_migrations.schema_migrations`.
5. **Guest Workspace Preview**: Enabled `/projects` to render in guest mode so visitors can immediately inspect the dashboard without authentication barriers.

---

## 4. Verification

- `scripts/verify-contrast.mjs`: **82/82 pairings checked, 0 failing** (WCAG AAA/AA passed 100%).
- `scripts/verify-csp-hash.mjs`: Inline theme script CSP hash matches expected sha256.
- `npx vite build`: Production bundle built with 0 errors.
- Vitest unit tests: 4/4 passed on landing and workspace specifications.
