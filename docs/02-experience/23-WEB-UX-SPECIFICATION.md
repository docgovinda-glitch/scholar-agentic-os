# Web UX Specification — The Console

> **Doc ID:** 23 · **Status:** Design · **Depends on:** `20`, `21`, `22`

The Console is a companion, not a port. This specifies what it is for, what it
deliberately is not, and how it behaves.

---

## 1. Design brief

**Built for:** ten minutes between lectures. A phone on a train. A borrowed
laptop in a library. The moment you remember something at 11pm and want to check
it without opening your desktop.

**The Console's job in one sentence:** let a user make progress on their project
without their computer.

**What it is not:** the Workbench in a browser. `REQ-SUR-5` forbids it, and §2
explains why that is a product decision rather than an engineering limitation.

---

## 2. Why the Console is not the Workbench

Four independent reasons, any one of which would be sufficient:

| Reason | Consequence |
|---|---|
| **Different session length.** Minutes, not hours | A layout optimised for persistent context is wrong for a task completed in one screen |
| **Different input.** Touch and small viewports | Docking, splitting, and dense panels are unusable |
| **Different compute.** No local processing | Drafting, indexing, and local models are absent, not degraded |
| **Different privacy posture.** Server-mediated | Only synced content exists here; a local-only user sees an honest empty state |

The failure mode we are avoiding is specific and common: a responsive
"one codebase" web app that is mediocre on both desktop and mobile, and which
quietly becomes the primary surface because it is easier to ship. The Console is
scoped so that it cannot become that.

---

## 3. Information architecture

Hierarchical, one focus at a time (`20` §4.2).

```
Home
├── Projects → Project → { Overview · Review · Sources · Compliance · Chat · Activity }
├── Vault
├── Notifications
└── Account
```

Five top-level destinations. No nesting deeper than three levels. Every page
answers one question.

---

## 4. Layout

### 4.1 Desktop web (≥ 1024 px)

```
┌──────────────────────────────────────────────────────────────┐
│  Scholar OS    Projects  Vault  Notifications        ◐  ⌄    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌────────────────────────────────────────────────────┐    │
│   │  Master's Thesis                          G4 Draft │    │
│   │  ─────────────────────────────────────────────────  │    │
│   │  Chapter 3 drafted overnight · 12 spans to review   │    │
│   │  8 sources awaiting your approval                   │    │
│   │                                                     │    │
│   │  [Review sources]  [Read chapter 3]                 │    │
│   └────────────────────────────────────────────────────┘    │
│                                                              │
│   Recent activity                                            │
│   ...                                                        │
└──────────────────────────────────────────────────────────────┘
```

Centred, max 960 px content width. No sidebars. No panels. Cards, lists, and one
primary action per view.

### 4.2 Mobile (< 600 px)

Single column, bottom tab bar, thumb-reachable primary actions. Detailed in `24`.

---

## 5. Pages

### 5.1 Home

The dashboard. Answers: *what needs me?*

| Block | Content |
|---|---|
| Needs attention | Sources awaiting approval, unreviewed spans, blocking findings, gates ready — ordered by consequence |
| Active projects | Card each: title, gate, progress, next action, last activity |
| Recent activity | Completed runs, sync events, comments |
| Announcements | Operator announcements; the only place they appear |

**Design rule:** "Needs attention" is empty when nothing needs attention, and
says so plainly. It is not padded with suggestions. A dashboard that always shows
work is a dashboard users learn to ignore.

### 5.2 Project overview

| Block | Content |
|---|---|
| Header | Title, output type, gate, deadline countdown |
| Progress | Gate pipeline, visual, with the current gate's outstanding items |
| Next action | One recommended action, prominent |
| Stats | Word count against target, sources, authorship ratio, findings |
| Sections | Each with word count, gate state, and finding count |
| Quick actions | Review sources · Read draft · Ask AI · View compliance |

### 5.3 Sources — the flagship page

The Source Approval Queue is the Console's most important surface (`20` §6.1,
reason 2). It is designed for the phone first and the desktop second.

```
┌─────────────────────────────────────────────┐
│  8 sources to review                    ⋯   │
├─────────────────────────────────────────────┤
│                                             │
│  Machine learning approaches to water        │
│  quality prediction: a systematic review     │
│                                             │
│  Chen, L., Okafor, M., Silva, R.            │
│  Water Research · 2021 · Elsevier           │
│                                             │
│  ✓ DOI resolves    ✓ Publisher verified     │
│  ✓ Not retracted   ✓ Q1 journal             │
│                                             │
│  ─────────────────────────────────────────  │
│  Reviews 74 studies applying ML to water    │
│  quality prediction, finding random forest  │
│  and LSTM approaches dominant. Relevant to  │
│  your methodology chapter.                  │
│              ⓘ summarised by claude-sonnet-5│
│  ─────────────────────────────────────────  │
│                                             │
│  Chen, L., Okafor, M., & Silva, R. (2021).  │
│  Machine learning approaches… Water          │
│  Research, 198, 117—134.                    │
│                                             │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐│
│  │  Approve  │  │  Reject   │  │  Later   ││
│  └───────────┘  └───────────┘  └──────────┘│
│                                             │
│  Open PDF · Why this was suggested          │
└─────────────────────────────────────────────┘
```

**Interaction:** one card at a time. Swipe or tap. After a decision, the next
card advances. Progress is shown ("3 of 8"). The queue survives interruption.

**Rules:**

- All authenticity evidence visible without scrolling on a 360 px viewport
  (`REQ-SRC-5`).
