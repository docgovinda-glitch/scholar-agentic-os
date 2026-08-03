# Desktop Web UX Specification — Desk

> **Doc ID:** 22 · **Status:** Design · **Revision:** 2
> **Replaces:** the desktop-application specification

Desk is the working environment: a browser application built for sessions
measured in hours, on a screen wide enough to hold several things at once.

---

## 1. Design brief

**Built for:** a Tuesday afternoon in the library. Three hours. Sixty sources.
A draft chapter, its outline, and a PDF open at the page being cited. A deadline
on Friday.

**Constraint that shapes everything:** this is a browser tab, not an application
window. No local filesystem, no background processes surviving a closed tab, no
multi-window management we control, and the user can hit refresh at any moment.

**What we do about it:** state lives on the server and is restored exactly. A
refresh, a crash, a closed laptop lid, a browser update — none of them lose more
than the last few seconds of typing.

### 1.1 Non-negotiable properties

| Property | Requirement |
|---|---|
| Restorable | A refresh restores layout, open documents, scroll position, and selection |
| Durable | No edit is lost; autosave is continuous, not periodic |
| Responsive | Editor input latency < 50 ms at 100k words |
| Sustained | An 8-hour session does not degrade; memory stable |
| Keyboard-complete | Every function reachable without a mouse |
| Dense but calm | High information availability, low visual noise |

---

## 2. Layout

