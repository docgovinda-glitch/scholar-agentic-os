# Sci-Fi UI Redesign — Scoping Note v3 (2026-07-28, deep-navy space direction)

**Status: DIRECTION REVISED AGAIN, DOCS ONLY.** A new visual reference
(a supplied mockup, described in full in the "v3" section immediately
below) supersedes v2's grey-HUD direction before any of v2's Step 3/4 work
started. No CSS, component, or token file is touched in this pass — this
is the reversal-and-reconciliation record, per this session's explicit
instruction to stop after the docs and get sign-off before implementing.
v2's own history (research, the two already-shipped steps, the reasoning
that led to grey/no-gold) is kept below, unedited, for traceability — see
the "v2 (retired)" marker before it, and the reversal rationale in the new
section for exactly what changed and why.

## v3 — Deep-navy space direction (supersedes v2, 2026-07-28)

### What the mockup shows

A login/onboarding screen: deep-navy background reading as a space/orbit
scene (a photographic-feeling Earth-from-orbit image bleeding in from the
bottom edge, a starfield/constellation dot-and-line motif spanning the
full canvas above it). A central glass login card with a thin luminous
blue border and soft blue glow, containing the product wordmark (a serif
lockup — "Scholar" in white/blue, "Agentic OS" in gold), a tagline, and
credential fields. Either side of the card, "constellation" nodes (icon +
label + number, connected by thin lines like a node graph) presenting
stats — papers, journals, citations, datasets, knowledge vault, literature
reviews, research projects, collaborators. A left rail with an "AI Kernel"
status card, an "Active Models" list, an "AI Agents" count, and a "System
Status" hardware panel. A right rail of metric cards (today's research,
running agents, draft papers, literature reviews, journal suggestions,
knowledge vault utilization). A bottom global nav bar (Home/Vault/
Research/Journal/Prompt Studio/Workflows/Publish/Marketplace) and a
rotating quote in the corner. Blue is the dominant accent throughout;
gold appears only on the CTA button gradient, the wordmark's second word,
the "Create Scholar Account" link, and one icon (journal-suggestions
target). This asymmetry — blue everywhere, gold in exactly four
CTA/wordmark-adjacent spots — is itself the evidence for how narrowly
gold should be scoped (see below), not a suggestion to spread it further.

### Reversals, recorded so the change stays traceable

**1. The `#1A365D` navy → layered-grey remap (v2 Step 3, 632 occurrences)
is cancelled. Navy is the base again, not grey.** v2's own rationale for
grey (Material's `#121212`-not-pure-black guidance, avoiding a "flat dark"
look) still holds as *general* dark-UI practice — it just isn't what this
product's identity should look like. The mockup's whole visual identity
*is* navy-as-a-space-color, not neutral-grey-as-a-technical-color; keeping
grey would mean shipping two different unreconciled dark-UI languages side
by side (the grey surfaces already built in v2 Steps 1-2, and the navy the
mockup calls for everywhere else). Rather than adjudicate between them
component-by-component, the direction reverses: **rebuild the elevation
scale as layered navy tints**, reusing the navy lineage that was already
in this codebase before v2 ever touched it (`--color-brand-500` `#1A365D`,
`--color-brand-900` `#06101F`, `--color-brand-950` `#030810` — the
*original* brand palette, not a new invention). v2 Step 2 had already
started migrating `.chrome-dark`/`.chrome-dark-subtle` *off* this navy
lineage *onto* the grey `--color-surface-1/2` tokens — that migration is
exactly what gets reversed when implementation resumes.

**2. Gold is reinstated as a second accent — but scoped narrowly, not
restored to v1's "citations/scholarship" role.** v2's Step 4 (a full gold
removal/remapping pass) is cancelled outright, but so is v1's original
gold job. Neither the "gold = ancient/scholarly" framing (v1, retired
2026-07-28) nor "no gold at all" (v2) survives contact with the mockup:
gold appears in exactly four places — the primary CTA gradient, the
wordmark's second word, the "create account" link (itself CTA-adjacent),
and one icon. That's a **primary-action/wordmark accent**, not a
content-classification color, and not a general "warm emphasis" utility
either. Scoped this narrowly, v2's original objection to gold (a second
brand color competing with the system accent for the user's "something
important" attention, everywhere, on every dense screen) doesn't apply —
gold shows up in exactly one place per screen: the thing the user is
meant to actually click. This is a genuinely different design position
from both retired predecessors, not a partial rollback to either.

