# Sci-Fi UI Redesign — Scoping Note v2 (2026-07-28)

**Status: DIRECTION REVISED, IMPLEMENTATION PARTIALLY DONE UNDER THE OLD
DIRECTION.** This is a docs-only session — no CSS, component, or token file
is touched here. What changed: the visual direction itself. The prior
version of this note ("Ancient Knowledge, Future Interface" — gold for
citations/scholarship, cyan for system/AI, serif for manuscript content) is
**retired**. Steps 1–6 of that direction's sequence were already built
(confirmed live in the codebase, not assumed — see "What's already shipped"
below), so this revision's most important job isn't re-scoping greenfield
work, it's being honest that some of what's already merged now needs
remapping under the new direction, and saying exactly how much.

## Why the old direction is dropped

The two-accent "gold = scholarship, cyan = system" split was a reasonable
idea on paper, but it doesn't survive contact with what this app actually
is: a dense, multi-panel research tool, not a cinematic landing page. Two
concrete problems, not style preference:

1. **It re-introduced exactly the ambiguity a strict accent system is
   supposed to prevent.** Once a product has agent-status colors, error
   colors, and a citation/scholarship color all living on the same dark
   canvas, "gold" stops reading as "ancient text" and starts reading as
   "a second brand color, competing with cyan for attention" — especially
   in dense screens like `AIControlCenter.tsx` (30 gold occurrences already)
   where status, diagnostics, and citation-adjacent copy sit in the same
   viewport.
2. **Serif-for-manuscript-content doesn't hold up as a system-wide rule
   on a HUD-style canvas.** Playfair Display against layered dark-grey
   panels with clipped corners and mono-labeled chrome reads as an
   inconsistency, not a deliberate contrast — the "ancient vs. future"
   tension worked in the abstract but the implementation choice (serif
   body copy) undercuts information density, which this product needs
   more than it needs a period-piece flourish.

Retiring both is a real design call, not a neutral cleanup — recorded here
so it stays traceable. The target now is unambiguously futuristic: layered
dark surfaces, one desaturated neon accent, display/mono typography, HUD-style
data panels, restrained glass, clipped geometric corners. No gold, no serif
body text, no second "meaning" accent unless research and my own judgment
below say the a11y states genuinely require one (they do — see below).

## Phase 1 — research findings (real sources, not a mood board)