Four regions. Not dockable panels — a fixed grammar the user configures within.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Scholar OS   Thesis — Chapter 3 ▾    G4 Draft      ⌕ ⌘K    ◐  ⚙  ◍    │ A
├──────────┬──────────────────────────────────────────┬──────────────────┤
│          │  Methods ×  │  Results ×  │  +           │  ▤ Studio        │
│  RAIL    │──────────────────────────────────────────│                  │
│          │                                          │  Level 3: Flow   │
│ ▤ Outline│  The sample comprised 240 participants   │  ⚙ voice on      │
│ ▤ Sources│  recruited from three sites (Chen et     │                  │
│ ▤ Vault  │  al., 2021). Participants completed…     │  12 changes      │
│ ▤ Files  │                                          │  1 needs review  │
│          │  Analysis proceeded in two stages.       │  ─────────────── │
│  [tree]  │  First, descriptive statistics were      │  ▤ Compliance ⚠3 │
│          │  computed for all measures.              │                  │
│          │                                          │  ⚠ Over word     │
│    B     │              PRIMARY                     │     limit by 842 │
│          │                                          │  ⚠ 2 unsupported │
│          ├──────────────────────────────────────────┤       ASIDE      │
│          │  TRAY   Agents · Findings · Activity     │        D         │
│          │  Language Editor  ████████░░ 78%  [stop] │                  │
├──────────┴──────────────────────────────────────────┴──────────────────┤
│ G4 · 4 of 7 sections · 1 running · ⚠3 · saved 2s ago · $2.40/$10      │ E
└────────────────────────────────────────────────────────────────────────┘
```

| Region | Name | Holds |
|---|---|---|
| A | Header | Project switcher, gate indicator, search, settings, theme, account |
| B | Rail | Navigation: Outline, Sources, Vault, Files |
| C | Primary | Document tabs, splittable — the writing surface |
| D | Aside | Studio, Compliance, Citations, Chat, Comments |
| E | Status | Six indicators |
| — | Tray | Collapsible bottom strip: Agents, Findings, Activity |

### 2.1 Why regions rather than free docking

The desktop-application design used arbitrary dockable panels. In a browser that
is the wrong trade: docking is expensive to build well, expensive to restore
across sessions, and mostly used to recreate one of about four arrangements.

Desk gives fixed regions with configurable *contents*, plus presets. The user
gets the arrangements they actually want without a window manager in a tab.

### 2.2 Region behaviour

| Region | Resize | Collapse | Contents |
|---|---|---|---|
| Rail | Drag, 200–400 px | To icon strip, or fully | One panel at a time; tabs to switch |
| Primary | Fills remaining | Never | Document tabs; splits vertically or horizontally |
| Aside | Drag, 280–560 px | To icon strip, or fully | Stacked panels, collapsible individually |
| Tray | Drag height | To a one-line summary, or fully | Tabbed |

### 2.3 Presets

| Preset | Rail | Primary | Aside | Tray |
|---|---|---|---|---|
| **Sources** | Sources | Source reader | Candidate detail | Findings |
| **Structure** | Outline | Outline builder | Chat | — |
| **Drafting** | Outline | Document | Chat, Citations | Agents |
| **Writing** | Outline | Document | **Studio** | — |
| **Review** | Outline | Document + changes (split) | Comments, Compliance | Findings |
| **Compliance** | Outline | Document | Compliance | Findings |
| **Focus** | hidden | Document only | hidden | hidden |

Presets are offered at gate transitions as a notification, never applied
automatically. A layout that rearranges itself is a layout the user stops
trusting.

---

## 3. Panels

### Rail panels

**Outline** — the structure tree. Per section: word count against budget, gate
state, finding count. Drag to reorder. Click to open in Primary.

**Sources** — the corpus, grouped by approval state and filterable. Shows whether
each source is cited and where. Drag a source into the editor to insert a
citation. The candidate queue appears as a separate, badged section — visually
distinct because candidates are not corpus.

**Vault** — collections, search (keyword and semantic), recent, and
related-to-current-section. The "related" mode is the highest-value one: while
writing section 3.2, it surfaces relevant Vault material unprompted.

**Files** — project attachments: figures, datasets, templates, supplementary
material.

### Aside panels

**Studio** — the Language & Voice Studio (`32`). Intervention level selector,
voice-matching toggle, the diff, and per-change review. Gets its own preset
because writing sessions with heavy refinement are a distinct working mode.

**Compliance** — Rubric findings by severity, each navigable to its location and
to the source clause it came from.

**Citations** — the bibliography as a working surface. Each reference with its
formatted rendering, where it is cited, how often, and which claims depend on it.
Detects cited-but-absent, present-but-uncited, duplicates, and style
inconsistencies.

**Chat** — project-scoped assistant. Knows the current section, the corpus, and
the structure. Responses cite what they drew on. Insertion into the document is a
separate explicit action.

**Comments** — threads, open and resolved, exportable to DOCX comments for
supervisor review.

### Tray panels

**Agents** — every run, live and historical: agent, status, progress, model,
elapsed, cost, stop control. Expanding shows inputs, outputs, and capability
grants.

**Findings** — the unified list: compliance, quality gates, unsupported claims,
attribution findings. Filterable by severity, section, or kind.

**Activity** — gate transitions, sign-offs, exports, sync events.

---

## 4. Primary region

### 4.1 Tabs and splitting

- Multiple documents as tabs.
- Split vertically or horizontally, one level deep. (Arbitrary nesting was a
  desktop-app affordance; in a browser it costs more than it returns.)
- A document may be open in both panes — draft in one, a snapshot in the other.
- Tabs show title, unsaved indicator, and finding count.

### 4.2 Split modes

| Mode | Left | Right |
|---|---|---|
| Two sections | 3.2 | 3.3 |
| Version compare | Current | Snapshot |
| **Source alongside** | Draft | Source PDF at the cited page |
| Studio review | Original | Refined |
| Structure alongside | Draft | Outline detail |

**Source-alongside is the important one.** Writing a claim with its evidence
visible at the right page is what makes evidence-bound writing feel natural
rather than bureaucratic.

---

## 5. The editor

### 5.1 Writing surface

- Measure capped at 65–75 characters regardless of pane width; excess becomes
  margin used for annotations.
- Serif document type at user-set size, independent of UI scale.
- Margin gutter carries comment markers, finding markers, and change bars.

### 5.2 Capabilities

| Capability | Behaviour |
|---|---|
| Rich text | Headings, emphasis, lists, block quotes, footnotes, tables, figures with captions |
| Citations | `@` or ⌘⇧C opens autocomplete over the **approved corpus only** |
| Cross-references | Sections, tables, figures, equations; auto-renumbering |
| Math | LaTeX input, rendered inline |
| Tracked changes | DOCX revision-mark round trip |
| Comments | Anchored, threaded, resolvable |
| Find and replace | Regex, scope-limited |
| Outline navigation | Jump, fold, reorder |
| Word count | Live, per section and total, counted per the Rubric's rules |
| Focus modes | Typewriter scrolling, sentence focus, full-screen |
| **Studio invocation** | Select text, ⌘I, choose level |

### 5.3 Citation insertion — the structural guarantee

```
⌘⇧C or @
    ↓
autocomplete over the Approved Corpus  ←── the only result source
    ↓
selection mints a citation bound to a corpus entry ID
    ↓
