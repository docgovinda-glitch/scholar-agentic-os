# Information Architecture — Scholar OS

> **Doc ID:** 20 · **Status:** Design · **Depends on:** `02`, `11`

How the system's objects are organised, named, and navigated — and the normative
capability matrix that keeps the Workbench and the Console from collapsing into
each other.

---

## 1. The user's mental model

The user does not think in terms of the Kernel or the Mesh. They think:

> *"I'm writing my thesis. I have my sources. The AI is helping. I need it in
> Harvard style by March."*

The IA's job is to make the system's structure match that sentence. Four nouns
carry the whole model:

| User says | System object | Never call it |
|---|---|---|
| "my thesis" | Project | Document, file, workspace |
| "my sources" | Corpus | Library, database, references |
| "my writing" | Draft | Content, output |
| "my library" | Vault | Archive, storage, knowledge base |

Everything else — gates, agents, rules, spans — is *machinery the user
encounters*, not a place they navigate to.

---

## 2. Object hierarchy

```
Account
│
├── Profile, credentials, MFA, sessions, subscription
│
└── Workspace *                                   (e.g. "Doctorate", "Teaching")
    │
    ├── Settings         providers, model bindings, privacy posture, defaults
    ├── Vault ?          optional, shared by every Project in the Workspace
    ├── Plugins          installed and enabled per workspace
    │
    └── Project *                                 (one primary output each)
        │
        ├── Brief        output type, intake answers, deadline, venue
        ├── Rubric       compiled rules, waivers, requirement sources
        ├── Corpus       approved sources only
        │   └── Candidates    pending queue — not part of the Corpus
        ├── Structure    outline, sections, budgets, order
        ├── Draft        per-section content, spans, comments, changes
        ├── Evidence     claim–evidence graph
        ├── Ledger       provenance and decisions
        ├── History      snapshots, timeline
        └── Outputs      exports, reports, submission packages
```

`*` = many · `?` = optional

### 2.1 Boundary rules

- **A Project owns its Corpus.** Sources are copied in from the Vault, not
  referenced. A Project must remain intact if the Vault is deleted.
- **The Vault belongs to the Workspace.** Multiple Projects draw from it.
- **Candidates are not Corpus.** They live adjacent to it and have no citation
  identity. This separation is the structural basis of `REQ-SRC-8`.
- **The Ledger is append-only and per-Project.** It is never edited, only
  extended.
- **Workspaces do not share Projects.** Moving a Project between Workspaces is a
  copy with a recorded provenance note.

---

## 3. Naming rules

| Rule | Example |
|---|---|
| User-facing names use plain English, not subsystem names | "Knowledge Vault", not "Vault"; "Privacy Guard", not "Warden" |
| Verbs describe the user's action, not the system's | "Approve source", not "Commit to corpus" |
| No invented jargon where an academic term exists | "Bibliography", not "reference collection" |
| Status words are unambiguous | "Not reviewed" beats "Pending" |
| Counts are absolute, not relative | "3 blocking issues", not "Some issues" |

### 3.1 Subsystem names in the UI

| Internal | User-facing | Shown where |
|---|---|---|
| Atlas | (invisible) | Users see output types, not the catalog |
| Conductor | "Workflow" | Workflow Monitor |
| Ledger | "Authorship" | Status bar, Authorship panel |
| Rubric | "Requirements" | Compliance panel |
| Mesh | "Agents" | Agent Monitor |
| Gateway | "AI providers" | Settings |
| Warden | "Privacy Guard" | Settings, egress prompts |
| Vault | "Knowledge Vault" | Everywhere |
| Relay | "Sync" | Settings, status bar |
| Foundry | (admin only) | Admin console |

The user learns three names: Knowledge Vault, Privacy Guard, and Workflow.
Everything else is described by what it does.

---

## 4. Navigation architecture

The two surfaces navigate differently by design.

### 4.1 Workbench — spatial

The Workbench does not have "pages". It has a persistent workspace whose regions
change content. Navigation is **spatial and additive**: opening something adds a
panel or a tab rather than replacing the view.

```
┌──────────────────────────────────────────────────────────────────┐
│ Title bar · Project switcher · Gate indicator · Command palette   │
├─────────┬───────────────────────────────────────┬────────────────┤
│         │                                       │                │
│ LEFT    │           EDITOR DOCK                 │  RIGHT DOCK    │
│ DOCK    │        (tabs, splittable)             │                │
│         │                                       │  AI Chat       │
│ Outline │                                       │  Compliance    │
│ Sources │                                       │  Citations     │
│ Vault   │                                       │  Authorship    │
│ Files   │                                       │                │
│         ├───────────────────────────────────────┤                │
│         │        BOTTOM DOCK                    │                │
│         │  Agents · Workflow · Processing ·     │                │
│         │  Resources · Findings · Log           │                │
├─────────┴───────────────────────────────────────┴────────────────┤
│ Status: gate · authorship % · runs · sync · budget · resources    │
└──────────────────────────────────────────────────────────────────┘
```

