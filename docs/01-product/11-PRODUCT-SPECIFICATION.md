# Product Specification — Scholar OS

> **Doc ID:** 11 · **Status:** Design · **Depends on:** `01`, `02`, `10`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

This document describes how Scholar OS behaves as a whole system: its surfaces,
its object lifecycle, its state machines, and the rules that hold across every
feature. Where `10-PRD.md` says *what must be true*, this says *how the system
acts*.

---

## 1. System at a glance

```
┌────────────────────────── USER'S DEVICE (BROWSER / PWA) ──────────────────────────┐
│                                                                                   │
│  ┌───────────────────────── CLIENT WEB APPLICATION ───────────────────────────┐  │
│  │  Desk (≥1024px responsive workbench)  │  Pocket (<1024px / touch companion) │  │
│  │  Rich TipTap editor · Workspace state · Client AI router · Local Web Crypto │  │
│  └──────────────────────────────────────┬──────────────────────────────────────┘  │
│                                         │                                         │
│  ┌──────────────────────────────────────▼──────────────────────────────────────┐  │
│  │                    CLIENT-SIDE STORAGE & LOCAL RUNTIMES                     │  │
│  │  IndexedDB / LocalStorage · Web Crypto Key Vault · Loopback to Local AI     │  │
│  │  (Ollama, LM Studio on localhost — zero user data leaves the machine)       │  │
│  └──────────────────────────────────────┬──────────────────────────────────────┘  │
└─────────────────────────────────────────┼─────────────────────────────────────────┘
                                          │ HTTPS / SSE (Only when necessary)
                               ┌──────────▼──────────┐
                               │     SERVER TIER     │
                               │ Identity & Auth     │
                               │ Entitlements & Sync │
                               │ Admin AI Platform   │
                               └─────────────────────┘
```

Two properties are worth stating explicitly because they constrain everything
downstream:

1. **Web-first and local-first.** The application is delivered via standard web technologies (Web/PWA). Working research state, client-side AI operations (Local runtimes and BYOK keys), and private research data execute on the user's device. The server provides only the centralized infrastructure genuinely needed (authentication, synchronization, entitlements, and platform-managed AI).
2. **Minimal server footprint & knowledge.** The server does not store or process private research prompts, responses, or intermediate state unless explicitly requested by cloud features. The client's egress to model providers is strictly user-controlled.

---

## 2. Surfaces and their contract

| | **Desk** (≥1024 px) | **Pocket** (<1024 px) |
|---|---|---|
| Role | Working environment | Companion |
| Session length | Hours | Minutes |
| Offline | Edit cached documents | Read cached |
| Layout | Four regions | One view at a time |
| Editing | Full authoring | Text edits and comments |
| Studio | Invoke and review | Review a diff |
| Plugins | Yes | No |
| Agent runs | All | View and interrupt only |

Both are served from one codebase and one URL space; the layout shell differs
(`20` §10).

**The rule that keeps these honest:** a capability appears on a surface only if
that surface can *do it well*. The Pocket does not get a degraded panel layout;
it gets a different design for a different job. Section 6 of
`20-INFORMATION-ARCHITECTURE.md` holds the normative capability matrix.

### 2.1 Cross-surface behaviour

- **Handoff.** A user reviewing a draft on Pocket can send it to the
  Desk; the Desk opens the same section at the same scroll position.
- **Divergence.** When a capability is unavailable on the current surface, the UI
  states why and offers the handoff — never a disabled control with no
  explanation.
- **Sync dependency.** The Pocket shows only what sync has been enabled for. A
  local-only user sees an honest empty state explaining that their work is on
  their device by choice, with a link to enable sync.

---

## 3. Object model and lifecycle

### 3.1 Object hierarchy

