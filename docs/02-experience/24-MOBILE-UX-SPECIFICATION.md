# Mobile UX Specification

> **Doc ID:** 24 · **Status:** Design · **Depends on:** `20`, `21`, `23`

Mobile is the Console at its smallest and most focused. This specifies the
phone and tablet experience, the four jobs it exists to do, and the constraints
that keep it honest.

---

## 1. Design brief

**Built for:** the two minutes before a lecture starts. A phone held one-handed
on a bus. Lying in bed at midnight remembering there are sources to approve.

**The four jobs mobile does well:**

1. **Approve** — work the Source Approval Queue.
2. **Read** — review a drafted section.
3. **Ask** — put a question to the AI assistant.
4. **Know** — check whether anything needs attention.

Everything else is either absent or deliberately awkward. A phone is a poor place
to make consequential, context-heavy decisions, and the design says so rather
than pretending otherwise.

**Delivery:** responsive Console PWA, installable to the home screen. Not a
native app in v1 (`10` §7, deferred to `55` §3).

---

## 2. Layout

### 2.1 Structure

```
┌─────────────────────────┐
│ ●●●●●  status bar        │
├─────────────────────────┤
│  ← Sources          ⋯   │  App bar (56 px)
├─────────────────────────┤
│                         │
│                         │
│      Content            │  Single column
│      (scrollable)       │  16 px gutters
│                         │
│                         │
│                         │
├─────────────────────────┤
│  Primary action         │  Thumb zone (72 px)
├─────────────────────────┤
│  ⌂     ▤     ⌕     ◍    │  Tab bar (56 px)
│ Home Projects Search Me  │
└─────────────────────────┘
```

### 2.2 Zones

| Zone | Screen region | Contains |
|---|---|---|
| Reach zone | Bottom third | Primary actions, tab bar |
| Read zone | Middle | Content |
| Reference zone | Top | Title, back, overflow |

Destructive and consequential actions are **never** in the reach zone — reject,
delete, and override sit behind the overflow menu or require a second
confirmation. Approve is in the reach zone because it is the common, intended,
reversible case.

### 2.3 Breakpoints

| Width | Layout |
|---|---|
| 360–413 px | Baseline. Everything must work here |
| 414–599 px | Same, more comfortable spacing |
| 600–839 px (tablet portrait) | Wider content, two-column lists |
| 840 px+ (tablet landscape) | Console desktop layout |

360 px is the design target, not the degraded case.

---

## 3. Navigation

Four tabs. Adding a fifth requires removing one.

| Tab | Purpose |
|---|---|
| **Home** | What needs attention |
| **Projects** | Project list and detail |
| **Search** | Across projects and Vault |
| **Me** | Account, settings, notifications |

Within a tab: push navigation, back gesture, breadcrumb-free. Tab state persists
across switches.

---

## 4. The four jobs

### 4.1 Approve — the flagship

The Source Approval Queue is the reason mobile exists. Full card design in
`23` §5.3; the mobile specifics:

| Aspect | Specification |
|---|---|
| One card per screen | No list scanning; a single decision in focus |
| Evidence above the fold | Authenticity checks visible without scrolling at 360 px |
| Actions in the reach zone | Approve, Reject, Later as a three-up row |
| Swipe | Right approve, left reject, both with undo for 5 s |
| Progress | "3 of 8" in the app bar |
| Interruption | Position preserved; resumes where the user left |
| Retracted | Full-card warning; swipe disabled; two-step confirmation |

**Why we make this easy on a phone**, restated because it is the one place we
deliberately reduce friction on a consequential action: the alternative is
batching decisions until the user is at their desk, where a hundred queued
candidates get rubber-stamped. Thoughtful approval on a bus beats bulk approval at
a desk. The card carries the full evidence set, so the decision is informed
wherever it happens.

### 4.2 Read

| Aspect | Specification |
|---|---|
| Typography | Serif, 17 px minimum, 1.7 line height, user-scalable |
| Measure | Full width minus gutters; naturally ~40 characters at 360 px |
| Navigation | Section list, swipe between sections |
| Provenance | Unreviewed AI spans always marked (`21` §3.3); overlay toggle in overflow |
| Comment | Long-press to select, comment from the selection menu |
| Review Mode | Available; one span per screen with its evidence |
| Offline | Cached sections readable |

### 4.3 Ask

Full-screen chat. Project-scoped. Voice input supported. Responses cite sources
with tappable references that open the source detail.

Insertion into the draft requires navigating to Read and choosing a location —
two deliberate steps, so that AI text never lands in a document from a chat
screen with one tap.

### 4.4 Know

Home shows what needs attention, ordered by consequence, with a count badge on
the tab. Empty when nothing is outstanding, and says so.

