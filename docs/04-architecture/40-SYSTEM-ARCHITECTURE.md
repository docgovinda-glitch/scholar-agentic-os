# System Architecture

> **Doc ID:** 40 · **Status:** Design · **Depends on:** `11`, `13`

The whole-system view: processes, planes, trust boundaries, and deployment.

---

## 1. Shape

Scholar OS is a **local-first desktop application with a minimal cloud plane**.
The inversion from conventional SaaS is the defining decision: the user's device
is where the system lives, and the server is a small, deliberately incapable
supporting service.

```
╔════════════════════ USER'S DEVICE ════════════════════════════════╗
║                                                                    ║
║  ┌── RENDERER PROCESS (untrusted) ──────────────────────────────┐  ║
║  │  Workbench UI · panels · editor view · plugin UI host        │  ║
║  │  No keys · no store access · no network                      │  ║
║  └────────────────────────┬─────────────────────────────────────┘  ║
║                    typed IPC (platform/ipc)                        ║
║  ┌────────────────────────▼─────────────────────────────────────┐  ║
║  │  KERNEL PROCESS (trusted)                                     │  ║
║  │  ┌────────┬────────┬────────┬───────────┬─────────────────┐  │  ║
║  │  │ store  │ index  │ events │ scheduler │ capabilities    │  │  ║
║  │  └────────┴────────┴────────┴───────────┴─────────────────┘  │  ║
║  │  ┌──────────────────────────────────────────────────────┐    │  ║
║  │  │ crypto — keys never leave this process               │    │  ║
║  │  └──────────────────────────────────────────────────────┘    │  ║
║  │  Application: conductor · atlas · rubric · mesh · vault ·    │  ║
║  │               ledger · ingestion · discovery · export        │  ║
║  └───────────┬──────────────────────────────┬──────────────────┘  ║
║              │                              │                     ║
║  ┌───────────▼──────────┐      ┌────────────▼─────────────────┐   ║
║  │ WARDEN               │      │ PLUGIN SANDBOXES (n)         │   ║
║  │ the only egress path │      │ WASM · capability-gated      │   ║
║  └───────────┬──────────┘      └──────────────────────────────┘   ║
║              │                                                     ║
║  ┌───────────▼──────────┐                                          ║
║  │ GATEWAY              │──────► local runtimes (Ollama/LM Studio) ║
║  └───────────┬──────────┘                                          ║
╚══════════════│═════════════════════════════════════════════════════╝
               │  TRUST BOUNDARY
    ┌──────────┴──────────┬─────────────────────┐
    ▼                     ▼                     ▼
┌─────────────┐   ┌──────────────┐   ┌────────────────────┐
│ AI PROVIDERS│   │ ACADEMIC APIs│   │  CLOUD PLANE       │
│ (cloud)     │   │ Crossref etc │   │  identity · relay  │
└─────────────┘   └──────────────┘   │  registry · admin  │
                                     └─────────┬──────────┘
                                               │
                                     ┌─────────▼──────────┐
                                     │ CONSOLE (web)      │
                                     └────────────────────┘
```

---

## 2. Processes

### 2.1 Renderer (untrusted)

Runs the Workbench UI. Holds no keys, no store handle, and no network capability.
Every operation goes through typed IPC to the Kernel.

**Why untrusted:** it hosts plugin UI and renders untrusted content (source PDFs,
web pages, model output). Treating it as compromised is the only safe posture.

### 2.2 Kernel (trusted)

Owns storage, keys, index, scheduling, capability enforcement, and all
application logic. Never renders untrusted content. This is where the security
model lives.

### 2.3 Plugin sandboxes

One per running plugin. WASM, no ambient authority, all I/O through a
capability-gated host API (`47`).

### 2.4 Local model runtimes

Ollama or LM Studio as separate OS processes, reached over localhost. Scholar OS
does not embed an inference engine in v1 — it integrates with runtimes users
already manage.

---

## 3. Trust boundaries

Five, each with a defined control.

| # | Boundary | Control |
|---|---|---|
| B1 | Renderer ↔ Kernel | Typed IPC; no raw handles; input validated at the Kernel |
| B2 | Kernel ↔ plugin | Capability tokens; WASM sandbox; resource limits |
| B3 | Device ↔ AI provider | Warden classification and policy; user consent per provider per class |
| B4 | Device ↔ cloud plane | E2E encryption; the Relay stores ciphertext only |
| B5 | User plane ↔ admin plane | Physical separation; no shared credentials or data path |