**3. Serif is permitted — in the wordmark only.** Neither v1's "serif for
manuscript/citation body content" nor v2's "serif retired outright, no
replacement" survive: the mockup's serif usage is exactly one lockup (the
product name), nothing else — labels, captions, stats, body copy, and UI
chrome are all sans/mono in the reference. `--font-serif` (Playfair
Display, already loaded in `index.html`) is kept, but its CSS scope
narrows to the literal wordmark component only — the current
`h1, .font-serif { font-family: var(--font-serif) }` rule is too broad
(it fires on every `<h1>` in the app, not just the product name) and needs
narrowing to a dedicated class/component when implementation resumes, not
a blanket heading rule. `--font-display` (Rajdhani, from v2 Step 1) is
**not** reversed here — nothing in the mockup's own labels/captions reads
as needing a different display face, and the brief doesn't ask for one;
Rajdhani stays the answer for section headings that aren't the wordmark.

### Reconciling the mockup against the non-negotiables (not copied uncritically)

**Contrast — measured against colors estimated from the reference image,
not pixel-sampled.** I do not have programmatic pixel access to the
supplied image, so the hex values below are considered visual estimates
from inspecting it, in the same spirit as this project's real
computed-style verification elsewhere — **these are a starting point for
implementation to re-verify with actual `getComputedStyle` contrast
checks once real tokens exist**, not a substitute for that verification,
consistent with guardrail #4 below.

| Pairing | Estimated hex | Computed ratio (sRGB relative-luminance formula) | Floor | Result |
|---|---|---|---|---|
| Luminous blue text/icons on base navy | `#3B9CFF` on `#080F1F` | 6.72:1 | 4.5:1 (text) | Passes |
| Luminous blue text/icons on panel navy (lighter layer) | `#3B9CFF` on `#0F1B36` | 6.00:1 | 4.5:1 (text) | Passes |
| Gold on base navy | `#E0A83D` on `#080F1F` | 8.96:1 | 4.5:1 (text) | Passes comfortably |
| Gold on panel navy | `#E0A83D` on `#0F1B36` | 8.00:1 | 4.5:1 (text) | Passes comfortably |
| Primary white/near-white body text on panel navy | `#F5F7FA` on `#0F1B36` | 15.90:1 | 4.5:1 (text) | Passes with large margin |
| Muted blue uppercase labels (e.g. "PAPERS") on panel navy | `#8FA3C4` on `#0F1B36` | 6.67:1 | 4.5:1 (text) | Passes |
| Panel-navy elevation step vs. base navy (non-text, e.g. a card border) | `#0F1B36` vs `#080F1F` | 1.12:1 | 3:1 (non-text) | **Fails** — needs a real border color/glow, not surface-luminance alone, to hit the 3:1 UI-component floor (see token values below) |

The one real failure this reconciliation surfaces: two adjacent navy
elevation steps are *too close in luminance* to satisfy the 3:1 non-text
floor on their own — exactly why the mockup's panels lean on a visible
luminous border rather than a luminance jump to read as "elevated." The
token values below make that border itself the thing that clears 3:1,
not the surface-color step. Everything else estimates comfortably above
floor, with enough margin that small estimation error in my color-picking
is unlikely to flip a pass to a fail — but every value here still needs
the same live `getComputedStyle` re-verification this project has applied
to every other token before shipping it, not a pass because it "looks
right" in a static reference.

**Glow behind text — unchanged, still wordmark-scale only.** The mockup's
own glow usage is consistent with this: the soft blue glow sits behind
the *login card as a whole* (chrome/border-adjacent) and around the
wordmark icon (display-scale), never behind the small-caps labels, stat
numbers, or body copy. No reconciliation needed — the mockup already
follows this guardrail; implementation just needs to not "improve" on it
by adding glow to smaller text for extra flourish.

**Background imagery — needs an explicit budget, which the mockup itself
doesn't specify.** Two real costs to control for, not just "make it look
like the picture":
- **Legibility**: every panel sitting on the starfield/photo background
  needs a real scrim/overlay behind it — the mockup's own glass panels
  already have enough opacity+blur to serve as this in practice (this is
  the *allowed* glass use from v2's own glass rule: overlay/floating
  chrome, not a raw content surface sitting directly on the image), but a
  panel implemented with too little backing opacity would fail this the
  moment the starfield behind it gets busy. Rule for implementation: any
  panel over the backdrop must independently hit the contrast floors
  above *against its own backing fill*, not against the photo — the photo
  must never be the only thing behind body text.
