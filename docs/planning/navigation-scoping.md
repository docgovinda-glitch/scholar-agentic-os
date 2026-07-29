# Navigation Overhaul — Scoping Note (2026-07-28)

**Status: SCOPED. Phase 1 (settings sub-tabs + phase workflow hash reflection,
invalid-transition guard, focus management, state-loss regression tests) is
implemented and verified this session — see the progress log at the bottom.
Phase 2 (AI setup wizard per-mode step deep-linking) is scoped but not
started.** Written before implementation, per this session's instruction,
from direct inspection of the running app and its routing/state code — not
assumed from memory of prior sessions.

## Current routing approach (as found, before this session's changes)

The app has exactly one router: a hand-rolled two-way `window.location.hash`
sync, inline inside `App.tsx` (lines ~147-198 before this session). There is
no library (no `react-router`, no `@tanstack/router`) and no second routing
mechanism competing with it in the live render path.

- **Hash → state**: a `hashchange` listener plus an on-mount parse
  (`parseAndApplyHash`) reads `window.location.hash` and calls
  `setOnboardingStep`/`setViewMode`/`setActiveTab` accordingly. Recognizes
  exactly four shapes: `#login` (implicit, no hash), `#onboarding/<step>`,
  `#dashboard`, `#workspace/<tab>`.
- **State → hash**: a second `useEffect`, keyed on
  `[user, onboardingStep, viewMode, activeTab]`, computes a `targetHash` and
  assigns `window.location.hash = targetHash` whenever it differs from the
  current hash. Assigning `location.hash` always pushes a new history entry
  in every browser (it is not `replaceState`), so at this coarse
  granularity — onboarding step / dashboard-vs-workspace / top-level tab —
  browser back/forward already worked before this session, confirmed live.

**A second, dead copy of this exact logic already existed**:
`src/hooks/useHashNavigation.ts` (previously found and left un-flagged in
this session's Task 1 audit — a sixth dead-code instance, in the same
family as the five documented in `HANDOVER.md`, caught while investigating
navigation rather than during the audit itself). It has an identical
hash-parsing shape to `App.tsx`'s inline version but is imported nowhere.
This session reused and fixed this file rather than leaving a second stale
copy sitting next to a rewritten inline version — see "What this session
built," below.

## What state lives where (three surfaces, three different gaps)

1. **Phase workflow (A → I, `WORKFLOW_PHASES` in `types.ts`)**. The active
   phase lives in `project.currentPhase` — persisted project data, not
   component state — but **the hash never encodes it**. `#workspace/workspace`
   is the same URL whether the user is on Phase A or Phase I. Clicking any
   phase button in the sidebar (`App.tsx`, phase-timeline sidebar) calls
   `handlePhaseChange(ph.id)` **completely unconditionally** — confirmed by
   reading the click handler and by checking the now-deleted
   `WorkspacePhaseView.tsx` for any gating logic before its deletion (git
   history checked): there was never any gate anywhere, live or dead. A
   user can click straight from Phase A to Phase I with zero validation.
   Browser back/forward does nothing for phase changes today — only a hash
   change creates a history entry, and phase changes don't touch the hash.
2. **AI setup wizard per-mode flows (`AISetupWizard.tsx`)**. `step` (a
   number), `selectedMode`, and `selectedProviders` are all plain
   `useState`, entirely local to the component, with zero hash reflection.
   Landing on `#onboarding/ai-setup` always restarts at the mode-selection
   screen (`step === 0`) regardless of how far the user had gotten —
   confirmed live in this session's own prior turns (every fresh reload of
   this URL during earlier testing landed back at mode selection). Browser
   back from inside a per-mode flow exits the entire AI-setup step, not one
   screen back within it.
3. **Settings sub-tabs (`AIControlCenter.tsx`)**. `activeSubTab` (`"mode" |
   "status" | "credentials" | "local" | "keys" | "advanced" | "diagnostics"`)
   is plain `useState`, zero hash reflection. `#workspace/settings` is the
   same URL for all seven sub-tabs. Confirmed live: switching sub-tabs does
   not change the hash or create a history entry.

## A fourth, related gap found during this investigation (not one of the three named surfaces, but load-bearing for "no state loss on navigation")

`useProjectPersistence.ts`'s `updateProject` has the documented
projectRef-based fix for the same-tick stale-closure race (code comment,
`useProjectPersistence.ts:31-47`) — but **`OnboardingWizard.tsx` has its own,
entirely separate, inline `updateProject` function** (not the hook's
version) used for every onboarding-phase project update (AI setup, knowledge
vault). It reads `project` directly from `useAuth()`'s context value on each
call, with no ref-based dedup. Two `updateProject` calls in the same tick
during onboarding could still silently drop the first call's fields — the
exact `complianceRules`-dropping failure class the app-wide fix was written
for, just re-introduced via a second, unfixed code path. This is now in
scope for the "no state loss on navigation" requirement's regression tests.

## What this session built (Phase 1)

1. **Fixed and wired in `useHashNavigation.ts`** rather than leaving it dead
   next to a growing inline copy. Extended its recognized hash shapes to:
   - `#workspace/workspace/<phaseId>` — phase workflow, deep-linkable.
   - `#workspace/settings/<subTab>` — settings sub-tabs, deep-linkable.
   `AIControlCenter.tsx` and `App.tsx`'s phase view now read/write through
   this one hook instead of local-only state for the parts of their state
   that are meaningful navigation destinations.
