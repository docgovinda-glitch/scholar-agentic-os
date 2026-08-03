# Mobile Web UX Specification — Pocket

> **Doc ID:** 23 · **Status:** Design · **Revision:** 2
> **Replaces:** the web-companion and mobile-responsive specifications

Pocket is not Desk at a narrow width. It is a different application, for a
different situation, sharing a codebase and a data model.

---

## 1. Design brief

**Built for:** the ten minutes before a seminar. A phone held one-handed on a
bus. Lying in bed remembering there are sources waiting. A borrowed phone in a
library queue.

**The four jobs:**

1. **Approve** — work the source approval queue.
2. **Read** — review a drafted section, and comment on it.
3. **Ask** — put a question to the assistant.
4. **Know** — see what needs attention.

Everything else is either absent or deliberately effortful. A phone is a poor
place to make consequential, context-heavy decisions, and the design says so
rather than pretending otherwise.

---

## 2. Why Pocket is a separate design

The single most common failure in "responsive" products is one layout stretched
across both situations, mediocre at each. Four independent reasons Pocket is its
own design:

| Reason | Consequence |
|---|---|
| **Session length.** Minutes, not hours | A layout optimised for persistent context is wrong for one screen of work |
| **Input.** Thumbs, not a keyboard | Dense panels and multi-region layouts are unusable |
| **Attention.** Interrupted, in public | One decision per screen; state must survive interruption |
| **Screen.** 360 px | Not a small desktop; a different information budget |

Desk and Pocket share: the design system, the data model, the API, and the
domain logic. They share no layout, no navigation model, and no page.

---

## 3. Layout

```
┌─────────────────────────┐
│ ●●●●●                   │
├─────────────────────────┤
│  ←  Sources         ⋯   │  App bar, 56 px
├─────────────────────────┤
│                         │
│                         │
│      One thing          │  Content
│      at a time          │  16 px gutters
│                         │
│                         │
│                         │
├─────────────────────────┤
│   Primary action        │  Thumb zone, 72 px
├─────────────────────────┤
│  ⌂     ▤     ⌕     ◍    │  Tabs, 56 px
│ Home Projects Search Me │
└─────────────────────────┘
```

### 3.1 Zones

| Zone | Region | Holds |
|---|---|---|
| Reach | Bottom third | Primary actions, tab bar |
| Read | Middle | Content |
| Reference | Top | Title, back, overflow |

Destructive and consequential actions are **never** in the reach zone. Reject,
delete, and discard live behind the overflow menu or require confirmation.
Approve is in the reach zone because it is the common, intended, reversible case.

### 3.2 Breakpoints

| Width | Layout |
|---|---|
| 320–413 | Baseline. Everything works here |
| 414–599 | Same, more comfortable spacing |
| 600–839 | Tablet portrait: wider content, two-column lists |
| 840–1023 | Tablet landscape: master-detail |
| 1024+ | **Desk takes over** (`22` §11) |

360 px is the design target, not the degraded case.

---

## 4. Navigation

Four tabs. A fifth requires removing one.

| Tab | Purpose |
|---|---|
| **Home** | What needs attention |
| **Projects** | Project list and detail |
| **Search** | Across projects and Vault |
| **Me** | Account, settings, notifications |

Push navigation within a tab. Back gesture. No breadcrumbs. Tab state persists
across switches.

---

## 5. The four jobs

### 5.1 Approve — the flagship

The source approval queue is the reason Pocket exists. One card, one decision.

```
┌─────────────────────────────────────────────┐
│  ←   Sources              3 of 8        ⋯   │
├─────────────────────────────────────────────┤
│                                             │
│  Machine learning approaches to water        │
│  quality prediction: a systematic review     │
│                                             │
│  Chen, L., Okafor, M., Silva, R.            │
│  Water Research · 2021 · Elsevier           │
│                                             │
│  ✓ DOI resolves     ✓ Publisher verified    │
│  ✓ Not retracted    ✓ Q1 journal            │
│                                             │
│  ─────────────────────────────────────────  │
│  Reviews 74 studies applying ML to water    │
│  quality prediction, finding random forest  │
│  and LSTM approaches dominant. Relevant to  │
│  your methodology chapter.                  │
│                    ⓘ summarised by claude   │
│  ─────────────────────────────────────────  │
│                                             │
│  Chen, L., Okafor, M., & Silva, R. (2021).  │
│  Machine learning approaches… Water          │
│  Research, 198, 117–134.                    │
│                                             │
│  Open PDF  ·  Why this was suggested        │
├─────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │ Approve │ │ Reject  │ │  Later  │        │
│  └─────────┘ └─────────┘ └─────────┘        │
└─────────────────────────────────────────────┘
```

| Aspect | Specification |
|---|---|
| One card per screen | No list scanning; one decision in focus |
| Evidence above the fold | All four authenticity checks visible without scrolling at 360 px |
| Swipe | Right approve, left reject; undo for 5 s |
| Progress | "3 of 8" in the app bar |
| Interruption | Position preserved; resumes exactly |
| Retracted source | Full-card warning; swipe disabled; two-step confirmation |
| Bulk | Reject available in overflow. **Approve is not** |

**Why approval is deliberately easy here:** the alternative is a hundred queued
candidates rubber-stamped at a desk. Thoughtful approval on a bus, with the full
evidence on the card, beats bulk approval anywhere.

### 5.2 Read

