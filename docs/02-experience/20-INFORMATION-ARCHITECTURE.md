# Information Architecture

> **Doc ID:** 20 · **Status:** Design · **Revision:** 2 · **Depends on:** `02`, `11`

How the system's objects are organised and navigated, and the normative
capability matrix that keeps Desk and Pocket from collapsing into one mediocre
layout.

---

## 1. The user's mental model

The user thinks:

> *"I'm writing my thesis. I have my sources. The AI is helping. It needs to be
> in Harvard style by March."*

Four nouns carry the whole model:

| User says | Object | Never call it |
|---|---|---|
| "my thesis" | Project | Document, file, workspace |
| "my sources" | Corpus | Library, database, references |
| "my writing" | Draft | Content, output |
| "my library" | Vault | Archive, storage, knowledge base |

Everything else — gates, agents, rules, refinement levels — is machinery the user
encounters, not a place they navigate to.

---

## 2. Object hierarchy

```
Account
│
├── Profile, credentials, MFA, sessions, subscription
├── Voice Profile ?                          (32 §5)
│
└── Workspace *
    ├── Settings         providers, bindings, privacy, defaults
    ├── Vault ?          optional, shared across the workspace's projects
    │
    └── Project *
        ├── Brief        output type, intake answers, deadline, venue
        ├── Rubric       compiled rules, waivers, requirement sources
        ├── Corpus       approved sources only
        │   └── Candidates    pending queue — not corpus
        ├── Structure    outline, sections, budgets
        ├── Draft        per-section content, comments, changes
        ├── Evidence     claim–evidence graph
        ├── History ?    optional Writing History (32 §8)
        ├── Snapshots
        └── Outputs      exports, reports, packages
```

`*` many · `?` optional

### 2.1 Boundary rules

- **A Project owns its Corpus.** Sources are copied in from the Vault, not
  referenced, so a Project survives the Vault being deleted.
- **The Vault belongs to the Workspace.**
- **Candidates are not Corpus.** They have no citation identity. This separation
  is the structural basis of the citation guarantee.
- **The Voice Profile is account-level**, not per project — the user's voice
  does not change between assignments.
- **Writing History is per project and optional.**

---

## 3. Naming

| Rule | Example |
|---|---|
| Plain English, not subsystem names | "Knowledge Vault" not "Vault" |
| Verbs describe the user's action | "Approve source" not "Commit to corpus" |
| Use the academic term where one exists | "Bibliography" not "reference collection" |
| Unambiguous status words | "Not reviewed" beats "Pending" |
| Absolute counts | "3 blocking issues" not "some issues" |

### 3.1 Subsystem names in the UI

| Internal | User-facing |
|---|---|
| Atlas | (invisible — users see output types) |
| Conductor | "Workflow" |
| Rubric | "Requirements" |
| Mesh | "Agents" |
| Gateway | "AI providers" |
| Warden | "Privacy" |
| Studio | **"Language & Voice"** |
| Vault | "Knowledge Vault" |
| Desk / Pocket | (invisible — one product) |

The user learns three names: Knowledge Vault, Language & Voice, and Workflow.

---

## 4. Navigation

### 4.1 Desk — spatial

No pages. A persistent workspace whose regions change content. Navigation is
**spatial and additive**: opening something adds a tab or changes a region rather
than replacing the view.

Primitives: command palette (⌘K), region panel switching, document tabs,
go-to-location from any finding.

### 4.2 Pocket — hierarchical

Pages, a back gesture, one focus at a time. Navigation is **hierarchical and
replacing**.

```
Home
├── Projects → Project → { Overview · Read · Sources · Requirements · Ask · Activity }
├── Search
└── Me
```

Primitives: bottom tab bar, push navigation, back.

### 4.3 Why they differ

| | Desk | Pocket |
|---|---|---|
| Session | Hours | Minutes |
| Task | Deep, multi-object | Single, bounded |
| Context needed | Several objects visible at once | One thing |
| Input | Keyboard-primary | Thumb-primary |
| Winner | Spatial persistence | Hierarchical clarity |

---

## 5. Content organisation

### 5.1 Corpus

| Grouping | Options |
|---|---|
| Primary | Approval state · Type · Year · Author · Theme · Section used in |
| Filters | Has full text · Cited · **Uncited** · From Vault · Discovered · Uploaded · Retracted |
| Sort | Relevance · Date added · Publication year · Citation count in draft |

**"Uncited" earns its place:** an approved but never-cited source is either a gap
in the draft or a source that should not have been approved. Both are worth
surfacing before `G6`.

### 5.2 Draft

Organised by the Structure tree. Per section: word count against budget, gate
state, unresolved findings, last modified.

### 5.3 Vault

| Grouping | Options |
|---|---|
| Primary | Collection · Type · Date added · Source · Tag |
| Search | Keyword, semantic, or both |
| Views | List · Grid · Timeline · Graph |

### 5.4 Findings

Compliance findings, quality gate results, unsupported claims, and attribution
findings share one model:

```
[severity] [what] [where] → [action]
```

Every finding is navigable and either resolvable or waivable. A finding with
neither is a specification defect.

---

## 6. Surface capability matrix — normative

The contract. A feature request contradicting this must amend the table first,
with a rationale.

**●** full · **◐** limited · **○** view only · **—** absent