```
Account
 └── Workspace                       (settings, provider config, Vault binding)
      ├── Vault                      (optional, shared across projects)
      └── Project                    (one per primary output)
           ├── OutputType binding    (from Atlas)
           ├── Intake responses
           ├── Rubric                (compiled rules + waivers)
           ├── Corpus
           │    ├── Uploaded sources
           │    ├── Vault-imported sources
           │    └── Approved external sources
           ├── Candidate queue       (pending approval; not corpus)
           ├── Structure             (outline: sections, budgets, order)
           ├── Draft                 (per-section content + Ledger spans)
           ├── Claim–Evidence graph
           ├── Ledger                (provenance + decisions)
           ├── Snapshots             (version history)
           └── Artifacts             (exports, reports, packages)
```

### 3.2 Project lifecycle states

| State | Meaning | Entered by | Exits to |
|---|---|---|---|
| `draft_setup` | Created, intake incomplete | Project creation | `active` |
| `active` | In normal progress through gates | `G0` sign-off | `blocked`, `paused`, `complete` |
| `blocked` | A gate cannot advance; reason recorded | Gate failure | `active` |
| `paused` | User-declared inactivity | User action | `active`, `archived` |
| `complete` | `G7` reached, exported | Export success | `archived`, `reopened` |
| `reopened` | Post-submission work (reviewer response) | User action | `active` |
| `archived` | Read-only, compressed, retained | User action or policy | `active` (restore) |

Projects are never auto-deleted. Archival compresses and de-indexes but preserves
everything.

---

## 4. The gate model in product terms

The workflow is eight gates. The Conductor owns them. A gate cannot be skipped,
but every gate can be satisfied *quickly* by an expert who accepts defaults —
the friction scales with the user's uncertainty, not with the gate count.

| Gate | Question it answers | Human decision required | Typical duration |
|---|---|---|---|
| `G0` Intake | What am I producing, for whom, by when? | Confirm output type and intake answers | 3–10 min |
| `G1` Requirements | What rules govern this document? | Approve the compiled Rubric | 5–20 min |
| `G2` Sources | What evidence am I allowed to use? | Approve or reject each candidate | Ongoing |
| `G3` Structure | What shape does the document take? | Approve the outline and budgets | 5–15 min |
| `G4` Draft | Does the text exist? | Review each section as drafted | Hours–weeks |
| `G5` Review | Is it good? | Address findings; accept or reject edits | Hours–days |
| `G6` Compliance | Does it satisfy the rules? | Review compliance recommendations and guidelines (advisory) | 15–60 min |
| `G7` Export | Is it technically ready to leave? | Technical pre-flight passes; choose format | 2–5 min |

Full entry/exit criteria in `30-ACADEMIC-WORKFLOW-ARCHITECTURE.md` §3.

### 4.1 Why gates are not skippable

Every gate prevents a specific, observed failure:

| Gate | Prevents |
|---|---|
| `G0` | Producing the wrong artefact entirely |
| `G1` | Discovering the format is wrong at submission |
| `G2` | Fabricated and unverified citations |
| `G3` | Structural incoherence that is expensive to fix after drafting |
| `G4` | Text nobody has read |
| `G5` | Submitting a first draft |
| `G6` | Desk rejection on formatting |
| `G7` | Exporting unreviewed AI content |

### 4.2 The expert path

`G0`–`G3` can be completed in under five minutes total by a user who accepts
proposals. The system MUST NOT require re-entry of information it can infer, and
MUST allow a "review and accept all" action at each gate — with the sign-off
still recorded. Speed comes from good defaults, not from removing the decision.

---

## 5. Feature areas

### 5.1 Onboarding

Nine stages, specified in `25-ONBOARDING-ARCHITECTURE.md`. Product-level rules:

- Local-only use requires no account. Account creation is required only for sync,
  Pocket access, and licensing.
- The AI Setup Wizard is the highest-leverage screen in the product: it is where
  privacy posture is set. It leads with local models.
- Every stage after login is skippable; skipping is recorded so the system can
  offer it again contextually rather than nagging.

### 5.2 Project creation — output-driven

The first question is *"What do you want to produce?"* Answering it selects an
Output Type from Atlas, which determines the intake schema, the default
structure, the workflow variant, the quality gates, and the starting Rubric.

