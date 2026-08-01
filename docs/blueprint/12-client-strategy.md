# 12 — Client Strategy: Desktop and Web

Resolves [C-03](./11-requirements-conflicts.md#c-03--client-single-browser-app-vs-independent-desktop-and-web).

**The rule:** the two clients are independent *products* sharing one domain
core. They differ in users, workflows, navigation, and feature set. They do not
differ in what the compliance rules say.

`[INFERRED]` If desktop and web each implement gates separately they will
disagree, and a manuscript passing on one will fail on the other. Given
[09](./09-technical-debt-register.md) records five existing duplicated-concept
failures, duplicating the domain layer across clients is the most predictable
way to repeat that at larger scale.

---

## 1. What is shared, what is not

**Shared — one implementation, both clients:**
domain model (manuscript, claims, provenance ledger, evidence graph) · venue
rule packs and the gate engine · output-type catalogue · citation formatting ·
export renderers.

**Independent — designed separately per client:**
navigation and information architecture · editing surface · onboarding ·
inference execution · file handling · offline behaviour · which features are
offered at all.

`[RECOMMENDATION]` The test for whether something belongs in the shared core:
*would two different answers be a bug?* Gate outcomes — yes, shared. Panel
layout — no, independent.

---

## 2. Desktop

### Target user

`[INFERRED]` The **sustained-project writer**: PhD candidates, Master's
dissertation students, and researchers with a large corpus, a months-to-years
horizon, and confidentiality or cost constraints that make cloud inference
unattractive.

Distinguishing traits: works in long sessions on one machine; holds hundreds of
PDFs; may have unpublished data that must not leave the device; may have a GPU.

### UI philosophy

`[RECOMMENDATION]` **Instrument, not appliance.** Dense, multi-pane,
keyboard-driven. Assumes a returning expert on a large screen who wants
everything visible at once and will invest in learning shortcuts.

### Navigation

`[RECOMMENDATION]` Persistent multi-pane workspace — source library, manuscript,
provenance/evidence inspector — with panes docked, resized, and detached to a
second monitor. Navigation is *spatial*: things stay where the user put them.
No wizard flow after onboarding.

### Distinguishing capabilities

| Capability | Rationale |
|---|---|
| **Local inference** | Ollama, LM Studio, custom endpoints. `[OBSERVED]` 11 local runners already catalogued. Zero marginal cost, full confidentiality, offline. |
| **Hardware-aware model selection** | Recommends models the machine can actually run. `[OBSERVED]` `src/ai/hardware` exists but is unreachable — a candidate for adoption. |
| **Filesystem-native library** | Watch a folder; ingest as files arrive; no upload step. |
| **Bulk ingestion** | Hundreds of PDFs in one pass, using local CPU. |
| **Full offline** | Local model + local storage = no network dependency at all. |
| **Local backup control** | User-chosen backup location, addressing R-12. |

### Not offered on desktop

`[RECOMMENDATION]` Real-time co-presence. `[INFERRED]` The sustained-project
user is working alone by definition; building presence infrastructure for the
client least likely to use it inverts the priority.

---

## 3. Web

### Target user

`[INFERRED]` The **occasional and constrained writer**: undergraduates,
coursework and assignment authors, students on shared or managed machines,
anyone starting a short output under deadline, and anyone reviewing work
someone else sent them.

Distinguishing traits: cannot install software; short sessions; smaller
corpora; may be on a phone or tablet; likely a first-time user.

### UI philosophy

`[RECOMMENDATION]` **Guided and progressive.** One primary task visible at a
time. Assumes a first-time user who will not read documentation and may be on a
small screen. Every screen states what to do next.

### Navigation

`[RECOMMENDATION]` Linear, stage-based, with a persistent readiness indicator.
Navigation is *procedural*: the app tells the user where they are and what
remains. Panels open as focused overlays rather than persistent docks.

### Distinguishing capabilities

| Capability | Rationale |
|---|---|
| **Zero install** | The entire point. Managed and lab machines included. |
| **Managed inference trial** | `[RECOMMENDATION]` Capped free allowance so a first-time user reaches value before configuring a key. |
| **Guided output selection** | Beginner-first: pick what you must submit; the system infers requirements. |
| **Share-for-review links** | Async supervisor and co-author review — tier 1 of [C-05](./11-requirements-conflicts.md#c-05--collaboration-deferred-vs-required). |
| **Mobile review mode** | Read, comment, approve sources. Not authoring. |
| **Template and exemplar upload** | Lowest-friction path for requirement #6. |

### Not offered on web

`[RECOMMENDATION]` Local model execution (`[OBSERVED]` browsers cannot reach a
local runner reliably under CSP, and the codebase already carries a fix for
exactly this class of problem); bulk ingestion of hundreds of files;
filesystem watching.

---

## 4. Feature comparison

| | Desktop | Web |
|---|---|---|
| Install required | Yes | No |
| Local model inference | **Yes** | No |
| Cloud inference (BYOK) | Yes | Yes |
| Managed inference | Capped | **Capped, primary onramp** |
| Offline authoring | **Full** | Cached read; queued writes |
| Source library scale | Hundreds+ | Tens |
| Filesystem watching | **Yes** | No |
| Bulk ingest | **Yes** | Single/small batch |
| Multi-monitor panes | **Yes** | No |
| Share-for-review | Generates link | **Generates and consumes** |
| Mobile review | No | **Yes** |
| Compliance gates | Identical | Identical |
| Provenance ledger | Identical | Identical |
| Export fidelity | Identical | Identical |

`[RECOMMENDATION]` The last three rows are the contract. Any divergence there is
a defect, not a platform difference.

---

## 5. Synchronisation

`[RECOMMENDATION]` **Optional, opt-in, encrypted, and not the default.**

Default is local-only on both clients. `[INFERRED]` This preserves the two
structural advantages in [05](./05-target-blueprint.md) — zero per-user storage
cost and a privacy position no server-based competitor can match.

When enabled:

- Client encrypts before transmit; **the server stores ciphertext only** and
  can never read manuscript content (tier 2 of
  [C-07](./11-requirements-conflicts.md#c-07--local-first-vs-administrator-visibility)).
- Conflict resolution is **block-level**, which the new manuscript model makes
  possible and `Record<string, string>` does not `[OBSERVED]`.
- Sync carries the manuscript, evidence graph, and ledger. It does **not**
  carry API keys, local model outputs, or raw uploaded source files —
  `[INFERRED]` those are large, sensitive, and reproducible on the device that
  has them.
- Turning sync off leaves a fully working local install.

`[RECOMMENDATION]` Sync is not a migration of the source of truth. The device
remains authoritative; the server is a replication target.

### Asymmetry worth stating

`[INFERRED]` Desktop holds the larger corpus; web holds the smaller. A user
syncing desktop → web should expect manuscript and evidence *metadata* to
arrive, not a 4 GB PDF library. The web client must degrade legibly: show the
source record, mark the file as available on the other device, and never
present this as corruption.

---

## 6. Divergence risk

`[OBSERVED]` This repository already contains three provider abstractions, two
submission suites, two Knowledge Vault surfaces, and two hosting configurations
— every one created because nothing prevented a second implementation.

`[RECOMMENDATION]` Two clients multiply that risk. Three controls:

1. **The shared core is a hard boundary.** Client code may consume domain
   functions; it may not reimplement them.
2. **Gate parity is asserted by test.** The same manuscript and rule pack must
   produce identical gate results in both clients. A divergence fails CI.
3. **Feature differences are declared, not emergent.** The table in §4 is the
   register. A capability appearing in one client without an entry is an
   accident.

---

## 7. Deployment

`[OBSERVED]` Two hosting configurations currently exist —
`render.yaml` (Docker + Express) and `netlify.toml` (static SPA, no API proxy)
— and only one can serve the application ([09](./09-technical-debt-register.md)
TD-13).

`[RECOMMENDATION]`

- **Web** — static bundle on a CDN plus a thin stateless API for managed
  inference, outbound proxies, and encrypted-blob relay. `[INFERRED]` Correct
  shape because manuscripts never touch the server.
- **Desktop** — a shell packaging the same domain core, with local inference
  and filesystem access. Distributed as a signed installer per platform.
  Release management sits in [20](./20-admin-platform.md).
- **Institutional local deployment** — `[RECOMMENDATION]` the same artifacts,
  self-hosted, with managed inference pointed at an institution-controlled
  endpoint. `[OBSERVED]` Local runners plus browser-local storage already make
  this possible; for institutions with confidentiality constraints it is a
  differentiator rather than a side effect.