**B3 and B5 are the ones that make the product's promises true.** B3 is why "your
documents stay on your device" is enforceable rather than aspirational; B5 is why
"we cannot read your work" holds even against our own operators.

---

## 4. The cloud plane

Deliberately minimal. Everything here is something that *cannot* work locally.

| Service | Purpose | Sees user content |
|---|---|---|
| **Identity** | Accounts, verification, sessions, MFA | No |
| **Licensing** | Subscription state, entitlements | No |
| **Relay** | Encrypted sync storage | Ciphertext only |
| **Registry** | Model registry, venue profiles, agent versions, feature flags | No |
| **Plugin registry** | Plugin distribution and signatures | No |
| **Telemetry** | Aggregate, privacy-preserving metrics | No |
| **Admin plane** | Operator tooling | No — B5 |

### 4.1 What the cloud plane deliberately cannot do

- Decrypt user content. It holds no key (`REQ-SEC-11`).
- Run inference on user documents. Inference is device-side or provider-direct.
- Index or search user content.
- Recover a lost Vault passphrase.
- Read a project even with full database access.

This is a capability statement, not a policy statement. The distinction is the
point: policies change, capabilities require re-architecture.

### 4.2 Cost posture

The cloud plane must run at near-zero cost per free user (`NFR-COST-1`), which is
achievable precisely because it stores ciphertext blobs and account rows rather
than documents and indexes. A conventional architecture for this product would
carry per-user storage and inference costs that make a genuinely useful free tier
impossible — and a free tier that cannot complete a project would undermine
`P4` and the local-first positioning entirely.

---

## 5. Data flow: drafting a section

Traced end to end, because it exercises every boundary.

```
1.  User invokes drafting                          [renderer]
2.  IPC → Conductor                                [B1]
3.  Conductor checks gates G1,G2,G3                [kernel]
4.  Conductor schedules the pipeline               [kernel]
5.  AG-04 retrieves evidence
      → index query (local)                        [kernel]
      → embeddings: local model or Warden-gated    [B3 if cloud]
6.  AG-07 plans the section
      → Warden classifies the payload
      → policy check for the bound provider        [B3]
      → user consent if first egress of this class
      → Gateway calls the provider
7.  AG-09 drafts                                   [same path]
8.  AG-13 binds claims to evidence                 [local + model]
9.  AG-14 validates citations                      [local, deterministic]
10. AG-16 style pass                               [model]
11. Ledger commits spans as unreviewed             [kernel]
12. Store writes; events appended                  [kernel]
13. IPC → renderer renders for review              [B1]
14. Sync (if enabled): encrypt → Relay             [B4]
```

**Step 6 is the important one.** Every model call passes the Warden. There is no
path from an agent to a provider that skips it, and this is enforced
architecturally (`13` §4: no HTTP client may be constructed outside `gateway`
and `relay-client`).

---

## 6. Concurrency and resources

| Concern | Approach |
|---|---|
| Agent runs | Scheduler-managed queue; configurable concurrency; default 2 |
| Indexing | Background, low priority, yields to interaction |
| Local inference | Serialised — one model at a time; VRAM does not permit more |
| UI responsiveness | Kernel work never blocks the renderer; all IPC async |
| Resource limits | User-configurable ceilings on CPU, RAM, and disk; enforced by the scheduler |
| Backpressure | Queues bounded; work rejected with a clear reason rather than accumulating |

**The 8 GB baseline (`NFR-HW-1`) drives this.** On Amara's laptop, a local model
holding 5 GB plus an index rebuild plus an editor is a machine that stops
responding. The Resource Monitor is not a diagnostic nicety; it is how the
product stays usable on the hardware most of its users have.

---

## 7. Failure and degradation

| Failure | Behaviour |
|---|---|
| Renderer crash | Kernel survives; renderer restarts; state intact |
| Kernel crash | Renderer shows a recovery state; kernel restarts; replay from the event log |
| Plugin crash | Contained to its sandbox; plugin disabled; core unaffected |
| Local runtime unavailable | Detected; failover per policy; user informed |
| Provider unavailable | Failover chain; disclosed |
| Cloud plane unavailable | Local operation continues fully; sync queues |
| Disk full | Writes stop cleanly before corruption |
| Index corrupt | Detected by checksum; rebuilt from blobs (the index is derived) |
| Store corrupt | Recover from the last snapshot; report what was lost exactly |