**Navigation primitives:** command palette (primary), panel toggles, editor
tabs, breadcrumbs within panels, go-to-location from any finding.

### 4.2 Console — hierarchical

The Console has pages, a back button, and one focus at a time. Navigation is
**hierarchical and replacing**.

```
Home (dashboard)
├── Projects
│   └── Project
│       ├── Overview        status, gate, next action
│       ├── Review          read and comment on drafts
│       ├── Sources         approval queue  ← the flagship quick task
│       ├── Compliance      findings summary
│       ├── Chat            AI assistant
│       └── Activity        runs, timeline
├── Vault                   search and read
├── Notifications
└── Account                 profile, security, subscription, devices
```

**Navigation primitives:** bottom tab bar on mobile, top nav on desktop web,
breadcrumbs, back.

### 4.3 Why these differ

| | Workbench | Console |
|---|---|---|
| Session | Hours | Minutes |
| Task | Deep, multi-object | Single, bounded |
| Context needed | Many objects visible at once | One thing at a time |
| Input | Keyboard-primary | Touch-primary |
| Consequence | Spatial persistence wins | Hierarchical clarity wins |

A tabbed panel layout on a phone is worse than useless. A page-at-a-time
hierarchy in a four-hour writing session is worse than useless. This is why
`REQ-SUR-5` forbids replication.

---

## 5. Content organisation within key areas

### 5.1 Corpus

**Default view:** grouped by approval state, then by relevance.

| Grouping | Options |
|---|---|
| Primary | Approval state · Type · Year · Author · Theme · Section used in |
| Filters | Has full text · Cited in draft · Uncited · From Vault · Discovered · Uploaded · Retracted |
| Sort | Relevance · Date added · Publication year · Citation count in draft |

**The "uncited" filter earns its place:** a source approved but never cited is
either a gap in the draft or a source that should not have been approved. Both
are worth surfacing before `G6`.

### 5.2 Draft

Organised by the Structure tree. Each section carries: word count against budget,
gate state, unresolved findings, unreviewed spans, and last-modified.

### 5.3 Vault

| Grouping | Options |
|---|---|
| Primary | Collection · Type · Date added · Source · Tag |
| Search | Keyword, semantic, or both; scoped to a collection or global |
| Views | List · Grid (for visual material) · Timeline · Graph (relationships) |

Collections are user-defined and may nest. A document may belong to several.

### 5.4 Findings

Compliance findings, quality gate results, unsupported claims, and attribution
findings share one presentation model:

```
[severity] [what] [where] → [action]
```

Grouped by severity, then by location. Every finding is navigable and either
resolvable or waivable. A finding with neither is a specification defect.

---

## 6. Surface capability matrix — normative

This table is the contract. A feature request that contradicts it must amend
this table first, with a rationale.

Legend: **●** full · **◐** limited · **○** view only · **—** absent

| Capability | Workbench | Console | Mobile | Rationale for limits |
|---|---|---|---|---|
| **Account & setup** |
| Create account, verify email | ● | ● | ● | |
| Login, password reset, MFA | ● | ● | ● | |
| AI Setup Wizard | ● | ◐ | ○ | Local provider detection needs the desktop |
| Configure local models | ● | — | — | No local runtime in a browser |
| Configure cloud providers | ● | ● | ◐ | Key entry on mobile is error-prone but permitted |
| Workshop | ● | ◐ | ○ | Full interactivity needs space |
| **Projects** |
| Create project, select output type | ● | ● | ◐ | |
| Complete intake form | ● | ● | ◐ | Long forms are poor on phones but not blocked |
| View project overview | ● | ● | ● | |
| Archive, delete, restore | ● | ● | ○ | |
| **Sources** |
| Upload files | ● | ◐ | ◐ | Console upload queues for desktop processing |
| Parse and index | ● | — | — | Local compute (`REQ-LOC-1`) |
| Run discovery | ● | ● | ◐ | |
| **Approve or reject candidates** | ● | ● | ● | Deliberately first-class on every surface |
| Manage corpus | ● | ◐ | ○ | |
| **Requirements** |
| Upload requirement sources | ● | ◐ | — | |
| Review compiled rules | ● | ● | ○ | |
| Edit and waive rules | ● | ◐ | — | Consequential; needs context |
| **Structure** |
| Build and edit outline | ● | ◐ | ○ | Reordering is a desktop interaction |
| Approve structure (`G3`) | ● | ● | ○ | |
| **Drafting** |
| Run section drafting | ● | — | — | Long-running, resource-heavy |
| Full editing | ● | ◐ | — | |
| Light editing (text, comments) | ● | ● | ◐ | Mobile: comment only |
| Accept or reject suggestions | ● | ● | ◐ | |
| Tracked changes | ● | ○ | ○ | |
| Version history and restore | ● | ○ | — | Restoring from a phone is a footgun |
| **AI** |
| AI chat | ● | ● | ● | |
| Inline suggestions | ● | ◐ | — | |
| Agent monitoring | ● | ○ | ○ | |
| Interrupt a run | ● | ● | ● | Always available, everywhere |
| **Compliance** |
| View findings | ● | ● | ● | |
| Resolve findings | ● | ◐ | — | |
| Compliance report | ● | ○ | ○ | |
| **Integrity** |
| Authorship ratio | ● | ● | ● | |
| Authorship report | ● | ○ | ○ | |
| AI disclosure statement | ● | ◐ | — | |
| **Override export block** | ● | — | — | See §6.1 |
| **Export** |
| Export DOCX/ODT | ● | ◐ | — | Console requires sync + consent |
| Export other formats | ● | — | — | |
| Submission package | ● | — | — | |
| **Vault** |
| Create, configure | ● | — | — | Key material is device-held |
| Ingest | ● | — | — | Local compute |
| Search and read | ● | ◐ | ◐ | Console requires sync |
| Curate | ● | — | — | |
| **Platform** |
| Plugins | ● | — | — | Sandbox is a desktop capability |
| Resource monitor | ● | — | — | |
| Local processing dashboard | ● | — | — | |
| Sync control | ● | ● | ● | |
| Notifications | ● | ● | ● | |

