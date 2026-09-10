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
┌──────────────── BROWSER (Client-First Execution) ─────────────┐
│  Desk (≥1024px)              │  Pocket (<1024px)              │
│  regions · editor · palette  │  views · queue · reader        │
│  ── shared: design system, domain types, API client ──        │
│  IndexedDB edit buffer · service worker cache                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ CLIENT AI RESOURCE POOL (Non-Premium / User-Owned)      │  │
│  │ Local Runtimes (Ollama/LM Studio) · Free Tiers · BYOK   │  │
│  │ Isomorphic Gateway + Client Warden (Egress Control)     │  │
│  └───────────────────────────┬─────────────────────────────┘  │
└──────────────────────────────┼────────────────────────────────┘
                               │ Direct Browser Fetch (Localhost / Provider)
                               ▼
                    ┌──────────────────────────┐
                    │ Local Runtimes (Ollama)  │
                    │ Direct Cloud BYOK APIs   │
                    └──────────────────────────┘
                               │
                               │ HTTPS (Identity, Auth, Entitlements, Checkpoints)
┌──────────────────────────────▼────────────────────────────────┐
│  EDGE / APP TIER                                               │
│  SSR shell · REST+RPC API · auth · rate limiting · sessions    │
└──────────────────────────────┬────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────┐
│  SERVICE TIER                                                  │
│  ┌──────────┬──────────┬──────────┬──────────┬─────────────┐  │
│  │ Conductor│  Atlas   │  Rubric  │  Studio  │   Mesh      │  │
│  │  gates   │ catalog  │compliance│ language │  agents     │  │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ SERVER-SIDE AI RESOURCE POOL (Premium Subscribers)    │    │
│  │ Platform Credentials · Server Envelope Vault · Warden │    │
│  └───────────────────────────┬───────────────────────────┘    │
└──────┬───────────────────────┼────────────────────────────────┘
       │                       │
┌──────▼──────────┐   ┌────────▼─────────┐
│  DATA TIER      │   │  SERVER GATEWAY  │
│  Postgres       │   │  Platform AI     │
│  Object storage │   └────────┬─────────┘
│  Vector index   │            │
│  Job queue      │   ┌────────▼────────────────┐
│  Cache          │   │ PLATFORM AI PROVIDERS   │
└─────────────────┘   └─────────────────────────┘
```

Two properties constrain everything downstream:

1. **Web-first and local-first execution.** The client handles local editing, local workspace state, and client-side AI execution through the **Client AI Resource Pool** (Local runtimes and BYOK keys via Web Crypto), with minimal egress and zero unnecessary server load. The server is invoked when centralized infrastructure is genuinely needed (identity, authentication, entitlements, optional encrypted sync, and server-side platform AI for premium subscribers).
2. **Strict user privacy & minimal server knowledge.** The server does not store or observe user BYOK keys, private local AI traffic, or unrequested intermediate workspace states. Non-premium AI execution does not proxy private prompts through the server.

---

## 2. Client

### 2.1 One codebase, two applications

Desk and Pocket share the design system, domain types, API client, and business
logic. They share no layout shell, no routing tree, and no page components.

Selection is by viewport at the layout-shell level (`useDeviceClass()`), server-side on first render
and client-side on resize. A user who drags a window across the 1024 px boundary
gets a genuine application switch with state preserved.

### 2.2 Client responsibilities

| Does | Does not |
|---|---|
| Render and manage responsive Desk & Pocket layouts | Transmit user BYOK keys to the server |
| Editor interaction, TipTap authoring, and IndexedDB/localStorage buffering | Store unencrypted private research on the server without request |
| Client-side AI routing (Local Ollama/LM Studio + Free/BYOK cloud models) | Require a native desktop application shell or native OS IPC |
| Web Crypto client key vault management (`window.crypto.subtle`) | Require native desktop OS-level keychains or native installers |
| Stream consumption (SSE) and client-side agentic failover | Send private local-model text across the network |

### 2.3 The edit buffer and local persistence

Every keystroke and stage action is buffered locally in IndexedDB / localStorage immediately (`22` §5.4). This is what makes a browser tab safe for a thesis: a crash, a
refresh, or a closed lid loses at most a couple of seconds without creating unnecessary continuous database load.

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
| **Vault** | Vault existence metadata (server: `user_vaults`); private content storage, encryption, and search are **client-side** (`vaultContents.ts` / IndexedDB) |
| **Export** | Rendering, template application, packaging |

All stateless behind the API tier; state lives in the data tier. Long-running
work goes to the job queue and reports progress over SSE.

---

## 4. Data tier

| Store | Holds |
|---|---|
| **Postgres / Supabase** | Projects, drafts, sources, rules, findings, structure, accounts, history (durable project persistence required in production; unconfigured production startup fails fast) |
| **Object storage** | Source files, uploaded media, exports, snapshots |
| **Vector index** | Embeddings for corpus and Vault semantic search |
| **Job queue** | Background work: ingestion, indexing, agent runs, export |
| **Cache** | Parsed content, resolved metadata, model responses, rendered fragments |

### 4.1 Encryption


| Data | Approach |
|---|---|
| User BYOK API keys | Sealed in client Web Crypto vault (`window.crypto.subtle`), never sent to server |
| Platform AI credentials | Server envelope-encrypted (AES-256-GCM) under server-held `MASTER_KEY` |
| Draft and document content | Local-first buffered in IndexedDB; synced to PostgreSQL projects |
| Uploaded source files | Encrypted at rest in storage |
| Everything else | Encrypted at rest by default |

User BYOK keys and local AI configurations remain client-side, enforcing zero-knowledge security on the user's private credentials. `44-DATA-RESIDENCY-AND-PRIVACY.md` defines the residency and key boundaries.

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
| `humanizeSkill` | **Retired** in favor of Language & Voice Studio (`32` §13) |

The withdrawn desktop architecture would have discarded most of this. Revision 2
does not.
