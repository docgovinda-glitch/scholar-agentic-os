# System Architecture

> **Doc ID:** 40 · **Status:** Design · **Revision:** 2 (website-only)

The whole-system view for a web application: services, trust boundaries, and
deployment.

---

## 1. Shape

Scholar OS is a **server-rendered web application with a rich client editor, a
service tier that does the work, and a strict egress boundary in front of model
providers.**

```
┌──────────────── BROWSER ──────────────────────────────────────┐
│  Desk (≥1024px)              │  Pocket (<1024px)              │
│  regions · editor · palette  │  views · queue · reader        │
│  ── shared: design system, domain types, API client ──        │
│  IndexedDB edit buffer · service worker cache                 │
└───────────────────────────┬───────────────────────────────────┘
                            │  HTTPS · SSE for streams
┌───────────────────────────▼───────────────────────────────────┐
│  EDGE / APP TIER                                               │
│  SSR shell · REST+RPC API · auth · rate limiting · sessions    │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│  SERVICE TIER                                                  │
│  ┌──────────┬──────────┬──────────┬──────────┬─────────────┐  │
│  │ Conductor│  Atlas   │  Rubric  │  Studio  │   Mesh      │  │
│  │  gates   │ catalog  │compliance│ language │  agents     │  │
│  └──────────┴──────────┴──────────┴──────────┴─────────────┘  │
│  ┌──────────┬──────────┬──────────┬──────────────────────┐    │
│  │Ingestion │Discovery │  Export  │       Vault          │    │
│  └──────────┴──────────┴──────────┴──────────────────────┘    │
└──────┬───────────────────────────────────┬────────────────────┘
       │                                   │
┌──────▼──────────┐               ┌────────▼─────────┐
│  DATA TIER      │               │  WARDEN          │
│  Postgres       │               │  classify·policy │
│  Object storage │               │  ↓ only path out │
│  Vector index   │               └────────┬─────────┘
│  Job queue      │                        │
│  Cache          │               ┌────────▼─────────┐
└─────────────────┘               │  GATEWAY         │
                                  └────────┬─────────┘
                                           │
                              ┌────────────▼────────────┐
                              │  AI PROVIDERS · ACADEMIC │
                              │  APIs                    │
                              └──────────────────────────┘
```

Two properties constrain everything downstream:

1. **The browser holds no secrets and does no heavy work.** Parsing, indexing,
   embedding, agent execution, compliance evaluation, and export all run
   server-side. The client is an editor and a view layer.
2. **The Warden is the only egress path to model providers.** No service calls a
   provider directly. This is what makes privacy policy enforceable rather than
   aspirational, and it is enforced architecturally (`13` §4).

---

## 2. Client

### 2.1 One codebase, two applications

Desk and Pocket share the design system, domain types, API client, and business
logic. They share no layout shell, no routing tree, and no page components.

Selection is by viewport at the layout-shell level, server-side on first render
and client-side on resize. A user who drags a window across the 1024 px boundary
gets a genuine application switch with state preserved.

### 2.2 Client responsibilities

| Does | Does not |
|---|---|
| Render, and manage layout | Hold API keys |
| Editor interaction and local buffering | Parse documents |
| Optimistic updates | Run agents |
| Cache for offline reading | Evaluate compliance |
| Stream consumption (SSE) | Call model providers |

### 2.3 The edit buffer

Every keystroke goes to IndexedDB immediately; the server is flushed on a debounce
(`22` §5.4). This is what makes a browser tab safe for a thesis: a crash, a
refresh, or a closed lid loses at most a couple of seconds.

---

## 3. Service tier

| Service | Owns |
|---|---|
| **Conductor** | Gate state, sign-off, agent run scheduling, workflow variants |
| **Atlas** | Output type catalog, intake schemas, proposal generation |
| **Rubric** | Requirement ingestion, rule compilation, continuous evaluation |
| **Studio** | Language & Voice: levels, voice profiles, diffs (`32`) |
| **Mesh** | Agent registry, execution, capability enforcement, versioning |
| **Ingestion** | Parsing to CDM, OCR, transcription, metadata extraction |
| **Discovery** | Academic source adapters, ranking, candidate queue |
| **Vault** | Corpus storage, indexing, retrieval |
| **Export** | Rendering, template application, packaging |

All stateless behind the API tier; state lives in the data tier. Long-running
work goes to the job queue and reports progress over SSE.

---

## 4. Data tier

| Store | Holds |
|---|---|
| **Postgres** | Projects, drafts, sources, rules, findings, structure, accounts, history |
| **Object storage** | Source files, uploaded media, exports, snapshots |
| **Vector index** | Embeddings for corpus and Vault semantic search |
| **Job queue** | Background work: ingestion, indexing, agent runs, export |
| **Cache** | Parsed content, resolved metadata, model responses, rendered fragments |

### 4.1 Encryption

| Data | Approach |
|---|---|
| Draft and document content | Encrypted at rest, per-project CEK |
| Uploaded source files | Encrypted at rest in object storage |
| User API keys | Encrypted with a key held in a managed KMS, never logged, never returned to the client |
| Everything else | Encrypted at rest by default |

Revision 1's client-held-key model is withdrawn: it is incompatible with
server-side processing. `44-DATA-RESIDENCY-AND-PRIVACY.md` states plainly what
this means and what we do instead.

---

## 5. Trust boundaries

