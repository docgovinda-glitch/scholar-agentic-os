# Design Direction — Retiring the Sci-Fi Theme

> **Doc ID:** 60 · **Status:** Accepted · **Date:** 2026-08-04
> **Supersedes:** the "sci-fi redesign" v1/v2/v3 direction recorded only in
> `src/index.css` comments and a scoping document (`docs/planning/sci-fi-redesign-scoping.md`)
> that is referenced 6 times from that file but **does not exist in the repository**.

---

## 1. The conflict

Three sources describe what this product should look like. Two agree. The
shipped implementation follows the third.

### Source A — Product owner's direction

> "clean, modern, minimal, distraction-free, elegant, fast, professional,
> highly readable … Prioritize whitespace, typography, clarity, visual
> hierarchy … Avoid clutter. Avoid overwhelming users." — comparable to
> Claude.ai.

### Source B — This suite's own design thesis (`21` §1)

> Scholar OS is a **professional instrument for anxious people** … The
> resolution is **progressive disclosure with an expert path**: the surface is
> calm and explains itself.

### Source C — What is actually implemented

A dark navy canvas (`#030810`) with a luminous-blue glow accent (`#3B9CFF`),
a blueprint grid background, an angular technical display face (Rajdhani) on
every `h2`–`h4`, and chrome labels set in `font-mono uppercase tracking-widest`
— "LIVE MANUSCRIPT COMPILATION WORKBENCH", "DISMISS PREVIEW".

**A and B agree. C contradicts both.** A blueprint-grid canvas with glowing
borders is not calm, and mono uppercase micro-labels are the opposite of
"highly readable". The sci-fi direction was never reconciled with the design
thesis in `21` — it was applied on top of it.

---

## 2. Secondary problem: three unfinished migrations

`src/index.css` carries **three generations of colour tokens simultaneously**,
each kept alive because the previous migration never finished:

| Generation | Tokens | Status in file |
|---|---|---|
| Original brand | `--color-brand-50…950` | "still consumed by unmigrated components" |
| Sci-fi v2 (grey) | `--color-surface-0…3`, `--color-cyan-accent` | "SUPERSEDED … Kept declared, NOT deleted" |
| Sci-fi v3 (navy) | `--color-navy-0…4`, `--color-luminous-blue` | current |

Each generation's comments instruct the next engineer to migrate "component by
component, never as a blind sweep". That instruction is sound in isolation, but
three consecutive applications of it have produced a token file where **the
comments outnumber the declarations** and no generation is authoritative.

The v3 comments also record a genuine, unresolvable defect (line 75–85):

> every adjacent pair in this scale fails the 3:1 non-text floor on luminance
> alone … navy is simply too tonally narrow a hue for elevation-by-luminance to
> work … Do not add more intermediate navy steps hoping to find one that passes
> — it can't.

Elevation that cannot be expressed by surface colour must instead be carried by
glowing borders on every panel edge. That is precisely the visual noise Source A
rules out. **The defect is in the hue choice, not in the execution.**

---

## 3. Decision

**Retire the sci-fi direction. Adopt a single calm, warm, high-legibility
system aligned with `21` §1 and the product owner's direction.**

Specifically:

1. **One token generation.** `src/index.css` declares one semantic set
   (`--surface-*`, `--text-*`, `--border-*`, `--accent-*`). The brand, sci-fi
   v2, and sci-fi v3 generations are removed as independent systems.
2. **Light and dark, both first-class.** Light is the default — this product is
   read for hours at a time, and long-form academic prose reads best on a warm
   light ground. Dark follows `prefers-color-scheme` and an explicit toggle.
3. **Warm neutrals, not blue-black.** A warm paper ground (`#FAF9F7`) with warm
   greys. Warm neutrals have the tonal range that navy lacked (§2), so elevation
   works by surface colour again and panel-edge glow is no longer load-bearing.
4. **One accent, used sparingly.** A muted clay accent for interactive and
   selected states only. No second brand accent; state colours stay conventional.
5. **Readable typography.** Body and chrome in Inter. `font-mono` is reserved
   for genuine code, keys, and identifiers — not for chrome labels. The Rajdhani
   display face and the Playfair serif are both withdrawn, with no replacement:
   headings are the sans face at a heavier weight.

---

## 4. Migration strategy — why a sweep is correct *here*

The three previous migrations each chose per-component migration and each
stalled, leaving the product in a permanently mixed state. This one does not
repeat that, because the numbers make a different approach available.

