# Desktop UX Specification — The Workbench

> **Doc ID:** 22 · **Status:** Design · **Depends on:** `20`, `21`

The Workbench is the product. This specifies its shell, its panel system, its
editor, its monitors, and its keyboard model.

---

## 1. Design brief

**Built for:** a four-hour writing session on a Tuesday afternoon, with sixty
sources open, three agents running, a supervisor deadline on Friday, and no
internet on the train home.

**Reference points:** professional IDEs (panel discipline, keyboard depth,
command palette), professional writing environments (typographic quality,
distraction-free focus), and professional audio/video tools (monitoring
information density without visual noise).

**Explicitly not:** a web app in a native wrapper, a document editor with a
chatbot bolted on, or a dashboard.

### 1.1 Non-negotiable properties

| Property | Requirement |
|---|---|
| Offline-first | Full function without network except discovery and cloud inference (`REQ-LOC-4`) |
| Sustained | No degradation over an 8-hour session; memory stable |
| Responsive | < 50 ms editor input latency at 150k words (`NFR-PERF-1`) |
| Keyboard-complete | Every function reachable without a mouse (`NFR-A11Y-2`) |
| Recoverable | Crash loses nothing beyond the last event |
| Dense but calm | High information availability, low visual noise |

---

## 2. Shell anatomy

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⌘  Thesis — Chapter 3  ▾   │  G4 Draft  │           ⌕ ⌘K    ⚙  ◐  ⋯   │ A
├──────────┬──────────────────────────────────────────┬──────────────────┤
│          │ ▣ 3.2 Methods ×│ ▣ 3.3 Results ×│  +      │ ▤ AI Assistant   │
│  ▤ OUT   │──────────────────────────────────────────│                  │
│  ▤ SRC   │                                          │  [conversation]  │
│  ▤ VLT   │   The sample comprised 240 participants  │                  │
│  ▤ FIL   │   recruited from three sites (Chen et    │                  │
│          │   al., 2021). Participants completed…    │  ────────────────│
│  [tree]  │                                          │ ▤ Compliance  ⚠3 │
│          │   ┃ Analysis proceeded in two stages.    │                  │
│          │   ┃ First, descriptive statistics were   │  ⚠ Word limit    │
│          │   ┃ computed for all measures.          ⚠│  ⚠ Abstract 340  │
│          │                                          │  ⚠ 2 unsupported │
│          │                                          │                  │
│   B      │                  C                       │        D         │
├──────────┴──────────────────────────────────────────┴──────────────────┤
│ ▤ Agents │ ▤ Workflow │ ▤ Processing │ ▤ Resources │ ▤ Findings  │  E   │
│  Literature Review Agent  ████████░░ 78%   gpt-4o   $0.04   [stop]     │
├────────────────────────────────────────────────────────────────────────┤
│ G4 · 68% yours · 1 running · ⚠3 · ⟳ synced · $2.40/$10 · ▪ 4.2GB · ●   │ F
└────────────────────────────────────────────────────────────────────────┘
```

| Region | Name | Contents |
|---|---|---|
| A | Title bar | Project switcher, gate indicator, search, settings, theme, overflow |
| B | Left dock | Navigation panels: Outline, Sources, Vault, Files |
| C | Editor dock | Document tabs, splittable, the writing surface |
| D | Right dock | Assistive panels: AI, Compliance, Citations, Authorship |
| E | Bottom dock | Monitors: Agents, Workflow, Processing, Resources, Findings, Log |
| F | Status bar | Eight indicators (`20` §8) |

The `┃` marks in the editor are the unreviewed-AI margin rule — always visible,
never disableable (`21` §3.3).

---

## 3. Panel system

### 3.1 Panel contract

Every panel declares:

```yaml
id: knowledge-explorer
title: "Knowledge Vault"
preferred_dock: left
min_width: 240
min_height: 180
supports: [left, right, bottom, float]
state: serializable          # restored exactly on restart
lazy: true                   # not instantiated until first shown
offline_capable: true
```

### 3.2 Docking behaviour

- **Drag to dock.** Dragging a panel tab shows drop zones for each dock and for
  splitting within a dock.
- **Stack or split.** Panels in a dock either stack as tabs or split
  horizontally/vertically.
- **Float.** Any panel can float as a separate window — essential for
  multi-monitor setups, where the Agent Monitor or the Citation Explorer
  typically lives on a second screen.
- **Collapse.** Docks collapse to an icon rail, preserving the panel set.
- **Resize.** Drag dividers; double-click resets to the preferred size.

### 3.3 Layout presets

| Preset | Left | Editor | Right | Bottom |
|---|---|---|---|---|
| **Discovery** | Sources, Vault | Source reader | Candidate details | Findings |
| **Structure** | Outline | Outline builder | AI Assistant | Workflow |
| **Drafting** | Outline | Document | AI Assistant, Citations | Agents |
| **Review** | Outline | Document + Changes (split) | Comments, Authorship | Findings |
| **Compliance** | Outline | Document | Compliance | Findings, Workflow |
| **Focus** | hidden | Document only | hidden | hidden |

Presets are suggestions bound to gate transitions: entering `G4` offers the
Drafting preset. The offer is a notification, never an automatic rearrangement —
a layout that changes under the user is a layout they stop trusting.

### 3.4 The panels

#### Left dock

**Outline** — the Structure tree. Per section: title, word count against budget,
gate state, finding count, unreviewed span count. Drag to reorder (before `G4`
freely, after `G4` with a warning about dependent cross-references). Click to
open in the editor.

**Sources** — the Corpus, grouped and filtered per `20` §5.1. Shows approval
state, whether cited, and where. Drag a source into the editor to insert a
citation. Includes the Candidate Queue as a distinct, badged section — visually
separated to reinforce that candidates are not corpus.

**Knowledge Explorer** — the Vault. Collections, search (keyword and semantic),
recent, and related-to-current-section. "Related" is the panel's highest-value
mode: while drafting section 3.2, it surfaces Vault material relevant to that
section without being asked.

**Files** — project attachments: figures, datasets, templates, supplementary
material. Plain file management.

#### Right dock

**AI Assistant** — conversational chat scoped to the project. Knows the current
section, the corpus, and the structure. Every response cites what it drew on.
Insertion into the document is a separate, explicit action per passage. Model
selector inline. Conversation history per project, searchable.

**Compliance** — Rubric findings grouped by severity, each navigable to its
location and to its source clause. Shows readiness for `G6`. Rule editing opens
here.

**Citation Explorer** — the bibliography as a working surface. Every reference
with: formatted rendering in the project's style, where it is cited, how many
times, which claims depend on it, and its verification state. Detects: cited but
not in the bibliography, in the bibliography but never cited, duplicate entries,
and style inconsistencies. Selecting a reference highlights every citation of it
in the document.

**Authorship** — the Ledger made legible. Overall ratio, per-section breakdown,
origin distribution, a timeline of how the ratio moved, unreviewed span list, and
the report/disclosure generators. Deliberately calm in tone (`UX8`).

**Comments** — comment threads, resolved and open, with a reply surface. Export
to DOCX comments for supervisor review.

#### Bottom dock

**Agent Monitor** — every run, live and historical. Per run: agent, version,
status, progress, model, elapsed, token count, cost, and a stop control. Expanding
a run shows its inputs, its outputs, its reasoning trace where the agent provides
one, and its capability grants. This panel is what makes `P6` (legibility) real.

**Workflow Monitor** — the eight gates as a visual pipeline with per-gate state,
entry and exit criteria, what is outstanding, and sign-off history. For chaptered
projects, per-chapter gate state.

**Local Processing Dashboard** — everything happening on the device: indexing
progress, embedding queue, OCR, transcription, local model status (loaded model,
VRAM use, tokens/sec), and cache sizes. This panel is the local-first promise made
observable.

**Resource Monitor** — CPU, RAM, GPU/VRAM, disk I/O, and disk space, with
Scholar OS's share broken out. Warns before the system is starved. Lets the user
throttle background work.

**Findings** — the unified finding list: compliance, quality gates, unsupported
claims, attribution findings. Filter by severity, section, or kind.

**Log** — a developer-grade event log. Filterable, exportable, and the first
thing support asks for. Hidden by default.

---

## 4. Editor dock

### 4.1 Tabs and splitting

- Multiple documents open as tabs (`REQ-SUR-1`).
- Split horizontally or vertically, arbitrarily nested.
- A document may be open in two panes simultaneously (draft in one, an older
  snapshot in the other).
- Pinned tabs survive "close others".
- Tabs show: title, unsaved indicator, unreviewed-span count, finding count.

### 4.2 Split modes

| Mode | Left/top | Right/bottom |
|---|---|---|
| Two sections | Section 3.2 | Section 3.3 |
| Version compare | Current | Snapshot |
| Source alongside | Draft | Source PDF at the cited page |
| Translation | Draft | Reference text |
| Structure alongside | Draft | Outline detail |

**Source-alongside is the important one.** Writing a claim while its evidence is
visible in the adjacent pane, at the right page, is the interaction that makes
evidence-bound writing feel natural instead of bureaucratic.

---

## 5. The editor

### 5.1 Writing surface

- Measure capped at 65–75 characters regardless of pane width; excess width
  becomes margin, used for annotations.
- Serif document type at user-set size, independent of UI scale.
- Section-scoped by default; whole-document view available.
- Margin gutter carries: provenance rules, comment markers, finding markers,
  change bars.

### 5.2 Editing capabilities

| Capability | Behaviour |
|---|---|
| Rich text | Headings, emphasis, lists, block quotes, footnotes, tables, figures with captions |
| Citations | `@` or ⌘⇧C opens an autocomplete over the **Approved Corpus only** |
| Cross-references | To sections, tables, figures, equations; auto-renumbering |
| Math | LaTeX input, rendered inline |
| Tracked changes | Per-span attribution; DOCX revision-mark round trip |
| Comments | Anchored to spans; threaded; resolvable |
| Find and replace | Regex, scope-limited, provenance-aware (can target AI spans specifically) |
| Outline navigation | Jump, fold, reorder |
| Word count | Live, per section and total, counted per the Rubric's own rules |
| Focus modes | Typewriter scrolling, sentence focus, paragraph focus, full-screen |

### 5.3 Citation insertion — the structural guarantee

```
User types @ or ⌘⇧C
      ↓