rendered in the project's style · bibliography updates
```

There is no free-text citation entry. A user wanting to cite something not in the
corpus is routed to add it as a source, which routes through approval. The UI
offers no path to the failure.

### 5.4 Autosave and recovery

| Mechanism | Behaviour |
|---|---|
| Local buffer | Every keystroke, to IndexedDB |
| Server flush | Every 2 s of inactivity, or every 10 s of continuous typing |
| Conflict | Concurrent edit from another tab or device surfaces for resolution |
| Refresh | Full state restored: layout, tabs, scroll, selection |
| Offline | Editing continues against the local buffer; queued and flushed on reconnect |
| Crash | Recovery from the local buffer, with the user told what was recovered |

---

## 6. Command palette

⌘K. The primary navigation for experienced users.

| Prefix | Searches |
|---|---|
| *(none)* | Commands |
| `#` | Sections |
| `@` | Sources |
| `?` | Help |
| `!` | Findings |
| `/` | Agents and runs |

Every menu item and panel action is reachable here. A command existing only in a
menu is a defect.

---

## 7. Keyboard

### 7.1 Global

| Shortcut | Action |
|---|---|
| ⌘K | Command palette |
| ⌘P | Quick open section |
| ⌘B / ⌘⌥B | Toggle rail / aside |
| ⌘J | Toggle tray |
| ⌘\ | Split primary |
| ⌘S | Snapshot |
| ⌘⇧E | Export |
| ⌘, | Settings |
| Esc | Cancel, close, exit mode |

### 7.2 Editor

| Shortcut | Action |
|---|---|
| ⌘⇧C | Insert citation |
| ⌘⇧M | Comment |
| **⌘I** | **Refine selection (Studio)** |
| ⌘⇧I | Refine with level picker |
| ⌘⇧A | Ask AI about selection |
| ⌘⇧F | Find in project |
| ⌘⌥↑/↓ | Move section |
| ⌘. | Next finding |

### 7.3 Browser conflicts

Some combinations belong to the browser and cannot be intercepted reliably
(⌘N, ⌘T, ⌘W, ⌘L). Desk does not bind them. Where a natural shortcut is taken,
the alternative is shown in the palette and every shortcut is remappable.

---

## 8. Offline

A browser application cannot be offline-first. Desk is honest about what it does
and does not do.

| Capability | Offline |
|---|---|
| Editing an open document | Yes, buffered locally |
| Reading cached sections and sources | Yes |
| Outline navigation | Yes |
| Comments | Yes, queued |
| Citation insertion from cached corpus | Yes |
| Compliance checking | No — server-evaluated |
| Studio refinement | No |
| Agent runs | No |
| Discovery | No |
| Export | No |

The status bar shows offline state persistently, queued changes are listed, and
unavailable features are labelled with the reason rather than silently disabled.

---

## 9. Performance

| Metric | Budget |
|---|---|
| First contentful paint | < 1.2 s |
| Time to interactive | < 2.5 s |
| Editor input latency at 100k words | < 50 ms |
| Section switch | < 150 ms |
| Panel toggle | < 100 ms |
| Initial JS bundle | < 250 KB gzipped |
| Route chunk | < 80 KB gzipped |
| Memory after 8 hours | Stable within a defined envelope |

Long documents are virtualised. A 100k-word thesis loads section by section, not
whole.

---

## 10. Settings

| Section | Contains |
|---|---|
| General | Language, theme, density, defaults |
| Editor | Fonts, sizes, spacing, focus modes |
| **Language & Voice** | Default intervention level, voice profile, L1, explanatory mode |
| AI providers | Provider config, keys, model bindings per task, budgets |
| Privacy | Egress policy per provider per class, egress log, retention |
| Knowledge Vault | Storage, indexing, ingestion defaults |
| Writing History | Enable/disable, view, export, delete |
| Agents | Channel, enabled agents |
| Keyboard | Shortcut map |
| Accessibility | Motion, contrast, screen reader, plain language, text scale |
| Account | Profile, password, MFA, sessions, subscription, data export |

---

## 11. Responsive behaviour

Desk applies from 1024 px upward.

| Width | Layout |
|---|---|
| 1024–1279 | Rail collapsed to icons; aside toggles over primary |
| 1280–1599 | Rail, primary, aside; tray collapsed |
| 1600–1919 | All four regions |
| 1920+ | All four, plus split primary comfortable |

**Below 1024 px the browser serves Pocket** (`23`), not a squeezed Desk. The
handover is a genuine layout switch, not a media query — they are different
applications sharing a codebase.

---

## 12. Technology direction

| Concern | Direction |
|---|---|
| Framework | React 19 with a server-rendered shell for first paint |
| Editor | Custom document model over a proven text engine; CDM requirements rule out plain rich-text editors |
| State | Server-authoritative with an optimistic local buffer |
| Persistence | IndexedDB for the buffer; server for truth |
| Real-time | Server-sent events for run progress and streaming output |
| Layout | CSS Grid regions; no drag-and-drop window manager |

The existing repository is already React 19 with Vite and Tailwind, which
revision 2 makes an asset (`13` §8).