| Capability | Desk | Pocket | Rationale for limits |
|---|---|---|---|
| **Account** |
| Register, verify, login, MFA | ● | ● | |
| Provider configuration | ● | ○ | Key entry is error-prone on a phone |
| Onboarding | ● | ◐ | Long forms; partial save with Desk handoff |
| Workshop | ● | ◐ | |
| **Projects** |
| Create, select output type | ● | ◐ | |
| Intake form | ● | ◐ | Partial save, finish on Desk |
| Overview | ● | ● | |
| Archive, delete | ● | ○ | |
| **Sources** |
| Upload | ● | ◐ | Share target and camera on Pocket |
| Run discovery | ● | ● | |
| **Approve / reject candidates** | ● | ● | Deliberately first-class on both |
| Manage corpus | ● | ○ | |
| **Requirements** |
| Upload requirement sources | ● | — | |
| Review compiled rules | ● | ○ | |
| Edit, waive rules | ● | — | Consequential; needs the source clause alongside |
| **Structure** |
| Build and edit outline | ● | — | Reordering is a pointer interaction |
| Approve structure | ● | ● | |
| **Drafting** |
| Run section drafting | ● | — | Long-running; needs supervision |
| Full editing | ● | ◐ | Pocket: text edits and comments |
| Tracked changes | ● | ○ | |
| Version restore | ● | — | Destructive; poor preview on a phone |
| **Language & Voice** |
| Invoke refinement | ● | — | Choosing a level needs the passage in view |
| **Review a refinement diff** | ● | ● | One change at a time suits a phone well |
| Voice Profile setup | ● | ○ | |
| Explanatory mode | ● | ● | |
| **AI** |
| Chat | ● | ● | |
| Agent monitoring | ● | ○ | |
| Interrupt a run | ● | ● | Always available everywhere |
| **Compliance** |
| View findings | ● | ● | |
| Resolve findings | ● | ◐ | |
| Compliance report | ● | ○ | |
| **Writing History** |
| Enable, view, export, delete | ● | ○ | |
| **Export** |
| Export any format | ● | — | Format and option choices belong on Desk |
| Submission package | ● | — | |
| **Vault** |
| Ingest, curate | ● | — | Bulk operations |
| Search and read | ● | ● | |
| **Platform** |
| Plugins | ● | — | |
| Notifications | ● | ● | |

### 6.1 The three deliberate asymmetries

Most limits are practical. Three are product decisions worth defending:

1. **Source approval is first-class on both surfaces.** The only consequential
   decision deliberately made easy on a phone. Approval is a per-item yes/no with
   all evidence on one card, it is the workflow's most common bottleneck, and
   batching it until the user is at a desk produces rubber-stamping — a worse
   outcome than thoughtful approval on a bus.

2. **Refinement is invoked on Desk, reviewed on both.** Choosing how far to
   intervene needs the passage in view. Working through the resulting diff one
   change at a time is well suited to a phone, and it is a genuinely good use of
   ten spare minutes.

3. **Export is Desk-only.** Format, template, and packaging choices are
   consequential and multi-part. A mis-exported submission at 2am is the failure
   we most want to avoid.

### 6.2 Communicating limits

Never a greyed control with no explanation. Never a silent no-op.

> **Not available on your phone**
> Choosing how much to change in a passage works better with the passage in
> front of you.
> `[Open on desktop]` `[Remind me]`

---

## 7. Search

| Scope | Searches | Surface |
|---|---|---|
| Command palette | Commands, panels, settings, navigation | Desk |
| Project search | Draft, sources, notes, findings, comments | Both |
| Corpus search | Approved source full text and metadata | Both |
| Vault search | Whole Vault, keyword and semantic | Both |
| Global search | Across all projects and the Vault | Both |

Results are typed and grouped by kind, never a flat list. Semantic and keyword
results are labelled so the user knows why something matched.

---

## 8. State visibility

Answerable at a glance without navigation:

| Question | Desk | Pocket |
|---|---|---|
| What gate am I at? | Header | Project card |
| What is my next action? | Gate indicator | Home |
| Is anything running? | Status bar | Home badge |
| Is anything blocking me? | Status bar | Home |
| Is my work saved? | Status bar | Implicit; explicit on failure |
| What am I spending? | Status bar | Me → Usage |
| Am I online? | Status bar | Banner when not |

Six status indicators is the Desk ceiling. A seventh requires removing one.

---

## 9. Empty states

Each says what the thing is, why it is empty, and what to do.

| Empty | Message shape |
|---|---|
| No projects | "Projects are what you produce — a thesis, an essay, an article. Start with what you need to hand in." → Create |
| No sources | "Your sources are the evidence your work stands on. Upload what you have, or let us help you find some." → Upload / Discover |
| No candidates | "Nothing waiting for review. Run discovery when you want more evidence." → Discover |
| Vault skipped | "You don't have a Knowledge Vault. It's a long-term library of everything you read — optional, and you can add one any time." → Learn more / Create / Not now |
| No findings | "Nothing blocking you. Requirements are checked as you write." |
| No voice profile | "We can learn how you write, so language suggestions sound like you rather than like a textbook." → Set up / Not now |

---

## 10. Breakpoints

| Range | Serves | Layout |
|---|---|---|
| 320–413 | Pocket | Single column, bottom tabs |
| 414–599 | Pocket | Single column, comfortable |
| 600–839 | Pocket | Two-column lists |
| 840–1023 | Pocket | Master-detail |
| 1024–1279 | **Desk** | Rail collapsed, aside overlays |
| 1280–1599 | Desk | Three regions |
| 1600+ | Desk | Four regions, split primary |

**1024 px is the handover**, and it is a genuine application switch, not a media
query cascade. Both are served from one codebase and one URL space; the layout
shell differs.