- **`baxy5/scificn-ui`** ([GitHub](https://github.com/baxy5/scificn-ui),
  [scificn.dev](https://www.scificn.dev/)) — a shipped, installable
  (shadcn-CLI-compatible) React/Tailwind v4 sci-fi component library, not a
  concept board. Its token structure is the useful part to borrow: CSS
  variables → Tailwind `@theme` block → glow as an *animation/border*
  primitive, not a text-color primitive. It ships three swappable themes
  (phosphor green, holographic blue, warm bone/amber) built on the *same*
  structural tokens — confirms a single accent is meant to be a drop-in
  variable, not baked into every component individually. Its aesthetic
  leans "retro terminal / starship console," more CRT-phosphor than this
  app should go, but the token architecture and its glow-as-border
  discipline are directly reusable.
- **Material Design's dark theme guidance** ([Google Design](https://design.google/library/material-design-dark-theme),
  [Codelabs](https://codelabs.developers.google.com/codelabs/design-material-darktheme)) —
  the canonical source for "why `#121212`, not `#000000`": a true-black
  background makes text contrast so extreme it causes halation/eye strain
  at normal reading distance, and pure black can't express elevation
  (shadows don't read against black). Material's own worked method:  start
  from the base dark value, then step up perceived elevation by lightening
  the surface 5–8% per layer, not by adding shadow depth the way light-mode
  elevation does. Also load-bearing for the accent question: **saturated
  colors visually vibrate against dark surfaces** — the fix is desaturating
  and using lighter tones (roughly the "200–50" range, not the fully
  saturated core swatch) for anything meant to sit directly on a dark
  surface.
- **NN/g on glassmorphism** ([nngroup.com/articles/glassmorphism](https://www.nngroup.com/articles/glassmorphism/)) —
  translucency's central failure mode is exactly what you'd predict:
  contrast collapses when text sits over a busy or variable background,
  and the effect is explicitly called out as a poor fit for **information-dense
  interfaces** (their examples: data tables, dashboards, documents — this
  app, precisely). Their own mitigations: heavier blur radius on busy
  backgrounds (blur hides the busy-ness that would otherwise show through
  and fight the text), and — the one that matters most here — provide a
  way to *turn it off*, mirroring how Apple's own accessibility settings
  replace translucent chrome with solid fills for low-vision users.
- **Typography pairing conventions for sci-fi/technical interfaces**
  ([madegooddesigns.com futuristic-fonts round-up](https://madegooddesigns.com/futuristic-fonts/),
  [FontVibe HUD generator notes](https://fontvibe.ai/styles/cyberpunk-tech-hud)) —
  the recurring, load-bearing rule: **exactly one futuristic display face**,
  reserved for headings/wordmarks, paired with a *plain, highly-legible*
  monospace for data/labels/status — never two stylized display faces
  competing (the explicit anti-pattern cited: Orbitron headlines +
  Audiowide subheads reads as amateurish, not layered). HUD-specific
  convention: numeric readouts, coordinates, percentages, and status text
  are monospace by default, because fixed-width digits communicate "live
  system value" on sight, before the number is even read.
- **General 2026 dark-mode/token practice** (Muzli's dark-mode-systems
  guide, Uxcel's elevation guide, several 2026 trend round-ups) — converges
  on the same two points already above (layered-grey elevation over flat
  black; desaturate/lighten neon for dark backgrounds) plus one more that
  matters for this app specifically: **glow is explicitly recommended as a
  border/inner-stroke technique, not a text-shadow technique** — "inner
  glows" or emissive strokes on interactive-element edges, deliberately
  kept off body copy, is called out repeatedly as the way current
  professional dark-UI practice keeps neon legible.

## Phase 2 — my actual opinion, not a restatement of the brief

### Accent color: one core hue, cyan, holds up — but not as a strict single-shade rule

Research and the app's own already-shipped work agree on the hue: cyan
(`#22D3EE` core / `#0E7490` dim, already defined as `--color-cyan-accent`
and `--color-cyan-accent-dim` in `src/index.css:33-34`, already used 72
times across 11 files) is correct and shouldn't be re-litigated — it reads
as "system/machine," it's already desaturated/lightness-tuned relative to
a raw `#00FFFF`, and it's already verified at 10.55:1 against the darkest
brand surface. Where I disagree with a *strict* one-accent-does-everything
rule: **agent status, errors, and citation emphasis are three genuinely
different signal types, and collapsing them into one hue creates the exact
ambiguity problem gold caused, just with fewer colors.** An "agent
currently processing" glow and an "this citation is unverified" flag must
not be the same color if a user is expected to tell them apart at a
glance — that's not aesthetic nuance, it's the same signal-collision logic
that killed the two-accent gold system, just recurring one level down if
cyan is forced to cover it alone.

**Recommendation: keep cyan as the single "chrome/brand/system-active"
accent, and use semantic state colors — not a second brand accent — for
everything else.** Concretely:
- **Cyan** (`--color-cyan-accent` / `-dim`) — active/system/machine state,
  focus rings, borders, brand chrome. This is the "one accent" the brief
  asks for, and it's the right one.
- **Amber/warning** (`--color-warning-base`, `#F59E0B`, already a token)
  — degraded/attention states. Already exists, already distinct from cyan,
  no new token needed.
- **Red/error** — a new dark-mode-safe error token is needed; reusing a
  light-mode red directly on a dark surface will vibrate per the Material
  guidance above. Proposed: `--color-error-accent: #F87171` (Tailwind
  `red-400`, already lightness-shifted for dark backgrounds — not a raw
  `#EF4444`).
- **Citation/scholarship emphasis** does **not** get its own hue. This is
  the actual disagreement with the brief worth stating plainly: gold's
  original job (visually distinguish citation/source material) is better
  served on this canvas by a **structural** treatment — a left border-rule,
  a small mono-set source-tag chip, a slightly different panel elevation —
  than by a second color competing with cyan for the user's "something
  important" attention. Color is the scarcest signal a dark HUD-style UI
  has; spending a second hue on "this text cites something" when structure
  can do the same job is the mistake gold made, reintroduced under a new
  name. If a future session's live-verification shows structural emphasis
  genuinely isn't distinguishable enough in practice, revisit — but start
  without a second accent color and add one only if real usage proves it's
  needed, not preemptively.

This means the state-color question in the brief ("does a strict
one-accent rule hold up across agent status, error states, and citation
emphasis, or does it need a second tone") resolves as: **agent status and
errors need their own semantic tokens (amber/red, both already-conventional,
non-brand colors — not a second brand accent), citation emphasis does not
need a color at all.** One brand accent (cyan) stands.

### Typefaces: keep the existing mono, replace the display face, drop serif from body copy entirely

- **`--font-mono` stays `"JetBrains Mono"`.** It's already in heavy use
  (861 `font-mono` Tailwind-class occurrences per the prior version of this
  note, still true), it's a plain, highly-legible technical monospace
  matching the HUD-typography convention above (status readouts, agent
  metadata, numeric values), and swapping it for something more stylized
  (Space Mono, Share Tech Mono) would trade legibility for genre-flavor
  this app's information density can't afford. No change here — this is
  one place the existing system was already right.
- **`--font-display` changes from Playfair Display to a genuine technical
  display face** — proposal: **Rajdhani** or **Chakra Petch** (both free,
  Google Fonts, both angular/geometric with the "clipped corner" DNA the
  brief calls for structurally, both legible at heading sizes without
  tipping into illegible novelty-font territory the way Orbitron does at
  small sizes). Reserved for page-level headings and section titles only
  — not body copy, matching the "exactly one display face, used sparingly"
  convention from research above.
- **`--font-serif` is retired outright**, not repurposed. The old
  direction reserved it for "manuscript/citation content specifically" —
  under the new direction, citation/manuscript emphasis is handled
  structurally (see above), so there's no remaining job for a serif token
  to do. Any component currently setting `font-serif`/Playfair Display on
  manuscript body text reverts to the sans body font (`Inter`,
  `--font-sans`, unchanged) for actual reading content — dense research
  tooling reads better in a plain sans body face than in a display serif,
  full stop, independent of the sci-fi theme question.

### Glass/translucency: allowed as a border/chrome accent, never as a body-content surface

NN/g's finding is unambiguous and directly on-point for this app: this
product **is** the "data table / dashboard / document" case they name as a
poor fit for glassmorphism. My recommendation is narrower than "use it
sparingly" — it's a hard rule with one exception:

- **Never** apply `backdrop-blur`/translucency to a surface that contains
  primary reading content (manuscript text, citation lists, agent output,
  form fields) — these get **flat, opaque** layered-grey surfaces, full
  stop. This is where the existing `.glass-effect` class (`index.css:85`)
  needs auditing once implementation resumes: it's currently applied
  broadly enough (`.glass-effect h2/h3/h4`, `.text-white` overrides, button
  color carve-outs) that it's clearly being used as a general panel
  background today, not reserved for chrome — that scope needs narrowing,
  not just re-themeing.
- **Allowed**: translucency on modal/overlay *scrims* (the dimming layer
  behind a modal, where there's deliberately no text to fight for
  contrast), and on floating chrome that sits *above* content rather than
  containing it (the command palette's own backdrop, floating
  action-button clusters). `CommandPalette.tsx` already earns this
  treatment structurally — it's an overlay, not a content surface.
- If a genuine glass panel is wanted for a content-adjacent surface
  (e.g., a status sidebar), the NN/g mitigation applies: raise blur radius
  enough that the content behind it is illegible mush (not "artfully
  softened text"), and verify contrast against the *worst-case* background
  behind it, not the best case.

## What's already shipped under the old direction (confirmed live, not assumed)

This matters for scoping because it means "drop gold" is not a hypothetical
future constraint — it's a real, already-merged remapping job:

| File | Gold (`brand-300`/`#C08A3E`) occurrences | Cyan-accent occurrences |
|---|---|---|
| `src/index.css` | 8 | (token definitions) |
| `src/components/layout/AppHeader.tsx` | 1 | — |
| `src/components/layout/AppFooter.tsx` | 0 | — |
| `src/components/CommandPalette.tsx` | 0 | — |
| `src/components/agents/ActiveAgentsPanel.tsx` | 3 | — |
| `src/components/AIControlCenter.tsx` | 30 | — |
| `src/components/AISetupWizard.tsx` | 9 | — |
| `src/components/ResearchIntelligenceDashboard.tsx` | 20 | — |
| **Total across the 6 already-redesigned files** | **71** | **72 across 11 files app-wide** |

(`sci-fi-redesign-progress.md` confirms Steps 1–6 of the prior sequence are
marked 🟢 done; Step 4's own notes already record a deliberate, non-mechanical
approach to the navy question — worth reusing that same judgment-call
discipline for the gold remap, not a blind find/replace.)

`:focus-visible` (`index.css:325`) and a `prefers-reduced-motion` media
query (`index.css:334`) already exist from Step 1 — the a11y guardrails
below are **already partially satisfied**, not still-hypothetical asks.
Re-verify they're correctly scoped once gold/serif are removed, since
removing rules near them risks collateral deletion, but they don't need to
be built from zero.

## Non-negotiable accessibility guardrails (unchanged in substance from v1, re-affirmed after research — not weakened)

Research reinforced every one of these rather than giving grounds to
relax any of them:

1. **Base surface near `#121212`, elevation via layered greys, never pure
   black** — directly Material's own stated rationale (contrast/halation
   at reading distance, shadows unreadable against true black). No
   disagreement to record here.
2. **Neon desaturated and lightness-adjusted for dark backgrounds** —
   Material's "saturated colors vibrate on dark surfaces" finding is the
   exact mechanism, not a style preference. Already correctly applied to
   the existing cyan tokens (verified 10.55:1 contrast, per the code
   comment at `index.css:28-34`).
3. **Glow/bloom on borders, dividers, and state indicators only — never
   behind or around text.** Directly corroborated twice in research: the
   "inner glow as border/stroke, not text-shadow" convention, and NN/g's
   contrast-collapse warning about translucent/glowing effects sitting
   under text. Halation for readers with astigmatism is the mechanism;
   both sources independently point at the same fix.
4. **4.5:1 text contrast, 3:1 UI components/graphics, checked per
   component as built** — unchanged, still the binding standard, still to
   be verified with real computed-style checks (the method already
   established this project's own contrast-fix session used), not
   eyeballed.
5. **Motion state-driven only, under 250ms, `prefers-reduced-motion`
   respected from the first component** — unchanged. Already partially
   true (the media query exists from Step 1); needs re-verification that
   whatever survives the gold/serif rework still respects it, not a
   from-scratch build.

## Exact token values for the landing palette

Recorded here so implementation has a concrete starting point, not a
"whoever picks this up decides" gap — these are still subject to real
contrast verification as each component is touched, per guardrail #4, but
they're a considered starting point, not placeholders:

```css
/* Layered-grey dark surface scale — replaces --color-brand-500..950 as the
   primary surface system. Each step is a ~6-8% luminance increase over the
   previous, per Material's own elevation method. */
--color-surface-0:   #121212;  /* base page background, never pure black */
--color-surface-1:   #1A1A1A;  /* first elevation: cards, panels */
--color-surface-2:   #232323;  /* second elevation: nested panels, popovers */
--color-surface-3:   #2C2C2C;  /* third elevation: modals, top-most overlays */
--color-border-subtle: #383838; /* dividers, resting borders — no glow */

/* System/brand accent — unchanged from what's already shipped, already
   contrast-verified. No new value needed, just a wider, more disciplined
   application once gold is removed. */
--color-cyan-accent:      #22D3EE;
--color-cyan-accent-dim:  #0E7490;

/* Semantic state colors — NOT a second brand accent, see Phase 2 above. */
--color-warning-accent: #F59E0B; /* already exists as --color-warning-base, reused */
--color-error-accent:   #F87171; /* NEW — Tailwind red-400, dark-mode-safe lightness */

/* Typography */
--font-sans:    "Inter", ui-sans-serif, system-ui, sans-serif;   /* unchanged, body copy */
--font-display: "Rajdhani", "Chakra Petch", sans-serif;          /* CHANGED from Playfair Display — headings only */
--font-mono:    "JetBrains Mono", monospace;                     /* unchanged */
/* --font-serif retired — no replacement token, no remaining call sites by design */
```

Text on any surface above must still individually clear 4.5:1 — these
values are a starting point for per-component verification, not a
pre-cleared pass.

## Recommended implementation sequence (revised — reflects what's already built, and the two now-larger jobs called out explicitly)

Steps 1–3 and 5–6 below were already executed under the old direction and
need **rework, not fresh construction** — the structural work (dark
surfaces, `:focus-visible`, `prefers-reduced-motion`, cyan accent,
clip-path chrome) stays; only the gold/serif removal and any two-accent
assumptions baked into those components need revisiting. Step 4 (navy) was
already scoped narrowly and its own judgment call still holds. The two
jobs called out in this task's own brief — **gold removal** and **navy →
layered-grey remapping** — are each large enough on their own merits to be
their own explicit steps, not folded silently into the components that
happen to contain them:

1. **Gold removal and remapping (NEW, own step)** — 71 confirmed
   occurrences across the 6 already-redesigned files (`index.css`,
   `AppHeader.tsx`, `ActiveAgentsPanel.tsx`, `AIControlCenter.tsx`,
   `AISetupWizard.tsx`, `ResearchIntelligenceDashboard.tsx`), plus whatever
   remains in the ~28 components not yet touched by the redesign. Each
   occurrence needs the same classification discipline Step 4's navy work
   already modeled: is this genuinely a citation/scholarship signal (→
   remove the color, apply the structural treatment from Phase 2 instead),
   or was gold being used generically as "the warm accent" for something
   that isn't citation-related at all (→ likely maps to cyan, warning, or
   plain neutral text, case by case)? Not a mechanical find/replace.
2. **`#1A365D` navy → layered-grey remap (re-scoped, not new)** — 632
   occurrences across 29 files per the original count; Step 4's own
   progress notes already established that this is NOT a single-token swap
   (the majority are generic primary-CTA buttons and standard light-mode
   heading/body text, not system-state signals) and already did the
   narrow, correct classification for the two genuine system-chrome
   matches found so far (`ManuscriptDraftingWorkspace.tsx`,
   `ManuscriptEditorWorkspace.tsx`). What's newly true under this
   revision: navy's *replacement* target is no longer "cyan where it's a
   system signal, else leave navy" — it's "the layered-grey surface scale
   (`--color-surface-0..3`) wherever navy was serving as a light-mode
   surface/background color, cyan only where it was already a genuine
   system-state signal." Re-audit the ~630 "correctly navy, out of scope"
   occurrences from Step 4's prior pass against this new target, since
   "out of scope for a cyan-vs-navy question" and "out of scope for a
   light-surface-vs-dark-layered-grey question" are not the same
   determination.
3. **`src/index.css` glass-effect audit** — narrow `.glass-effect`
   (`index.css:85`) from its current broad application down to
   overlay/scrim/floating-chrome use only, per Phase 2's glass rule. This
   wasn't part of the original sequence at all; research surfaced it as
   necessary, not optional, given how broadly the class is already applied.
4. **Rework of the 6 already-redesigned components** (`AppHeader.tsx`/
   `AppFooter.tsx`, `CommandPalette.tsx`, `ActiveAgentsPanel.tsx`,
   `AIControlCenter.tsx`/`AISetupWizard.tsx`, `ResearchIntelligenceDashboard.tsx`)
   — apply the results of steps 1–3 to each; re-verify `:focus-visible` and
   `prefers-reduced-motion` still function correctly post-edit (they
   already exist, don't rebuild them, just don't silently break them);
   swap `--font-display` call sites from Playfair Display to Rajdhani/
   Chakra Petch; remove any remaining serif body-copy usage.
5. **Everything else in `src/components/`** (remaining ~28 non-test files)
   — unchanged guidance from v1: adopt incrementally as touched by other
   work, not as a batch migration, matching this project's standing
   practice for every other cross-cutting change to date.

## Progress log (v2 execution, 2026-07-28 onward)

Executed as an ordered loop per this session's own instruction: implement →
`tsc --noEmit` + full suite → live-verify in a real browser → commit that
step alone → tick off here → next step. The step order below reflects this
session's explicit sequencing (tokens → global chrome → navigation → navy
remap → gold remap → CommandPalette/ActiveAgentsPanel/ResearchIntelligence-
Dashboard/remaining), which differs from this doc's own internal ordering
above (gold before navy) — per this session's own instruction to follow its
sequence where the two differ.

| # | Step | Status | Commit |
|---|------|--------|--------|
| 1 | Design tokens (`src/index.css` + `index.html`) | 🟢 done | `59702c8` |
| 2 | Global chrome (header/footer/base surfaces) | 🟢 done | `cde1e06` |
| 2.5 | Navigation (browser history, deep links, state-loss regressions, guarded transitions, focus management) | 🔲 not started — see note | — |
| 3 | `#1A365D` navy → layered-grey remap (632 occ., 29 files) | 🔲 not started | — |
| 4 | Gold citation/scholarship accent remap | 🔲 not started | — |
| 5 | `CommandPalette.tsx` → `ActiveAgentsPanel.tsx` → `ResearchIntelligenceDashboard.tsx` → remaining components | 🔲 not started | — |

### Step 1 notes

Added the full token layer: `--color-surface-0..3` layered-grey elevation
scale, `--color-border-subtle`, `--color-warning-accent`/
`--color-error-accent` semantic state colors, `--motion-duration-fast/base/
slow` + `--motion-ease` motion tokens, and swapped `--font-display` from
Playfair Display to Rajdhani (loaded in `index.html`). `--font-serif` and
`--color-brand-500..950` deliberately NOT removed yet — still consumed by
27/25+ unmigrated files respectively; removing them now would be an
uncontrolled visual sweep, not a scoped step.

**Real bug caught by live verification**: Tailwind v4's `@theme` block
silently drops any custom property whose namespace it doesn't recognize.
`--motion-*` isn't a namespace Tailwind understands, so the motion tokens
resolved to an empty string via `getComputedStyle` until moved to a plain
`:root` block outside `@theme`. Also found and fixed: the `h2, h3, h4,
.font-display` heading rule was hardcoded to `var(--font-sans)`, meaning
the pre-existing `--font-display` token had *never* actually affected any
heading in the app — now genuinely wired to the token.

Verified live: all new custom properties resolve correctly via
`getComputedStyle`; `:focus-visible` ring still renders (cyan, visible on
the settings-gear button); `prefers-reduced-motion` media query mechanism
intact; computed WCAG contrast for new tokens against `--color-surface-0`
(`#121212`): `--color-error-accent` 6.77:1, `--color-cyan-accent` 10.37:1
(sRGB relative-luminance formula, both comfortably above the 4.5:1 text
floor).

### Step 2 notes

**Live verification caught a second, significant real bug**, the same
class as the already-documented `ActiveAgentsPanel` dead-code issue:
`AppHeader.tsx`/`AppFooter.tsx` — the dark/cyan chrome built in the prior
redesign session — had **zero live imports anywhere in the app**. `App.tsx`
rendered its own separately-evolved inline `<header>`/`<footer>` JSX
instead, meaning the entire "global chrome" redesign had no visible effect
for a real user, confirmed by a live screenshot showing a plain white
header (`rgb(255,255,255)`) even with Step 1's tokens already in place.
Fixed by confirming full structural/behavioral parity between the inline
JSX and `AppHeader.tsx`/`AppFooter.tsx` (same conditional buttons, same tab
list, same Active-Model selector, same Auto-Fallback indicator — nothing
would be lost), then replacing the inline JSX with `<AppHeader>`/
`<AppFooter>` in `App.tsx`. Also migrated `.chrome-dark`/
`.chrome-dark-subtle` off `--color-brand-900/950` onto the new
`--color-surface-1`/`-2` tokens, and removed 7 now-dead icon imports left
behind in `App.tsx`.

Verified live across the real dashboard and workspace views (not the
isolated component in isolation): dark header/tab-nav/status-bar/footer all
render, tab-click switches views and highlights cyan correctly, keyboard
focus lands on tab buttons, and the Research Agents tab shows the
(also-previously-dead, now genuinely reachable) `ActiveAgentsPanel` with
real "Online" status pills. `tsc --noEmit` clean, full suite 869/871 (same
2 pre-existing unrelated failures).

**Worth flagging for whoever picks up remaining steps**: given two
redesigned components in a row (`ActiveAgentsPanel` previously,
`AppHeader`/`AppFooter` now) turned out to be dead code never actually
wired into the live render tree, it's worth a deliberate grep-for-live-
imports check on `CommandPalette.tsx`, `AIControlCenter.tsx`,
`AISetupWizard.tsx`, and `ResearchIntelligenceDashboard.tsx` before
assuming Step 5's starting point is genuinely live, rather than repeating
this discovery a third time mid-step.

### Why the loop paused here, not further

Steps 1–2 are complete, verified, and committed. The loop intentionally
stops before Step 2.5 (Navigation) rather than attempting a shallow pass at
it: the navigation requirements for this pass (real browser-history entries
per screen, correct deep-link resolution, state-loss regression tests
specifically targeting the `useProjectPersistence.ts` stale-closure class of
bug under rapid back/forward navigation, honest invalid-transition guards,
and full keyboard/focus-management verification across the phase workflow,
AI setup wizard, and settings sub-tabs) are a substantial, standalone body
of engineering work — not something that can be verified honestly in the
time remaining without risking exactly the kind of unverified-success claim
this project's standing discipline exists to prevent. This is a scope/time
boundary, not a failed verification — nothing here is broken or left in a
bad state; Steps 1–2 are genuinely done and committed independently.

## What this note deliberately still does not do

No component is touched in this session — this is a direction rewrite, not
implementation. The exact classification of each of the 71 gold
occurrences (citation-signal vs. generic-warm-accent) and the re-audit of
the ~630 "correctly navy" occurrences from the prior Step 4 pass are real
per-occurrence design decisions for whoever picks up steps 1–2 above, to
make and verify live — same discipline this project has applied to every
other systemic change, restated because it's easy to skip under redesign
pressure.

## Sources consulted

- [baxy5/scificn-ui](https://github.com/baxy5/scificn-ui) and [scificn.dev](https://www.scificn.dev/) — shipped sci-fi component library, token/theme structure
- [Material Design's Color Palette — dark theme](https://design.google/library/material-design-dark-theme) and [Design a dark theme with Material and Figma (Codelabs)](https://codelabs.developers.google.com/codelabs/design-material-darktheme) — `#121212` rationale, elevation-by-lightening method, saturated-color-on-dark-surface guidance
- [NN/g — Glassmorphism](https://www.nngroup.com/articles/glassmorphism/) — translucency contrast failure modes, dense-UI unsuitability, blur/off-switch mitigations
- [madegooddesigns.com — Futuristic Fonts](https://madegooddesigns.com/futuristic-fonts/) and [FontVibe — Sci-Fi HUD Text](https://fontvibe.ai/styles/cyberpunk-tech-hud) — single-display-face convention, monospace-for-data-readouts convention