**There is no "blank document" primary path.** An escape hatch exists — "I just
need a document" maps to a generic OT with a minimal schema — but it is not
offered first, and it is not the default.

### 5.3 Intelligent intake

Atlas renders a form specific to the chosen output type. Fields are marked
Required, Recommended, or Optional. Each carries: what it is, why it matters, an
example, and a proposed default with rationale.

The form covers structure, word budget, heading hierarchy, abstract, keywords,
references, bibliography and citation style, appendices, tables, figures, table
of contents, file format, and institution-specific requirements
(`REQ-OUT-6`).

**The teaching obligation.** For P1 (Amara), the form is the first place she
learns what a research question is. Guidance is written for someone who has never
seen the term, without being condescending to P4 (Marcus), who collapses it all.

### 5.4 Sources

Two inflows, one gate.

```
User uploads ──────────┐
                       ├──► Candidate Queue ──human decision──► Approved Corpus
Discovery (optional) ──┘                                              │
                                                                      ▼
                                                          the only citable set
```

User uploads pass through a lighter check (the user already vouches for them) but
still enter the corpus explicitly. Discovered material always enters the queue
with full authenticity evidence.

**The hard rule:** citation identities are minted only from Approved Corpus
entries. There is no code path by which a draft can reference a source the user
has not approved. This is what makes `REQ-SRC-8` a structural guarantee rather
than a policy.

### 5.5 Compliance

Requirement sources are compiled into typed rules, reviewed by the human, and
evaluated continuously against the draft. Findings appear inline in the editor
and aggregated in the Compliance panel. See `31`.

### 5.6 Drafting

Section-scoped, agent-assisted, human-reviewed. The pipeline is specified in
`30` §6. Product-level rules:

- Drafting is invoked per section, never for the whole document at once.
- Generated text arrives as a pending proposal and is not part of the accepted
  draft until the user accepts it.
- Claims bind to evidence at generation time or are flagged.
- The user can interrupt any run.

### 5.7 Editing

A professional editor with the full complement in `REQ-EDT-1`. The distinguishing
properties are provenance-aware tracked changes and citation insertion restricted
to the Approved Corpus. Specified in `22-DESKTOP-WEB-UX-SPECIFICATION.md` §5.

### 5.8 Refinement and authorship

The final stage before compliance. Language refinement improves human-authored
text with recorded deltas. Authorship reporting and optional AI disclosure are
generated from the Ledger. Specified in `32`.

### 5.9 Export

DOCX and ODT are first-class targets rendered from the CDM. PDF, Markdown,
LaTeX, HTML, and EPUB are derived. Pre-flight blocks on unresolved blocking
findings and unreviewed AI spans. Specified in `33`.

---

## 6. Cross-cutting behaviours

### 6.1 The AI presence rule

AI assistance appears in exactly four forms. No others may be introduced without
amending this section.

| Form | Where | Invocation | Output lands as |
|---|---|---|---|
| **Chat** | Side panel | User types | Nothing, until the user inserts it |
| **Inline suggestion** | Editor | User requests, or contextual offer | Pending decoration; accept required |
| **Agent run** | Workflow | User triggers or Conductor schedules with consent | Reviewable output at a gate |
| **Background analysis** | Everywhere | Automatic | Findings and annotations only; never text |

**Background analysis MUST NOT write text into the draft.** It may annotate,
flag, and suggest. This single rule prevents the class of failure where a user
does not know where a sentence came from.

### 6.2 Error and degradation behaviour

| Condition | Behaviour |
|---|---|
| Provider unavailable | Failover per policy; substitution disclosed in the run record |
| All providers unavailable | Offer local model; if none, queue the run and say so |
| Offline | Local features full; network features queued with visible state |
| Local model too large for device | Blocked at selection with the specific reason, before download |
| Sync conflict | Both versions preserved; human resolves; nothing discarded |
| Corrupt project state | Recover from last snapshot; report what was lost |
| Plugin crash | Contained; plugin disabled; core unaffected |
| Disk full | Writes stop cleanly before corruption; user warned with space required |