Measured across `src/components`, `src/desk`, `src/pocket` (64 component files):

| Styling channel | Count | Migration |
|---|---|---|
| `var(--color-*)` token references | 2,290 | **Free** — redefine the token, every call site follows |
| Hardcoded hex | 1,521 | Targeted |
| └ of which `#94A3B8` (muted text) | 731 | One substitution |
| └ of which `#E2E8F0` (primary text) | 590 | One substitution |
| └ remaining after the top 6 values | ~130 | Case-by-case |

**87% of hardcoded colour is two values, and 60% of all styling is already
tokenised.** The earlier migrations assumed per-file work was unavoidable;
at these ratios it is not. Redefining ~10 custom properties plus substituting
6 hex values migrates the visual system in one coherent step, with no
intermediate state in which some panels are navy and others are paper.

The critical constraint: **surface and text must migrate together.** The
legacy components hardcode light text (`#E2E8F0`) because they assume a dark
ground. Remapping surfaces without remapping text would produce white-on-white.
Both changes ship as one commit for that reason.

### What this deliberately does not do

This changes the visual system, not the layout. Information architecture,
navigation, and per-screen redesign remain outstanding and are tracked
separately. This decision unblocks that work by giving it one system to build
against instead of three.

---

## 5. Conformance with `21` §5

The replacement was checked against the design system `21` already specified.
It matches on every point — which is the strongest evidence that the sci-fi
direction, not the specification, was the outlier:

| `21` §5 requires | Implemented |
|---|---|
| §5.2 tokens: `neutral`, `accent`, `success`, `warning`, `danger`, `info` | Exactly these, as `--text-*`, `--accent*`, `--state-*` |
| §5.2 "meaning never carried by colour alone" | State tokens pair with the icon/label treatments already in the components |
| §5.4 state change 120 ms | `--motion-fast: 120ms` |
| §5.4 panel open/close 180 ms | `--motion-base: 180ms` |
| §5.4 **"No decorative animation"** | The perpetual glow-pulse, the 20 s orbiting ring, and the shimmer on idle progress bars are removed |
| §5.1 UI in system sans (Inter) | `--font-sans`, single family |
| §5.1 mono for "DOIs, IDs, formulae" | Mono retained on exactly those 370 call sites; removed from the 660 chrome labels |
| §5.5 every icon-only control labelled | `ThemeToggle` carries `aria-label` + `title` per option |
| §6 focus indicator at 3:1 | Verified: `--accent` at 5.15–5.92:1, `--border-control` at 3.02–3.96:1 |

§5.4 is worth calling out: the previous implementation had `glowPulse` running
on a 2 s infinite loop, a second ring rotating on a 20 s loop, and `shimmer`
animating progress bars that were not progressing. `21` forbids all three in
one sentence, and `UX4` explains why — motion that never stops carries no
information about state.

**One nuance, not a conflict.** `21` §5.1 specifies a *serif* for **document
text** (user-selectable Charter / Source Serif / Georgia), matching the printed
target. That is untouched here. The face this decision retires is Playfair
Display, which was used for the wordmark and headings — brand expression, i.e.
the thing §5.1 subordinates to reading comfort. The user-selectable document
reading face remains unbuilt and remains specified.

---

## 6. Consequences

**Positive**

- The product's appearance matches its stated design thesis for the first time.
- Contrast is verifiable: `scripts/verify-contrast.mjs` computes WCAG ratios for
  every token pair in CI rather than relying on manual spot-checks.
- Elevation works without glow, removing the borders the navy scale forced.
- Dark mode becomes a supported mode rather than the only mode.

**Negative / accepted**

- One large diff touching most component files. Accepted: the alternative is a
  fourth partial migration, and §2 shows where that leads.
- Components with bespoke hex outside the top 6 values need follow-up polish.
  Tracked, and visible because the surrounding system is now consistent.

**Neutral**

- `--font-serif` and `--font-display` are removed. The `.font-serif` and
  `.font-display` utility classes remain declared, mapping to the sans stack, so
  existing call sites keep working while they are cleaned up incrementally.

---

## 7. Related

- `21` — UX Architecture (design thesis this restores alignment with)
- `22` / `23` — Desktop and Mobile UX specifications
- `src/index.css` — token declarations
- `scripts/verify-contrast.mjs` — automated WCAG verification