Autocomplete over Approved Corpus  ←── the only source of results
      ↓
Selection mints a citation bound to a corpus entry ID
      ↓
Rendered in the project's style by domain/reference
      ↓
Bibliography updates
```

There is no free-text citation entry. A user who wants to cite something not in
the corpus is routed to add it as a source, which routes through approval. This
is how `REQ-SRC-8` becomes structural rather than procedural: the UI offers no
path to the failure.

### 5.4 Provenance interaction

| Action | Result |
|---|---|
| Hover a span | Origin, agent, model, run, timestamp |
| Toggle overlay (⌘⇧P) | Tint all spans by origin |
| Enter Review Mode (⌘⇧R) | Walk unreviewed spans one at a time |
| Edit an AI span | Transitions to `human_edited`; original retained in history |
| Cut and paste within the document | Origin preserved |
| Paste from outside | Origin `imported`; prompt to attribute or mark as quotation |

**Review Mode** is the interaction that satisfies "Reviewed" in `02` §3. It
presents one unreviewed span at a time, in context, with the evidence it claims to
rest on, and requires one of: accept, edit, or reject. Scrolling past text does
not mark it reviewed — only this interaction does.

### 5.5 Inline AI

Never automatic. Invoked by selection + ⌘I, or offered contextually as a subtle
margin affordance the user may ignore. Presented per `21` §3.4 with text, reason,
actions, and provenance. Accept inserts with recorded origin; edit opens the
suggestion for modification before insertion; dismiss suppresses that class of
suggestion for the session.

---

## 6. Command palette

⌘K. The primary navigation mechanism for experienced users.

| Prefix | Searches |
|---|---|
| *(none)* | Commands |
| `>` | Commands explicitly |
| `#` | Sections |
| `@` | Sources |
| `?` | Help |
| `!` | Findings |
| `/` | Agents and runs |

