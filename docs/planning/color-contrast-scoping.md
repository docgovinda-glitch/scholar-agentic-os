# Muted Text Color Contrast — Scoping Note (2026-07-24)

**Status: SCOPED, NOT FIXED.** Confirmed systemic during this session's
production-readiness follow-up, per the prior session's own flag that this
"needs a deliberate palette decision, not a reflexive global find/replace."

## Why this is scoped, not fixed inline

The prior session's audit found `#8C887F` (~3.5:1 on white) and `#C08A3E`
(~3.0:1 on white) fail WCAG AA (4.5:1 for normal text) at the small sizes
(`text-[10px]`/`text-xs`) they're commonly used at. This session quantified
the actual scope before touching anything:

- `#8C887F`: **189 occurrences**
- `#C08A3E`: **270 occurrences**
- **28 files** touched across `src/components/`

That's not "a few isolated fixes" — it's the app's actual muted-label and
brand-accent colors, used throughout the phase-panel UI. A global
find/replace on the hex values would be the wrong tool here for two reasons:

1. **Not every occurrence is a contrast violation.** A sampled breakdown of
   `#C08A3E` usage alone showed a mix of `text-[#C08A3E]` (actual text — the
   violation case), `border-[#C08A3E]` (borders, not subject to text-contrast
   rules), `bg-[#C08A3E]` (backgrounds, contrast depends on what's drawn on
   top of it, not this color alone), and bare `className="text-[#C08A3E]"` on
   lucide-react icons (graphical objects, WCAG's *non-text* contrast
   threshold is 3:1, which `#C08A3E` already meets against white). Blindly
   darkening every occurrence would visually flatten borders/icons/accents
   that aren't actually failing anything, for no accessibility benefit.
2. **`#C08A3E` (gold) and `#1A365D` (navy) are this app's actual brand
   identity**, used consistently as the two signature colors across every
   panel. Changing the hex value even slightly is a visual-identity decision,
   not a mechanical accessibility patch — it needs sign-off on the resulting
   shade, ideally checked against both the light backgrounds already in use
   and any dark-mode/glass-effect surfaces (`ComplianceChecklistPanel.tsx`'s
   dark theme uses different opacity variants of the same hex, e.g.
   `text-brand-300`, `text-[#A3E635]`, that would need separate checking).

## What a real fix needs to do (not done here)

1. **Classify every occurrence first** — text (actual violation) vs.
   border/background/icon (not a text-contrast violation, leave alone).
   A small script (or careful grep per Tailwind utility prefix:
   `text-[#...]` vs `border-[#...]` vs `bg-[#...]` vs bare hex in inline
   styles) can produce this list mechanically; the judgment call is what to
   do with the "text" bucket.
2. **Decide the actual replacement shade(s)** — likely a darker variant of
   each color that still reads as "the same gold/gray-brown" at a glance
   (e.g. run the existing hex through a contrast-ratio calculator against
   `#FFFFFF`/`#FAF8F5` and pick the nearest shade clearing 4.5:1, keeping hue
   and saturation close to the original). This is a design decision the user
   should confirm before it ships everywhere, not something to guess at.
3. **Apply only to the classified "text at small size" bucket**, leaving
   borders/backgrounds/icons/large-text usages on the original brand hex.
4. **Check the dark-theme surfaces separately** (`ComplianceChecklistPanel.tsx`
   uses `text-brand-300`/`text-[#A3E635]` etc. on dark backgrounds — a
   completely different contrast pair than the light-background panels this
   note is about) rather than assuming one fix covers both.
5. **Re-verify with real computed contrast ratios** against the actual
   backgrounds each usage sits on (not just white — several panels use
   `#FAF8F5`/`#FAF9F6` off-white, `#F8FAFC`, etc.), the same way this
   session's audit did, not a visual eyeball check.

Not attempted this session, consistent with the standing rule to stop and
scope rather than half-fix a systemic gap inline.