2. **Invalid-transition guard for the phase workflow**: a phase is
   enterable if it is at or before the furthest phase the project has ever
   reached (tracked as a new `project.furthestPhase` field, defaulting to
   `currentPhase` for existing projects via the same migration pattern
   `useProjectPersistence.ts` already uses for other schema additions), or
   is the single next phase after the current one. Attempting to jump
   further via a crafted deep link or an edited hash shows an honest
   inline message naming the phase that must be completed first — never a
   silent redirect, never a blank panel.
3. **Focus management**: on every hash-driven navigation (phase change,
   settings sub-tab change, top-level tab change), focus moves to the
   destination panel's heading via a shared `useFocusOnNavigate` hook
   (`ref` + `tabIndex={-1}` + `.focus()` in a `useEffect` keyed on the
   navigation value) — verified against the real accessibility tree, not
   assumed from the ref call existing.
4. **State-loss regression tests**: a new `useProjectPersistence.navigation.test.ts`
   drives an `updateProject` call and a hash-driven navigation in the same
   tick (the exact `complianceRules`-dropping shape), a rapid
   back/forward/back hash sequence, and a deep-linked phase change
   concurrent with a save — 3 new cases, all passing, none dropping a
   field. `OnboardingWizard`'s separate, unfixed `updateProject` was
   migrated onto the same `useProjectPersistence` hook instead of keeping
   its own parallel implementation — removing the second code path rather
   than duplicating the fix.

**A real bug live verification caught mid-implementation, not assumed**:
the first working version of the `useHashNavigation` wiring passed inline
arrow-function wrappers (`(step) => setOnboardingStep(...)`) directly as
the hook's `setOnboardingStep`/`setActiveTab` params. A new function is a
new reference every render, and the hook's hash→state effect depends on
that reference's identity — so it re-ran on every render. Combined with
`handlePhaseChange` originally calling `updateProject` even for a
phase-to-itself no-op (creating a new `project` object reference every
time), this fed into a genuine infinite render loop, caught live via the
browser's own console: `Maximum update depth exceeded`. Fixed by wrapping
both setters in `useCallback` and adding an explicit no-op guard
(`phase === project.currentPhase`) to `handlePhaseChange` as a second,
defense-in-depth half of the fix. Re-verified clean afterward (console
checked before and after every subsequent live-verification step below).

**A known, real, honestly-recorded gap, not silently left out**: the
invalid-transition guard's message (`phaseGateMessage`) displays correctly
when a user *clicks* a phase beyond what's allowed — verified live,
screenshot taken. It does **not** currently display when the same
over-reach happens via a **deep link on page load** (`#workspace/workspace/D`
when only B has been reached) — the app still does the honest half
correctly (falls back to rendering the nearest valid phase, B, never a
broken half-screen or silent full jump to D), but the reason text isn't
shown on that specific path, only the fallback itself. Root cause not yet
isolated (something about the on-mount hash→state parse vs. the
immediately-following state→hash correction's timing clears or never sets
the message on this path specifically, whereas the same code path from a
live click does set it correctly). Recorded here rather than chased
further under this session's remaining time — the safety property that
matters most (never a broken screen, never a silent skip-ahead) holds in
both cases; only the explanatory message is missing on the deep-link path.

## What's explicitly NOT done (Phase 2, scoped but not started)

- **AI setup wizard per-mode step deep-linking** (`AISetupWizard.tsx`'s
  internal `step`/`selectedMode`/`selectedProviders`). This needs its own
  hash sub-scheme (e.g. `#onboarding/ai-setup/<mode>/<step>`) threaded
  through a component with substantially more internal state than the
  other two surfaces, plus careful handling of what "resuming mid-flow via
  a deep link" honestly means when `selectedProviders` can't be
  reconstructed from a URL alone (no provider list is a serializable route
  param on its own — provider selection is a set, not a single value).
  Scoped, not started: doing this properly is a comparable amount of work
  to everything in Phase 1 combined and deserves its own session rather
  than a rushed pass tacked onto this one.
- A full keyboard-only pass across **all three** surfaces end-to-end
  (forward, backward, browser back/forward, deep link) — Phase 1's
  keyboard/focus verification covers the phase workflow and settings
  sub-tabs live; the AI setup wizard's existing keyboard operability
  (established in the earlier AI-modes redesign session) was spot-checked
  but not re-verified against the new focus-management hook, since that
  hook isn't wired into `AISetupWizard.tsx` in this pass.

## Progress log

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | Scoping (this document) | 🟢 done | same commit as items 2-5 |
| 2 | `useHashNavigation.ts` fixed + wired in, extended for phase/settings sub-routes | 🟢 done | same commit |
| 3 | Phase-workflow invalid-transition guard (`furthestPhase`) | 🟢 done | same commit |
| 4 | Focus management on navigation (`useFocusOnNavigate`) | 🟢 done | same commit |
| 5 | State-loss regression tests (`useProjectPersistence`, `OnboardingWizard` migration) | 🟢 done | same commit |
| 6 | AI setup wizard per-mode step deep-linking | 🔲 not started — own session | — |
| 7 | Deep-link phase-gate message not shown (fallback itself is honest, message text is missing on this one path) | 🔲 known gap, not fixed this session | — |