Results are grouped, keyboard-navigable, and show their shortcut. Recently used
commands rank higher. Every menu item and panel action is reachable here — a
command that exists only in a menu is a defect.

---

## 7. Keyboard model

### 7.1 Global

| Shortcut | Action |
|---|---|
| ⌘K | Command palette |
| ⌘P | Quick open section |
| ⌘⇧P | Toggle provenance overlay |
| ⌘⇧R | Review mode |
| ⌘B / ⌘⌥B | Toggle left / right dock |
| ⌘J | Toggle bottom dock |
| ⌘\ | Split editor |
| ⌘1…9 | Focus dock or tab |
| ⌘S | Snapshot |
| ⌘⇧E | Export |
| ⌘, | Settings |
| F1 | Help for the focused element |
| Esc | Cancel, close, or exit mode |

### 7.2 Editor

| Shortcut | Action |
|---|---|
| ⌘⇧C | Insert citation |
| ⌘⇧M | Insert comment |
| ⌘I | AI suggestion for selection |
| ⌘⇧A | Ask AI about selection |
| ⌘⇧F | Find in project |
| ⌘⌥↑/↓ | Move section |
| ⌘⇧V | Compare with snapshot |
| ⌘. | Next finding |
| ⌘⇧. | Next unreviewed span |