### 6.3 Consent surfaces

Six moments require explicit consent. Each is a recorded decision, not a
preference toggle.

1. First outbound call to any provider (per provider, per Egress Class).
2. Enabling sync (with a plain statement of what leaves the device).
3. Approving a source into the corpus.
4. Advancing any gate.
5. Overriding an export block.
6. Enabling any opt-in improvement or telemetry feature.

### 6.4 Notification model

| Channel | Used for | Surfaces |
|---|---|---|
| In-app inline | Findings, suggestions, validation | All |
| Status bar | Authorship ratio, active runs, sync state, budget | Desk |
| Notification centre | Completed runs, gate readiness, announcements | All |
| Push / email | Long-run completion, security events, admin announcements | Pocket, Mobile |

Push notifications are opt-in per category. Security events are the only category
that cannot be disabled entirely.

---

## 7. Licensing and tiers

Tier definitions inform architecture; final pricing is `OQ-01`.

| | **Free** | **Scholar** | **Lab** | **Institution** |
|---|---|---|---|---|
| Desk | Full | Full | Full | Full |
| Local models | Unlimited | Unlimited | Unlimited | Unlimited |
| Bring-your-own key | Yes | Yes | Yes | Yes |
| Projects | 3 active | Unlimited | Unlimited | Unlimited |
| Vault | 200 docs | Unlimited | Unlimited | Unlimited |
| Pocket + sync | — | Yes | Yes | Yes |
| Managed model credits | — | Monthly allowance | Larger allowance | Pooled |
| Plugins | Community | Community + verified | + private | + private registry |
| Shared workspaces | — | — | Yes | Yes |
| Admin console | — | — | — | Yes |
| Compliance reporting | Basic | Full | Full | Full + institutional export |
| Support | Community | Email | Email | SLA |

**Invariants that no tier may violate:**

- The free tier MUST be able to complete an entire project end to end using local
  models. Free is not a trial.
- Export of the user's own content MUST NOT be gated by tier. Ever.
- Downgrading MUST NOT destroy data; it restricts new creation, never access.
- Bring-your-own-key MUST work on every tier including free.

---

## 8. Data ownership and portability

| Guarantee | Mechanism |
|---|---|
| The user owns their content | Local storage under the user's control; keys held by the user |
| The user can leave | Full export of every project and the Vault in open formats |
| The product's death is survivable | Exported formats readable without Scholar OS; documented schemas in `45` |
| The operator cannot read content | E2E encryption; no operator-held key (`REQ-SEC-11`) |
| Deletion is real | Content, indexes, embeddings, caches, and sync copies (`REQ-SEC-6`) |

---

## 9. Behavioural rules that resolve conflicts

When two features imply different behaviour, these resolve it. Ordered.

1. **Never silently alter the user's text.** Any change requires an accept action.
2. **Never cite what the user has not approved.** No exception, no override.
3. **Never transmit user content the Warden has not cleared.** No exception.
4. **Never lose data to resolve a conflict.** Preserve both; ask.
5. **Never claim certainty the system does not have.** Confidence is displayed.
6. **Never block the user without an actionable path.** Every block states what
   would unblock it.
7. **Never make the private choice the harder choice.** Privacy is the default
   path, not the advanced one.
8. **Prefer the honest slow answer to the fast wrong one.**

---

## 10. What the product does not do, in user-visible terms

Stated here so it can be quoted directly into UI copy and support answers.

- It will not write your paper for you. It will help you write it.
- It will not cite a source you have not seen and approved.
- It will not make AI text look human. It records what AI wrote; that record is
  the point.
- It will not upload your documents unless you turn on sync.
- It will not let us read your work, even if you ask us to for support.
- It will not recover your files if your laptop dies and you never made a backup.
  We will remind you to make backups. We cannot do more than remind you.