### 6.1 The three deliberate asymmetries

Most limits above are technical. Three are **product decisions** and are worth
defending explicitly:

1. **Export integrity override is Workbench-only.** The override exists because
   the user owns their work (`REQ-INT-4`). But overriding requires seeing what
   you are overriding — the unreviewed spans in context. A phone cannot show
   that. Making the override easy on a small screen would convert a deliberate
   decision into a dismissed dialog.

2. **Source approval is first-class on every surface.** It is the only
   consequential decision we deliberately make *easy* on a phone. The reasoning:
   approval is a per-item yes/no with all the evidence visible in one card, it is
   the workflow's most common bottleneck, and the alternative — batching a
   hundred decisions until the user is at their desk — produces rubber-stamping,
   which is a worse integrity outcome than thoughtful approval on a train.

3. **Version restore is not on mobile.** Restoring a snapshot is destructive to
   in-flight work and hard to preview on a small screen.

### 6.2 How limits are communicated

`REQ-SUR-6` requires that capability differences are explicit. The pattern:

> **Not available here**
> Drafting runs use your computer's processing power, so they run in the
> Workbench.
> `[Open in Workbench]` `[Remind me]`

Never a greyed-out control with no explanation. Never a silent no-op.

---

## 7. Search architecture

| Scope | Searches | Available on |
|---|---|---|
| **Command palette** | Commands, panels, settings, navigation | Workbench |
| **Project search** | Draft text, sources, notes, findings, comments | All |
| **Corpus search** | Approved source full text and metadata | All |
| **Vault search** | Whole Vault, keyword and semantic | Workbench full; Console if synced |
| **Global search** | Across all projects and the Vault | Workbench |

Search results are typed and grouped by kind, never a flat list. Semantic and
keyword results are labelled so the user knows why something matched.

---

## 8. State visibility

The user must be able to answer these at a glance, without navigation:

| Question | Where answered |
|---|---|
| What gate am I at? | Title bar (Workbench), project card (Console) |
| What is my next action? | Gate indicator, dashboard |
| How much of this is mine? | Status bar authorship % |
| Is anything running? | Status bar run indicator |
| Is anything blocking me? | Status bar finding count |
| Is my work saved and backed up? | Status bar sync and backup state |
| What am I spending? | Status bar budget indicator |
| Am I online? | Status bar connectivity |

Eight indicators is the ceiling for the status bar. Adding a ninth requires
removing one.

---

## 9. Empty states

Every empty state must say what the thing is, why it is empty, and what to do.
The high-traffic ones:

| Empty | Message shape |
|---|---|
| No projects | "Projects are what you produce — a thesis, an essay, an article. Start with what you need to hand in." → Create |
| No sources | "Your sources are the evidence your work stands on. Upload what you have, or let us help you find some." → Upload / Discover |
| No candidates | "Nothing waiting for review. Run discovery when you want more evidence." → Discover |
| Vault skipped | "You don't have a Knowledge Vault. It's a long-term library of everything you read — optional, and you can add one any time." → Learn more / Create / Not now |
| No findings | "Nothing blocking you. Requirements are checked as you write." |
| Console, no sync | "Your work is on your computer, which is where we keep it by default. Turn on sync to see it here." → About sync / Enable |

The Console-no-sync state matters: without care it reads as breakage. It must
read as *the privacy promise being kept*.

---

## 10. Responsive breakpoints

| Breakpoint | Width | Applies to | Layout |
|---|---|---|---|
| Compact | 360–599 px | Console | Single column, bottom tabs |
| Medium | 600–1023 px | Console | Single column, wider, top nav |
| Expanded | 1024–1439 px | Console, small Workbench | Two columns; Workbench: two docks max |
| Large | 1440–1919 px | Workbench | Three docks |
| Extra large | 1920 px+ | Workbench | Three docks + split editor |

**Workbench minimum:** 1280 × 800. Below this the panel system degrades to a
single-dock mode with a warning; the product is honest that it is not designed
for smaller displays.