### 7.3 Rules

- Every shortcut is remappable.
- Vim and Emacs keymaps are available as plugins.
- No shortcut conflicts with OS or screen-reader reserved keys.
- Shortcuts are shown in menus, tooltips, and the palette.
- A modal that traps focus must be escapable with Esc.

---

## 8. Offline behaviour

| Feature | Offline |
|---|---|
| Editing, structure, outline | Full |
| Citation formatting, bibliography | Full |
| Deterministic compliance rules | Full |
| Vault search (keyword and semantic) | Full |
| Local model inference | Full |
| Export, all formats | Full |
| Snapshots and history | Full |
| Provenance and authorship | Full |
| Cloud model inference | Queued, labelled |
| Literature discovery | Unavailable, explained |
| Identifier resolution and retraction check | Queued |
| Sync | Queued |

The status bar shows offline state persistently. Queued actions are listed and
individually cancellable. Nothing fails silently.

**The design intent:** a user on a long flight can draft, cite, check compliance,
and export. That is the whole point of local-first, and it is testable
(`52` §5.3).

---

## 9. Multi-window and multi-monitor

- **Project windows.** Each project may open its own window with its own layout.
- **Floating panels.** Any panel detaches to its own window.
- **Reader window.** A source PDF or a snapshot opens standalone.
- **Presentation window.** For OT-22, a presenter view on a second display.

Window positions persist per monitor configuration and restore when that
configuration returns — a user who docks and undocks a laptop does not rebuild
their layout twice a day.

---

## 10. Settings

| Section | Contains |
|---|---|
| General | Language, theme, density, startup behaviour |
| Editor | Fonts, sizes, spacing, focus modes, autosave cadence |
| AI providers | Provider config, keys, model bindings per task, budgets |
| Privacy | Warden policy per provider per Egress Class, egress log, preview defaults |
| Knowledge Vault | Location, encryption, indexing, ingestion defaults |
| Sync | Enable, scope, conflict policy, device list |
| Backup | Destination, schedule, retention, restore |
| Agents | Channel, pinned versions, enabled agents, memory tiers |
| Plugins | Installed, permissions, updates, sandbox policy |
| Keyboard | Shortcut map, keymap presets |
| Accessibility | Motion, contrast, screen reader, plain language, text scale |
| Advanced | Resource limits, cache, diagnostics, developer mode |

**Privacy settings are one click from the status bar**, not buried under
Advanced. A privacy control the user cannot find is a privacy control that does
not exist.

---

## 11. Onboarding within the Workbench

First launch is not a tour. It is a real project with the workflow visible:

1. Workspace creation with an explanation of what a workspace is.
2. The AI Setup Wizard (`12` F-ONB-1).
3. The Vault offer, with skip as a peer option.
4. The Workshop, with the fabricated-citation module unskippable.
5. First project creation, guided, with panels introduced as they become
   relevant — the Agent Monitor is explained the first time an agent runs, not in
   an upfront tour nobody remembers.

Panel discovery is contextual and once-only per panel.

---

## 12. Technology direction

Recorded as direction, not decision. The binding choice is `OQ-02`.

| Concern | Direction |
|---|---|
| Shell | Native-adjacent (Tauri preferred over Electron for footprint and memory; the constraint is `NFR-HW-1`'s 8 GB baseline) |
| Kernel process | Separate from the renderer; holds keys, store, and index |
| Editor | Custom document model over a proven text engine; the CDM and Ledger requirements rule out off-the-shelf rich-text editors that do not support span-level metadata |
| Local inference | Ollama and LM Studio via their local APIs; direct GGUF execution as a later option |
| Index | Embedded full-text plus a local vector store; no server dependency |
| Plugin sandbox | WASM-first with a capability-gated host API |

**The editor is the highest-risk build.** Span-level provenance that survives
arbitrary editing is not a feature that can be retrofitted onto an editor chosen
for other reasons (`53` `RISK-01`, `13` §8.4).
