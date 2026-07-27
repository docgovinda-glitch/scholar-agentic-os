# Sci-Fi UI Redesign — Scoping Note (2026-07-27)

**Status: SCOPED, NOT STARTED.** No CSS, component, or theme-token change
has been made. Every session since 2026-07-20 has parked this with
"separate, larger, out of scope for this pass" without ever actually
breaking it down — this note is that breakdown.

A real design proposal already exists —
`docs/planning/2026-07-20-session-notes.md` §1 ("UI Direction — Sci-Fi
Movie Aesthetic") — and its core direction still holds up. This note
verifies its factual claims against the current codebase (a lot has been
built in the ~week since: BYOK vault, agent pipeline, sample-document
learning, this session's own a11y pass and bundle code-splitting) and
turns it into an actual step sequence, since the original was explicit
that it was "design only" with no ordering discipline applied yet.

## Direction, confirmed still sound: "Ancient Knowledge, Future Interface"

Not a generic HUD skin — this product's real distinguishing feature is
reasoning over old texts (citations, Vedic Samhitas via
`VedicDatabase.tsx`, archival literature) through a machine-intelligence
layer. That tension is the aesthetic, not neon-for-its-own-sake:

- **Palette**: dark-first. `--color-brand-900`/`950` (`#06101F`/`#030810`,
  `src/index.css:28-29`) already exist as tokens, just unused as a real
  surface color anywhere today — confirmed via grep, they only appear
  inside `.glass-effect` dark-theme selectors (`index.css:195-206`), not
  as a page background. A cool **phosphor-cyan** accent (`~#5EEAD4`/
  `#22D3EE`) for active/machine/system states would be a genuinely new
  token — nothing like it exists in the current palette. Keep the
  existing gold (`--color-brand-300` / `#C08A3E`, `index.css:20`) as the
  "archival/ancient" accent for citations, Vedic references, and
  manuscript content specifically — this creates a two-accent system
  with actual meaning (cyan = system/AI, gold = scholarship/source)
  instead of one undifferentiated brand color doing both jobs.
- **Typography**: `--font-serif`/`--font-display` (Playfair Display,
  `index.css:5-6`) and `--font-mono` (JetBrains Mono, `index.css:7`)
  already both exist. **Correction to the original proposal**: it claimed
  `font-mono` is "already in the theme, currently unused for chrome" —
  that's now wrong (or was always wrong): `font-mono` Tailwind classes
  appear **861 times** across current `.tsx` files, so mono is already in
  heavy stylistic use, not sitting idle. The real distinction to establish
  isn't "introduce mono," it's "make the serif/mono split *mean something
  specific*" — serif reserved for actual manuscript/citation content,
  mono reserved for system chrome (labels, status readouts, phase
  indicators, agent metadata) — rather than mono being sprinkled
  decoratively wherever it currently is, without that content/chrome
  distinction being deliberate.
- **Motion**: `motion` (the npm package, not `framer-motion` —
  `package.json:30`) is a dependency used in exactly **1 file**,
  `src/components/CommandPalette.tsx` — confirmed still true, unchanged
  since the original proposal. No legacy animation pattern to fight.
  State-driven only (something happened → something animates), never
  idle/ambient decoration — scan-line/typewriter reveal for AI-streamed
  text (real SSE streaming already exists to hang this off of), clip-path
  panel wipes instead of generic fades, a restrained pulse on "agent
  active" states.
- **Reference touchstones** (unchanged from the original proposal, still
  the right anchors): *Blade Runner 2049* (amber archival holograms vs.
  cool chrome — the gold/cyan split), *Arrival* (ancient script through a
  technical-analysis UI — closest visual analogue to "Vedic text meets AI
  interface"), *The Expanse* (restrained, functional in-universe UI — the
  anti-example to over-glowed sci-fi, a guardrail against overdoing it).

## The real scale, quantified (not assumed)

This session's `#8C887F`/`#C08A3E` contrast fix (`8ac63e9`) touched 25
files and 207 text-color occurrences — and that was the **easy** end of a
palette change: two colors, mechanically classified, same hue kept, only
lightness adjusted. A real "sci-fi redesign" is a different order of
magnitude:

- **`#1A365D` (navy, the OTHER brand color)**: 632 occurrences across 29
  files — roughly 2.5–3x the raw occurrence count of the gold pass alone,
  and this is the color that would most directly become (or be replaced
  by) the new dark-surface/cyan system.
- **Other hardcoded hex in heavy use**, not yet classified for text-vs-
  decorative the way gold/neutral were this session: `#E5E7EB` (196
  occurrences), `#E2E8F0` (172), `#D1CEC7` (130), `#FAF9F6` (91),
  `#FAF8F5` (89), `#6B665E` (79), `#CBD5E1` (51), plus the two colors this
  session already fixed (`#76726A` 159, `#946A30` 48). These are borders/
  backgrounds/secondary text — a dark-first redesign touches all of them,
  not just the two brand accents.
- **Component surface**: 34 non-test `.tsx` files in `src/components/`
  (51 including subdirectories and tests). The original proposal's
  "highest-impact first" ordering remains sound and is reproduced below
  with current, re-verified line counts.
- **Accessibility debt, partially closed but not eliminated**: the
  original proposal's "aria-* in 1 of 31 components" is now stale in the
  optimistic direction — this session's a11y pass (`7ee5b42`) plus
  earlier keyboard-nav work brought real `aria-label`/`aria-labelledby`/
  `role=`/`tabIndex` usage up to **6 of 34** non-test components
  (`NonJournalRequirementsPanel.tsx`, `ManuscriptDraftingWorkspace.tsx`,
  `AISetupWizard.tsx`, `AIDisclosureReviewModal.tsx`). Still under 20%
  coverage. **No `:focus-visible` rule exists anywhere** in `src/index.css`
  or any component — the app relies entirely on the browser's default
  focus ring, confirmed via grep, unchanged from the original proposal's
  finding. **No `prefers-reduced-motion` handling exists anywhere**,
  also confirmed unchanged and still a real gap given the motion/pulse
  effects this direction calls for.

## The non-negotiable accessibility guardrails (per the original proposal's own §1 finding, restated because they're easy to skip under redesign pressure)

A dark, glow-accented redesign makes existing gaps *worse* by default,
specifically:

1. **Glow/color effects apply only to decorative chrome** (borders, icons,
   background) — body text always resolves to a plain, pre-verified
   high-contrast token (reuse this session's own contrast-verification
   method: real computed-style checks against the actual rendered
   background, not an eyeball check), never the glow color itself.
2. **`prefers-reduced-motion` from day one**, not retrofitted — pulse/
   flicker/scan-line patterns can trigger real vestibular issues.
3. **A real, explicit `:focus-visible` style on every redesigned
   component** — glow effects routinely replace the browser's default
   focus ring with something that looks good but isn't a functional focus
   indicator. Given `:focus-visible` doesn't exist anywhere today, this
   redesign is the natural place it finally gets built — not a follow-up.

## Recommended step sequence (incremental, ordered by impact-to-risk ratio — re-verified current line counts)

1. **`src/index.css` + `src/components/layout/AppHeader.tsx` (247 lines)
   / `AppFooter.tsx` (15 lines)** — the global chrome visible on every
   screen. Smallest surface area of the group, establishes the whole
   token system (new cyan accent, dark-surface tokens, `:focus-visible`,
   `prefers-reduced-motion` media query) in one place before anything
   else depends on it.
2. **`src/components/CommandPalette.tsx` (467 lines)** — self-contained
   overlay, doesn't touch business logic, already the one component using
   the `motion` library, and a command palette is the single most
   on-genre UI pattern available to establish the motion language on.
3. **`src/components/agents/ActiveAgentsPanel.tsx` (206 lines)** — small,
   and "agent status" (online/active/idle) is the natural home for the
   restrained-pulse motion pattern, reusable elsewhere afterward.
4. **`src/components/AIControlCenter.tsx` (1,012 lines, now the largest
   in this group — grew significantly since the original proposal's 945)
   / `AISetupWizard.tsx` (735 lines)** — thematically the strongest fit
   ("control center"), but do after 1–3 establish the pattern language,
   not before.
5. **`src/components/ResearchIntelligenceDashboard.tsx` (527 lines)** —
   natural home for data-viz-heavy treatment; most integration-heavy of
   this group, so last.

Everything else in `src/components/` (34 non-test files total) should
adopt the system incrementally as touched by other work, not as a batch
migration — matching how every other cross-cutting fix this project has
done (the contrast fix, the a11y labeling pass) was scoped narrowly and
verified at each step rather than attempted as one sweeping change.

## What this note deliberately does not do

No color values are finalized, no component has been touched, no palette
decision has been made. Per this project's own standing discipline
(confirmed repeatedly this session: contrast fix, bundle splitting,
sample-doc-learning journal-path wiring), a systemic change like this
gets scoped and estimated before a single line changes — this is that
scoping, not the start of implementation. The cyan accent value, the
dark-surface tokens' exact shades, and the `:focus-visible`/reduced-motion
CSS itself are all real design decisions for whoever picks step 1 up next
to make and verify live, not to guess at here.