**The system never loses data to a crash.** Every mutation is an event appended
before it is applied (`45` §6).

---

## 8. Deployment

### 8.1 Desktop

| Aspect | Approach |
|---|---|
| Distribution | Signed installers: Windows (MSI/MSIX), macOS (DMG, notarised), Linux (AppImage, deb, rpm, Flatpak) |
| Updates | Background download, applied on restart, user-controllable, rollback available |
| Channels | `stable`, `beta`, `nightly` |
| Migration | Automatic on launch with a snapshot taken first (`45` §8) |
| Footprint | Target under 150 MB installed, excluding models |

### 8.2 Cloud plane

| Aspect | Approach |
|---|---|
| Identity and licensing | Managed auth service with row-level security |
| Relay | Object storage for ciphertext + a metadata database |
| Registry | Static, CDN-delivered, signed manifests |
| Console | Static site plus a thin API |
| Admin | Separate deployment, separate credentials, network-isolated from the user plane (B5) |

Chosen so a two-to-four-person team can operate it (`REQ-ADM-7`): managed
services, no self-hosted databases holding sensitive data, no 24/7 on-call
surface. The Relay holding only ciphertext means a Relay incident is a
availability problem, not a confidentiality one.

### 8.3 Registry-driven updates

Model availability, venue profiles, and agent versions update **without a client
release**. The registry is signed, versioned, and cached locally; clients verify
signatures before applying. This is what keeps a fast-moving provider landscape
from forcing monthly desktop releases (`10` §6).

---

## 9. Observability

| Plane | What is collected |
|---|---|
| Local | Full diagnostic event log on the device; user-viewable and exportable |
| Cloud | Aggregate counts only: feature usage, error classes, performance percentiles |
| **Never** | Document content, titles, prompts, model outputs, source metadata, per-user paths |

Support flows work from a **user-exported, user-reviewed** diagnostic bundle
which redacts content by default and shows the user exactly what it contains
before they send it. There is no path by which support reads a user's project
(`REQ-ADM-3`).

---

## 10. Technology direction

Binding decisions are `OQ-02`. Direction and its reasoning:

| Layer | Direction | Why |
|---|---|---|
| Desktop shell | Tauri | Memory footprint against the 8 GB baseline; Electron's overhead is material when a local model wants 5 GB |
| Kernel | Rust or TypeScript on a Node runtime | Rust for memory safety in the trusted process and better resource behaviour; TypeScript for shared domain logic with the surfaces. `OQ-02` |
| Domain logic | TypeScript | Shared between Kernel and Console; the citation and document logic already exists in it |
| Store | Embedded transactional KV plus content-addressed blobs | No server dependency; snapshot support |
| Index | Embedded full-text plus a local vector store | Offline semantic search is a hard requirement |
| Editor | Custom document model over a proven text engine | Span-level provenance rules out off-the-shelf rich-text editors |
| Plugin sandbox | WASM with a capability-gated host API | Language-agnostic, genuinely sandboxed |
| Console | Server-rendered framework with route splitting | The performance budget in `23` §8 |
| Cloud | Managed auth + object storage + edge functions | Operable by a small team |

### 10.1 The highest-risk choice

The editor (`53` `RISK-01`). Span-level provenance that survives arbitrary
editing is not available off the shelf, cannot be retrofitted, and is the
foundation of the product's differentiation. It is scheduled first in
`51-IMPLEMENTATION-PHASES.md` for exactly that reason.

---

## 11. Migration from the current architecture

| Today | Target |
|---|---|
| React SPA + Express server; server proxies AI | Desktop app with a local kernel; no server in the inference path |
| Server holds keys and user records | Keys in the platform keystore; identity is the only server-side user data |
| Server-side document parsing | Local parsing (`REQ-LOC-1`) |
| Supabase as application database | Supabase for identity and licensing only; content is local |
| Render web service as the product | Cloud plane shrinks to identity, Relay, registry, and Console |
| Gemini-centric with key failover | Provider-agnostic Gateway with local-first defaults |
| No egress control | Warden as the mandatory chokepoint |
| No sandbox | WASM plugin sandbox |

The web app does not disappear — it becomes the Console (`23`), with a
deliberately reduced scope. That reduction is what makes the desktop-primary
architecture coherent rather than a second frontend to maintain at parity.