- Retracted sources: full-card warning treatment, second confirmation required.
- Bulk reject available from the overflow menu; bulk approve is not
  (`REQ-SRC-7`).
- The formatted citation is shown as it will appear — users catch metadata errors
  here more often than in the metadata block.

### 5.4 Review

Reading and commenting on drafts.

| Feature | Behaviour |
|---|---|
| Read | Full document or by section, typographically proper |
| Provenance | Unreviewed AI spans always marked; overlay toggle available |
| Review Mode | Walk unreviewed spans; accept, edit, or reject |
| Comment | Select and comment; threads sync to the Workbench |
| Light edit | Direct text edits, tracked and attributed |
| Suggestions | Accept or reject pending suggestions |

**Not here:** structural changes, drafting runs, tracked-change management,
version restore.

### 5.5 Compliance

Findings grouped by severity, each navigable to its location in the Review page.
Shows `G6` readiness. Rule editing is Workbench-only; viewing is not.

### 5.6 Chat

Full AI chat, project-scoped, with the same context the Workbench assistant has
(subject to sync). The Console's second-best feature after source approval: it is
genuinely useful to ask "what did Chen actually find about LSTM models" while
walking to a seminar.

Responses cite what they drew on. Insertion into the draft is available but
requires navigating to Review — deliberately not one tap.

### 5.7 Activity

Run history, sync events, gate transitions, comments. The Console's equivalent of
the Agent Monitor, presented as a timeline rather than a live monitor.

### 5.8 Vault

Search and read only. Semantic and keyword search over synced Vault content.
Creation, ingestion, and curation are Workbench-only (`20` §6).

### 5.9 Account

Profile, password, MFA, active sessions and devices, subscription, notification
preferences, sync settings, data export, account deletion.

**Session management is prominent**, not buried: seeing and revoking devices is a
security control users actually use.

---

## 6. The sync-dependency problem

The Console can only show what has been synced. For a local-only user, it is
nearly empty.

This is the correct behaviour and the hardest thing to communicate well. The
empty state must read as the privacy promise being kept, not as breakage:

> **Your work is on your computer**
>
> That's where we keep it by default — we can't read your documents, and neither
> can anyone else.
>
> If you'd like to review drafts and approve sources from here, you can turn on
> sync. Your work stays encrypted; we store it without being able to open it.
>
> `[How sync works]`  `[Turn on sync]`  `[Not now]`

**Rules:**

- Never framed as an error or a limitation.
- "How sync works" explains E2E encryption in plain language before the user
  decides.
- No repeated prompting. Once per 30 days at most, on Home only.

### 6.1 Partial sync

Users may sync selectively — a project without its Vault, or drafts without
source PDFs. The Console must handle partial data gracefully: show what exists,
state what is not synced, and offer to sync it, without breaking the page.

---

## 7. Offline and PWA behaviour

The Console is a PWA with a bounded offline story.

| Offline | Behaviour |
|---|---|
| Cached content | Recently viewed projects, drafts, and the source queue readable |
| Comments and approvals | Queued locally, applied on reconnect |
| Text edits | Queued with conflict detection |
| Chat | Unavailable, stated |
| Discovery | Unavailable, stated |

Queued actions are listed with their state. On reconnect, conflicts surface for
human resolution (`REQ-LOC-8`).

---

## 8. Performance

The Console is used on old phones and hotel wifi. Budgets are strict.

| Metric | Budget |
|---|---|
| First contentful paint (3G, mid-tier phone) | < 1.8 s |
| Time to interactive | < 3.5 s |
| Initial JS bundle | < 180 KB gzipped |
| Route chunk | < 60 KB gzipped |
| Lighthouse performance | ≥ 90 |
| Lighthouse accessibility | 100 |

**Implications:** server-rendered or statically generated shell, route-level code
splitting, no heavy client framework state, images responsive and lazy, no
webfont blocking render.

---

## 9. Cross-surface handoff

| From | To | Mechanism |
|---|---|---|
| Console → Workbench | Deep link (`scholaros://project/…/section/…`) opens the desktop app at that position |
| Workbench → Console | "Continue on web" generates a link; requires sync enabled |
| Notification → either | Notifications carry deep links resolving on the surface that opens them |

When a Console user attempts a Workbench-only action, the pattern from `20` §6.2
applies: explain, offer the handoff, offer a reminder.

---

## 10. What the Console will never have

Recorded so that scope creep requires an explicit decision:

| Never | Because |
|---|---|
| Dockable panels | Wrong interaction model for the session length and input |
| Split editors | Same |
| Local model configuration | No local runtime |
| Drafting runs | Long-running, resource-heavy, needs supervision |
| Plugin host | Sandbox is a desktop capability |
| Resource or processing monitors | Nothing local to monitor |
| Export integrity override | `20` §6.1, reason 1 |
| Version restore | `20` §6.1, reason 3 |
| Vault creation or ingestion | Keys and compute are device-held |

A request for any of these is answered by pointing here and at `20` §6. Changing
the answer means amending both documents and stating why.

---

## 11. Progressive enhancement

The Console degrades honestly:

| Condition | Behaviour |
|---|---|
| No JavaScript | Read-only project and draft views render server-side |
| Slow network | Skeletons with real structure; content streams in |
| Old browser | Core reading and approval work; advanced editing disabled with an explanation |
| Reduced motion | All transitions removed |
| High contrast | Honoured via system preference |

Source approval — the flagship task — must work on the widest possible range of
devices. It is the one flow tested against a deliberately old baseline
(`52` §5.4).