- **Performance/asset budget**: one background image only, loaded once
  globally (not per-panel, not per-route) — a compressed WebP/AVIF,
  target **≤250KB**, with a solid-navy CSS fallback background-color so
  there's no flash-of-unstyled-background before it loads and no broken
  experience if it fails to load. The constellation/node-graph motif
  (dots + connecting lines) should be CSS/SVG-generated, not part of the
  photo — cheap, themeable, and already how the mockup's own node-graph
  reads (perfectly aligned to specific stat icons, which a static photo
  couldn't do).

**Motion — unchanged.** State-driven only, every duration under 250ms,
`prefers-reduced-motion` respected — all already true of the token layer
v2 Step 1 built (`--motion-duration-fast/base/slow`, `--motion-ease`, the
existing `prefers-reduced-motion` media query) and none of it needs to
change for the navy/gold reversal. The mockup's own subtle pulse/glow
animations (the AI-kernel orbital rings, the online-status dots) are
exactly the "restrained pulse on active/status states" pattern already
called for — implementation should reuse the existing motion tokens for
these, not invent new ones.

### Revised token values (supersedes v2's grey/no-gold table)

```css
/* Layered-navy dark surface scale — REPLACES v2's --color-surface-0..3
   grey scale. Reuses/extends the navy lineage that predates the sci-fi
   redesign entirely (--color-brand-500/900/950), rather than inventing a
   new hue. Values below are visual estimates from the reference mockup,
   pending live contrast re-verification per the reconciliation above. */
--color-navy-0:  #030810;  /* = existing --color-brand-950, deepest layer / true page background */
--color-navy-1:  #06101F;  /* = existing --color-brand-900, base chrome surface */
--color-navy-2:  #0A172B;  /* = existing --color-brand-800, first elevation: cards, panels */
--color-navy-3:  #0F1B36;  /* NEW, one step lighter than brand-800: nested panels, the login-card surface */
--color-navy-4:  #172D4D;  /* = existing --color-brand-650, modals/top-most overlays */
--color-border-luminous: #3B9CFF33; /* ~20% alpha luminous-blue border — this is what clears the 3:1
                                        non-text floor between adjacent navy steps, not the surface
                                        luminance jump alone (see reconciliation above) */

/* Primary accent — distinct hue from the existing --color-cyan-accent
   (#22D3EE, more turquoise); the mockup's blue reads as a separate,
   less-teal blue. Kept as its own token rather than overloading
   cyan-accent's meaning — cyan-accent's existing consumers (Step 1/2
   work) get reworked onto this during implementation, not left split
   across two blues with no rule for which is used where. */
--color-luminous-blue:     #3B9CFF;
--color-luminous-blue-dim: #1E6FD9;

/* Gold — reinstated, SCOPED to primary CTA + wordmark only (see reversal
   #2 above). Reuses the existing --color-brand-300 lineage rather than a
   new hue, adjusted slightly warmer/brighter to match the mockup's more
   saturated gold — subject to the same live contrast re-check as
   everything else here. */
--color-gold-accent:     #E0A83D; /* was --color-brand-300 #C08A3E — brightened, re-verify live */
--color-gold-accent-dim: #A87630; /* = existing --color-brand-400, unchanged */

/* Typography — only the serif scope changes; font-display and font-mono
   are NOT reversed from v2 Step 1. */
--font-sans:    "Inter", ui-sans-serif, system-ui, sans-serif;   /* unchanged, body copy */
--font-display: "Rajdhani", "Chakra Petch", sans-serif;          /* UNCHANGED from v2 — section headings, not the wordmark */
--font-mono:    "JetBrains Mono", monospace;                     /* unchanged */
--font-serif:   "Playfair Display", serif;                       /* REINSTATED, but scope narrows to
                                                                     the wordmark component only —
                                                                     never a general h1/heading rule */
```

`--color-warning-accent`/`--color-error-accent` (v2 Step 1) are unaffected
by this reversal and stay as-is; they were never part of the grey-vs-navy
or gold question.

### Revised implementation sequence (supersedes v2's steps 3 and 4 outright)

v2 Steps 1 and 2 (design tokens; global chrome) are **not** thrown away —
they're reworked, not rebuilt from scratch, since most of what they built
(the `:focus-visible`/`prefers-reduced-motion` rules, the motion tokens,
the semantic warning/error colors, the overall "tokens-first" discipline)
carries forward unchanged. What changes is the surface/accent values
themselves and where `.chrome-dark`/`.chrome-dark-subtle` point.

1. **Token rebuild** — add the navy scale + `--color-luminous-blue` +
   `--color-gold-accent` values above to `src/index.css`; do NOT delete
   `--color-surface-0..3` or `--color-cyan-accent` yet if anything still
   consumes them (check live-import status first, per the dead-component
   audit discipline this project now has standing practice for) — retire
   them once every consumer is migrated, not before.
2. **Rework the 2 already-shipped components** (`AppHeader.tsx`/
   `AppFooter.tsx`'s `.chrome-dark`/`.chrome-dark-subtle`,
   `ActiveAgentsPanel.tsx`) off `--color-surface-1/2` and onto the new
   `--color-navy-*` scale; reinstate gold **only** at any genuine
   primary-CTA/wordmark spot in these files (there may be none — that's a
   legitimate outcome, not a sign the step is incomplete).
3. **Wordmark component** — if one doesn't already exist as a shared,
   reusable piece, extract one (the "Scholar Agentic OS" logo lockup
   appears in `AppHeader.tsx` and `OnboardingWizard.tsx` at minimum,
   per earlier sessions' findings) so the narrowed serif rule has exactly
   one place to apply, not a `h1` rule that has to be reasoned about
   everywhere.
4. **Background/backdrop treatment** — the scrim/asset-budget rules
   above, applied once at the global-chrome level, not per-screen.
5. **Everything else** — unchanged guidance: adopt incrementally as
   touched by other work, not a batch migration.

v2's old Step 3 (navy → grey) and Step 4 (gold removal) are cancelled, not
"done" or "skipped" — they are the wrong direction now, full stop; see the
updated progress-log table below.

### v3 implementation progress log

| # | Step | Status | Commit |
|---|------|--------|--------|
| 1 | Design tokens (navy scale, luminous blue, gold, luminous border) | 🟢 done | `9e17bb2` |
| 2 | Global chrome (`AppHeader`/`AppFooter` onto navy, wordmark gold-split) | 🟢 done | `22db8c7` |
| 3 | Remove the 5 unbuildable panels (per `docs/planning/dashboard-mockup-honest-data-audit.md`) | 🟢 **confirmed nothing to remove** | — |
| 4 | Rebuild the 8 buildable panels with real data | 🔲 in progress | — |
| 5 | Remaining component restyling (if budget remains) | 🔲 not started | — |

**Step 3 finding, not a fabricated removal**: an exhaustive grep across
`src/components/` for every one of the five unbuildable panels (`SYSTEM
STATUS`/`CPU`/`GPU`, `Collaborator`, `Running Agents`, `Marketplace`,
`Prompt Studio`) and a direct read of `App.tsx`'s dashboard-view branch
(confirms `ResearchIntelligenceDashboard.tsx` is the one and only live
dashboard component) found **zero matches**. These five panels exist only
in the newly-supplied mockup — a visual reference for work not yet
built — never as live code. There was nothing to remove; Step 3's actual
goal (these five never ship) is already satisfied by construction, simply
by not introducing them in Step 4's rebuild. Recorded honestly rather than
manufacturing a deletion commit for code that was never there, per this
project's standing discipline against claiming work that didn't happen.

## v2 (retired 2026-07-28, kept for traceability) — grey-HUD direction record

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
| 2.5 | Navigation (browser history, deep links, state-loss regressions, guarded transitions, focus management) | 🟢 done, in a separate session — see `docs/planning/navigation-scoping.md` | `d217496`, `6d992ae` |
| 3 | `#1A365D` navy → layered-grey remap (632 occ., 29 files) | ⛔ **CANCELLED** — v3 (above) reverses this; navy is the new base, not grey | — |
| 4 | Gold citation/scholarship accent remap | ⛔ **CANCELLED** — v3 (above) reinstates gold, scoped to CTA/wordmark only | — |
| 5 | `CommandPalette.tsx` → `ActiveAgentsPanel.tsx` → `ResearchIntelligenceDashboard.tsx` → remaining components | 🔲 not started — superseded by v3's own revised sequence (above) | — |

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