Push notifications (opt-in per category) for: long run complete, gate ready,
sources awaiting approval, security events. Each deep-links to the relevant
screen.

---

## 5. Touch interaction

| Gesture | Action | Where |
|---|---|---|
| Tap | Activate | Everywhere |
| Long press | Select text, context menu | Reading |
| Swipe horizontal | Approve/reject; next/previous section | Queue, Read |
| Swipe from edge | Back | Everywhere |
| Pull down | Refresh | Lists |
| Pinch | Text size | Reading |

**Rules:**

- Every gesture has a visible equivalent. No gesture is the only path to a
  function.
- Minimum target 44 × 44 px, 8 px apart.
- Destructive gestures always offer undo for 5 seconds.
- No gesture triggers a network-costly or irreversible action without
  confirmation.

---

## 6. Input

Text input on a phone is slow and error-prone. The design minimises it.

| Instead of | Offer |
|---|---|
| Typing a search | Recent, suggested, and voice |
| Typing a comment | Voice dictation; short canned responses for common review notes |
| Filling a long form | Defer to Workbench with a saved partial |
| Entering an API key | Deep link from desktop, or QR handoff |

Where typing is unavoidable: correct keyboard type, autocomplete, no auto-capital
in identifier fields, and never a form that loses input on navigation.

---

## 7. What mobile does not do

| Absent | Reason |
|---|---|
| Drafting runs | Long-running; needs supervision |
| Structural editing | Reordering sections on a phone is error-prone |
| Rule editing | Consequential; needs the source clause alongside |
| Version restore | Destructive; poor preview |
| Export override | `20` §6.1 |
| Vault creation, ingestion, curation | Local compute and keys |
| Plugin management | Desktop-only |
| Provider configuration beyond viewing | Key entry is error-prone; QR handoff instead |

Each shows the explain-and-handoff pattern (`20` §6.2), never a dead control.

---

## 8. Performance and resource constraints

Mobile users are on metered data, old devices, and low battery.

| Constraint | Design response |
|---|---|
| Metered data | Source PDFs not downloaded automatically; explicit tap, with size shown |
| Battery | No background polling; push instead of poll; no animation loops |
| Old devices | Baseline: a 2019 mid-tier Android. Tested against it (`52` §5.4) |
| Memory | Virtualised lists; images downscaled to viewport; sections loaded on demand |
| Storage | Cache capped at 200 MB, user-clearable, LRU eviction |

| Metric | Budget |
|---|---|
| First contentful paint (4G, 2019 mid-tier) | < 2.0 s |
| Interaction to next paint | < 200 ms |
| Queue card transition | < 100 ms |

---

## 9. Accessibility on mobile

Everything in `21` §6 applies, plus:

| Area | Requirement |
|---|---|
| Screen reader | Full VoiceOver and TalkBack support; queue cards read in a sensible order (title, authors, evidence, summary, actions) |
| Dynamic type | Honours OS text size to 200% without layout breakage |
| Touch targets | 44 × 44 px minimum, uncompromised at large text sizes |
| Orientation | Both supported; never locked |
| Reduced motion | Card transitions become instant |
| One-handed | All primary actions reachable in the bottom third |
| Colour | Never the sole carrier of state on a small screen where tints are hard to distinguish |

### 9.1 Screen-reader order for the approval card

Specified because getting it wrong makes the flagship task unusable:

1. Position ("Source 3 of 8")
2. Title
3. Authors, venue, year
4. Authenticity summary ("4 checks passed" or "Warning: retracted")
5. Summary text, with its AI attribution
6. Formatted citation
7. Actions

---

## 10. Tablet

Tablets are treated as small desktops above 840 px, not large phones.

| Width | Treatment |
|---|---|
| < 840 px | Phone layout, wider |
| ≥ 840 px | Console desktop layout: two-column lists, side-by-side detail |
| iPad with keyboard | Keyboard shortcuts enabled; approval queue fully keyboard-operable |

Tablet is a legitimate reading and reviewing surface. A user can plausibly work
through an entire approval queue and read a full chapter on an iPad, and the
layout supports that without pretending to be the Workbench.

---

## 11. Install and platform integration

As a PWA:

| Capability | Behaviour |
|---|---|
| Install | Prompted after two sessions with meaningful use, never on first visit |
| Home screen | Icon, splash, standalone display |
| Push | Web Push where supported; email fallback where not |
| Share target | Share a URL or PDF into Scholar OS to queue it as a source |
| Offline | Service worker caches shell, recent projects, and the pending queue |

**Share target is the underrated one:** a student reading a paper in a browser can
share it into Scholar OS, and it appears in the candidate queue for later
approval. It is the lowest-friction path from encountering a source to capturing
it, and it requires no typing at all.