| # | Boundary | Control |
|---|---|---|
| B1 | Browser ↔ API | Session auth, CSRF protection, input validation, rate limiting. The client is untrusted |
| B2 | API ↔ services | Internal auth; services never exposed publicly |
| B3 | Services ↔ providers | **Warden** classification and policy; per-user egress consent |
| B4 | Services ↔ plugins | Sandbox and capability tokens |
| B5 | User plane ↔ admin plane | Separate deployment, separate credentials, no data path |

B3 and B5 carry the product's privacy promises and are verified by build-time
architectural tests (`52` §6).

---

## 6. Data flow: refining a passage

Traced because it exercises the new primary feature end to end.

```
1.  User selects text, presses ⌘I, picks level 3      [browser]
2.  POST /projects/:id/refine {span, level}           [B1]
3.  API validates, authorises, rate-limits
4.  Studio: analyse — structure, register, L1 patterns [service]
5.  Studio: plan — load Voice Profile, set constraints
6.  Warden: classify payload → user_content
      → policy check for the bound provider           [B3]
      → consent check if first egress of this class
7.  Gateway → provider → candidate text
8.  AG-20: meaning verification; split content edits   [service]
9.  Studio: voice check against profile; revise outliers
10. Studio: build per-change diff with reasons
11. SSE stream → client renders diff progressively     [B1]
12. User accepts or rejects each change                [browser]
13. Accepted changes → draft; Writing History if enabled
```

**Step 6 has no bypass.** Every model call in the system passes it.

---

## 7. Concurrency and background work

| Concern | Approach |
|---|---|
| Agent runs | Job queue, per-user concurrency limits, cancellable |
| Ingestion | Queued, chunked, progress over SSE |
| Indexing | Background, low priority |
| Compliance | Deterministic rules synchronous (< 300 ms); model-assisted queued |
| Studio | Levels 1–2 synchronous; 3–5 streamed |
| Fairness | Per-user quotas prevent one large project starving others |
| Backpressure | Queues bounded; work rejected with a clear reason rather than accumulating |

---

## 8. Failure and degradation

| Failure | Behaviour |
|---|---|
| Provider unavailable | Failover per policy; substitution disclosed |
| All providers unavailable | Deterministic features continue; model features queue with an explanation |
| Service unavailable | Editor stays usable against the local buffer; affected features labelled |
| Job queue backed up | Position and estimate shown; work is not silently dropped |
| Database unavailable | Read-only from cache where possible; writes buffered client-side |
| Browser offline | Editing continues locally; queued and flushed on reconnect |
| Tab crash | Recovery from IndexedDB with the user told what was recovered |
| Concurrent edit from two tabs | Detected and surfaced for resolution; nothing silently discarded |

---

## 9. Deployment

| Component | Approach |
|---|---|
| Edge / app tier | Managed platform, autoscaled, multi-region for latency |
| Services | Containerised, horizontally scalable |
| Postgres | Managed, with point-in-time recovery |
| Object storage | Managed, versioned, lifecycle-managed |
| Vector index | Managed or Postgres-native, depending on scale (`OQ-03`) |
| Job queue | Managed |
| Admin plane | **Separate deployment, separate network, separate credentials** (B5) |

Chosen so two to four people can operate it: managed services throughout, no
self-hosted databases, no 24/7 on-call surface.

### 9.1 Cost posture

Server-side compute is now the main cost line — the significant change from
revision 1, which pushed compute onto user devices. Controls:

| Control | Mechanism |
|---|---|
| Deterministic-first | ~80% of compliance rules and Studio levels 1–2 need no model |
| Caching | Parsed content, resolved metadata, and repeated model calls |
| Budgets | Per user, project, and tier (`41` §7) |
| Bring-your-own-key | Users on their own keys cost us nothing for inference |
| Tiering | Free tier capped on model-backed operations, not on the product |

---

## 10. Observability

| Collected | Not collected |
|---|---|
| Request rates, latencies, error classes | Document content |
| Job queue depth and duration | Prompts or model outputs |
| Agent run counts and outcomes | Source metadata |
| Aggregate feature usage | Per-user behavioural paths |
| Client performance percentiles | Anything identifying a user's work |

Support works from user-reported context and reproduction against golden sets,
never by reading a user's project (`49` §7).

---

## 11. Technology direction

| Layer | Direction |
|---|---|
| Client | React 19, server-rendered shell, route-level code splitting |
| Editor | Custom document model over a proven text engine |
| API | Typed RPC over HTTP with generated clients; SSE for streams |
| Services | TypeScript, sharing `domain/*` with the client |
| Database | Postgres |
| Vector | pgvector initially; dedicated store if scale requires (`OQ-03`) |
| Queue | Managed queue with a typed job contract |
| Object storage | S3-compatible |

### 11.1 What this reuses from the current repository

Revision 2 makes the existing codebase an asset rather than a migration target:

| Existing | Status |
|---|---|
| React 19 + Vite + Tailwind client | **Carries forward** |
| Express server | Carries forward, restructured into the API and service tiers |
| Supabase auth and Postgres | **Carries forward** |
| Citation formatters | Carries forward into `domain/reference` |
| Document parsing pipeline | Carries forward into Ingestion |
| Agent and skill registries | Carry forward into Mesh |
| Provider failover with classified errors | Carries forward into Gateway |
| Export via `docx` | Carries forward into Export |
| `humanizeSkill` | **Carries forward and expands** into Studio (`32` §13) |

The withdrawn desktop architecture would have discarded most of this. Revision 2
does not.