| Aspect | Specification |
|---|---|
| Typography | Serif, 17 px minimum, 1.7 line height, user-scalable |
| Navigation | Section list; swipe between sections |
| Comment | Long-press to select, comment from the selection menu |
| Light edit | Direct text edits, saved to the same document Desk shows |
| Suggestions | Accept or reject pending Studio changes, one at a time |
| Offline | Cached sections readable |

**Studio review on Pocket** is genuinely useful: working through a refinement
diff one change at a time is well suited to a phone, and each change carries its
reason. Invoking a *new* refinement run is Desk-only — choosing an intervention
level over a passage needs the passage in view.

### 5.3 Ask

Full-screen chat, project-scoped, voice input supported. Responses cite sources
with tappable references.

Inserting into the draft requires navigating to Read and choosing a location —
two deliberate steps, so AI text never lands in a document from a chat screen
with one tap.

### 5.4 Know

Home shows what needs attention, ordered by consequence, with a tab badge. Empty
when nothing is outstanding, and says so.

Push notifications (opt-in per category) for: run complete, gate ready, sources
waiting, security events. Each deep-links to the relevant view.

---

## 6. Touch

| Gesture | Action | Where |
|---|---|---|
| Tap | Activate | Everywhere |
| Long press | Select text, context menu | Reading |
| Swipe horizontal | Approve/reject; next/previous section | Queue, Read |
| Edge swipe | Back | Everywhere |
| Pull down | Refresh | Lists |
| Pinch | Text size | Reading |

Every gesture has a visible equivalent. Minimum target 44 × 44 px, 8 px apart.
Destructive gestures offer undo for 5 seconds.

---

## 7. Input

Typing on a phone is slow and error-prone; the design minimises it.

| Instead of | Offer |
|---|---|
| Typing a search | Recent, suggested, voice |
| Typing a comment | Voice dictation; short canned review notes |
| A long intake form | Save partial, finish on Desk |
| Entering an API key | Desk, or a QR handoff |

Where typing is unavoidable: correct keyboard type, autocomplete, no
auto-capitalisation in identifier fields, and no form that loses input on
navigation.

---

## 8. Absent from Pocket

| Absent | Reason |
|---|---|
| Multi-region layout | Wrong model for the screen and session |
| Drafting runs | Long-running; needs supervision |
| Invoking a Studio refinement | Needs the passage in view to choose a level |
| Structural editing | Reordering sections on a phone is error-prone |
| Rule editing | Consequential; needs the source clause alongside |
| Version restore | Destructive; poor preview |
| Export | Needs format and option choices better made on Desk |
| Vault ingestion and curation | Bulk operations |
| Provider configuration beyond viewing | Key entry is error-prone |

Each shows an explain-and-handoff, never a dead control:

> **Not available on your phone**
> Choosing how much to change in a passage works better with the passage in
> front of you.
> `[Open on desktop]` `[Remind me]`

---

## 9. Performance and resources

Pocket runs on old phones, metered data, and low battery.

| Constraint | Response |
|---|---|
| Metered data | Source PDFs are not auto-downloaded; explicit tap with size shown |
| Battery | No background polling; push not poll; no animation loops |
| Old devices | Baseline: a 2019 mid-tier Android, tested against it |
| Memory | Virtualised lists; images downscaled to viewport; sections on demand |
| Storage | Cache capped at 150 MB, user-clearable, LRU |

| Metric | Budget |
|---|---|
| First contentful paint, 4G, 2019 mid-tier | < 2.0 s |
| Time to interactive | < 3.5 s |
| Interaction to next paint | < 200 ms |
| Queue card transition | < 100 ms |
| Initial JS bundle | < 140 KB gzipped |
| Lighthouse performance | ≥ 90 |
| Lighthouse accessibility | 100 |

---

## 10. Accessibility

Everything in `21` §6 applies, plus:

| Area | Requirement |
|---|---|
| Screen reader | Full VoiceOver and TalkBack; queue cards read in a sensible order |
| Dynamic type | OS text size to 200% without layout breakage |
| Targets | 44 × 44 px minimum, uncompromised at large text |
| Orientation | Both; never locked |
| Reduced motion | Card transitions instant |
| One-handed | All primary actions in the bottom third |
| Colour | Never the sole carrier of state |

### 10.1 Approval card reading order

Specified because getting it wrong makes the flagship task unusable:

1. Position — "Source 3 of 8"
2. Title
3. Authors, venue, year
4. Authenticity summary — "4 checks passed" or "Warning: retracted"
5. Summary, with its AI attribution
6. Formatted citation
7. Actions

---

## 11. PWA

| Capability | Behaviour |
|---|---|
| Install | Prompted after two sessions of meaningful use, never on first visit |
| Home screen | Icon, splash, standalone display |
| Push | Web Push where supported; email fallback where not |
| **Share target** | Share a URL or PDF into Scholar OS to queue it as a candidate source |
| Offline | Service worker caches the shell, recent projects, and the pending queue |

**Share target is the underrated one:** a student reading a paper in a browser
shares it into Scholar OS and it appears in the approval queue. Lowest-friction
path from encountering a source to capturing it, with no typing at all.

---

## 12. Tablet

Tablets above 840 px get a master-detail layout — a list beside a detail pane —
rather than either phone stacking or full Desk. A user can plausibly work an
entire approval queue and read a full chapter on an iPad, and the layout supports
that without pretending to be Desk.

At 1024 px and above, Desk takes over. An iPad in landscape with a keyboard gets
Desk, which is the correct outcome.
