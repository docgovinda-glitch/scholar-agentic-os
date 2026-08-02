# Data Architecture

> **Doc ID:** 45 · **Status:** Design · **Depends on:** `40`, `44`, `32`

Entities, schemas, the event log, migration, and retention.

---

## 1. Principles

| # | Principle |
|---|---|
| D1 | **Events are the source of truth.** State is a projection of the event log |
| D2 | **Derived data is disposable.** Indexes, embeddings, and caches rebuild from blobs |
| D3 | **Content is addressed by hash.** Immutable, deduplicated, verifiable |
| D4 | **The Ledger is append-only.** Never edited; corrections are new entries |
| D5 | **Schemas are versioned.** A five-year project outlives many releases |
| D6 | **Everything is exportable.** In documented open formats (`P9`) |
| D7 | **Deletion is real.** Content, derivatives, and sync copies (`REQ-SEC-6`) |

---

## 2. Entity model

```
Account ─┬─ Device *
         └─ Workspace *
              ├── Settings
              ├── Vault ?
              │    ├── VaultDocument *
              │    │    ├── Blob (content-addressed)
              │    │    ├── CDM
              │    │    ├── Annotation *
              │    │    └── Embedding *
              │    ├── Collection *
              │    └── Relationship *
              ├── Plugin *
              └── Project *
                   ├── Brief            output type + intake
                   ├── Rubric ── Rule * ── Finding *
                   │    └── RequirementSource *
                   ├── Corpus ── Source * ── EvidenceSpan *
                   ├── CandidateQueue ── Candidate *
                   ├── Structure ── Section *
                   ├── Draft ── Block * ── Span *
                   ├── ClaimGraph ── Claim * ── Binding *
                   ├── Ledger ── LedgerEntry *          (append-only)
                   ├── Comment *
                   ├── Snapshot *
                   ├── Run *
                   └── Artifact *
```

---

## 3. Core schemas

Illustrative shapes; field semantics are normative.

### 3.1 Project

```yaml
id: prj_8f3a
workspace: ws_221
schema_version: 4
output_type: { id: OT-07, version: 2 }
status: active
created: ts
updated: ts
brief:
  title, topic, level, discipline, deadline, institution
  language: en-GB
  intake: { ...output-type-specific responses }
gates:
  G0: { status: signed_off, at: ts, state_hash: sha256 }
  G1: { status: signed_off, ... }
  G2: { status: continuous, approved: 34, pending: 8 }
  ...
settings:
  citation_style: harvard
  model_bindings: { ...overrides }
  privacy: { restricted: false }
```

### 3.2 Source

```yaml
id: src_9921
project: prj_8f3a
state: approved            # candidate | approved | rejected | revoked
origin: discovered         # uploaded | discovered | vault
reference: { canonical reference — see domain/reference }
identifiers: { doi, pmid, arxiv, isbn }
verification:
  identifier_resolved: true
  publisher_verified: true
  retraction_status: none | retracted | unknown
  retraction_checked_at: ts
  predatory_signal: none | flagged | unknown
blob: sha256:…             # if full text held
cdm: ref
decision:
  by: user
  at: ts
  evidence_shown: { snapshot of what was displayed at decision time }
```

`decision.evidence_shown` is deliberate: it records what the user actually saw
when they approved, so a later retraction does not retroactively make their
decision look careless.

### 3.3 Span — the Ledger's unit

```yaml
id: sp_7f3a9
block: blk_221
range: [offset, length]     # within the block, not the document
origin: ai_suggested_accepted
lineage: [ { origin, at, actor?, run? }, … ]
production: { agent, agent_version, model, provider, run, prompt_hash }
evidence_bindings: [ev_221, ev_398]
review: { reviewed, at, interaction, duration_ms }
content_hash: sha256:…
```

Anchoring to a block-relative offset rather than a document-global one is what
makes provenance survive editing (`32` §4.1).

### 3.4 Ledger entry

```yaml
seq: 88213                  # monotonic
project: prj_8f3a
at: ts
kind: span_created | span_reviewed | span_edited | gate_signoff |
      source_decision | waiver | export | override | egress_consent |
      disclosure_generated
payload: { kind-specific }
prev_hash: sha256:…         # hash chain
hash: sha256:…
```

### 3.5 Rule and finding

```yaml
# Rule — see 31 §3
id, source: {document, locator, quote, extracted_at, confidence},
type, scope, severity, evaluator: {kind, params},
message, remedy, user_modified, waived

# Finding
rule, status, location: {section, span}, actual, expected,
message, remedy, evaluated_at
```

---

## 4. Storage

| Store | Technology direction | Holds |
|---|---|---|
| Object store | Embedded transactional KV | Entities, encrypted |
| Blob store | Content-addressed files | Sources, media, models, encrypted |
| Event log | Append-only file with an index | All state transitions |
| Ledger | Append-only, hash-chained | Provenance and decisions |
| Full-text index | Embedded inverted index | Derived |
| Vector index | Embedded ANN | Derived |
| Cache | Files with TTL | Derived, disposable |
| Keystore | OS platform keystore | Master key material only |

### 4.1 Content addressing

Blobs are stored under `sha256(content)`. Consequences: automatic deduplication
(the same PDF in three projects is stored once), integrity verification for free,
and safe concurrent writes (identical content produces identical paths).

### 4.2 Encryption

Every blob and object is encrypted with a per-object CEK, wrapped by the Master
Key (`46` §5). Indexes are encrypted at rest and decrypted into memory during
search (`43` §9.1).

---

## 5. Transactions

| Property | Guarantee |
|---|---|
| Atomicity | Multi-entity mutations commit or roll back together |
| Durability | Event appended and fsynced before state is applied |
| Isolation | Single-writer per project; readers are never blocked |
| Consistency | Invariants checked at commit; violation aborts |

### 5.1 Invariants enforced at commit

| Invariant |
|---|
| Every citation references an `approved` source |
| Every span belongs to an existing block |
| Every claim binding references a real Evidence Span |
| Gate sign-off `state_hash` matches the state at sign-off time |
| Ledger `prev_hash` matches the previous entry's `hash` |
| No span has an origin outside the closed set |

The first is the database-level expression of `REQ-SRC-8`. Even a bug elsewhere
cannot commit a citation to an unapproved source.

---

## 6. The event log

### 6.1 Why event-sourced

| Benefit | Consequence |
|---|---|
| Crash recovery | Replay to the last consistent state; nothing lost (`NFR-REL-1`) |
| Undo | Structural, including Ledger state |
| Audit | The Ledger is a projection of it |
| Sync | Events are the natural unit |
| Debugging | Full history of how state was reached |

### 6.2 Shape

```yaml
seq: 44821
at: ts
actor: user | agent:AG-12 | system
kind: draft.span.inserted
payload: { … }
```

### 6.3 Compaction

The log grows without bound. Compaction: snapshot state, discard events older
than the snapshot beyond a retention window, keep **all** Ledger entries
regardless (they are the integrity record and are small).

---

## 7. Snapshots and retention

### 7.1 Snapshot triggers

| Trigger | Retention |
|---|---|
| Gate transition | Permanent (`NFR-REL-2`) |
| Before an app version migration | Permanent |
| Before restoring a snapshot | Permanent |
| Manual (⌘S) | Permanent |
| Before a bulk operation | 30 days |
| Automatic hourly during active editing | 7 days |
| Daily | 90 days |

### 7.2 Properties

Incremental (content-addressed blobs are shared), fast (< 2 s for a typical
project), previewable before restore, and restorable in full or per-section.

---

## 8. Schema migration

A doctoral project may span four years and dozens of releases (`10` §2, P3).
Migration is a first-class concern, not a maintenance chore.

### 8.1 Rules

| Rule | Statement |
|---|---|
| Every schema is versioned | Per entity type |
| Migrations are forward-only | With a snapshot taken first |
| A snapshot precedes every migration | Automatic, permanent, restorable |
| Migrations are tested against real fixtures | Every prior version, in CI |
| Failure rolls back | Cleanly, to the pre-migration snapshot |
| Users are told | What changed, before it happens |
| Downgrade is refused, not attempted | A newer schema opened by an older client fails safe with a clear message |

### 8.2 Output type versioning

An in-flight project keeps the output type version it started with
(`14` §11.1). Upgrading is a user action with a visible diff — a thesis
structure should not change under a student in month four because we improved a
catalog entry.

### 8.3 Agent version binding

Runs record their agent version in the Ledger, so content produced by agent 2.1
remains attributable to 2.1 after 2.4 ships.

---

## 9. Deletion

`REQ-SEC-6`: deletion must be real.

| Deleted | Also removed |
|---|---|
| A source | Its blob (if unreferenced), CDM, embeddings, index entries, evidence spans; **dependent claims are surfaced first** |
| A project | Store, events, Ledger, blobs, index, snapshots, sync copies |
| A Vault document | Blob, CDM, annotations, embeddings, index entries |
| The Vault | Everything under it, including keys |
| An account | Cloud: account, sync envelopes, sessions. **Local data is untouched** — we cannot reach it, and the UI says so |

### 9.1 Deletion mechanics

| Stage | Behaviour |
|---|---|
| Soft delete | Recoverable for 30 days |
| Impact preview | Before hard delete: what depends on this |
| Hard delete | Removed from store and index |
| Key destruction | The object's CEK is destroyed, which renders any residual ciphertext unrecoverable |
| Sync propagation | Deletion propagates; the Relay drops the envelope |
| Verification | A report confirming what was removed |

CEK destruction is what makes deletion meaningful on media where secure erasure
is not possible (SSDs, copy-on-write filesystems). Destroy the key and the
ciphertext is noise.

---

## 10. Export and portability

| Export | Contents |
|---|---|
| Project | Draft in DOCX/ODT/Markdown, bibliography, sources, Ledger (JSON), Rubric, compliance report, snapshots manifest |
| Vault | `43` §11 |
| Workspace | Every project plus the Vault plus settings |
| Account | Everything cloud-side: profile, subscription, device list |

All open formats, documented schemas, no proprietary container. Export is
available on every tier, including free, and is never gated (`11` §7).

---

## 11. Cloud schema

Deliberately thin.

```
accounts:  id, email, password_hash, mfa_secret, verified, created
devices:   id, account, name, platform, public_key, last_seen
sessions:  id, account, device, expires, revoked
subscriptions: account, tier, status, period_end
sync_objects:  id (opaque), account, version, size, updated, ciphertext_ref
sync_meta:     object, device, vector_clock
telemetry_agg: date, metric, dimension, count      -- no account reference
```

Row-level security scopes every row to its account. **`sync_objects` holds
ciphertext and an opaque ID** — no title, no type, no project name. An operator
with full database access learns that a user has 240 encrypted objects and
nothing else about them.

---

## 12. Performance

| Operation | Target |
|---|---|
| Open a project | < 500 ms |
| Load a section | < 100 ms |
| Append an event | < 5 ms |
| Snapshot | < 2 s |
| Full-text search (5k docs) | < 200 ms |
| Semantic search (5k docs) | < 800 ms |
| Compliance re-evaluation | < 300 ms |
| Migration (typical project) | < 10 s |

### 12.1 Scale targets

| Dimension | Supported |
|---|---|
| Projects per workspace | 500 |
| Sources per project | 1,000 |
| Words per document | 150,000 |
| Spans per document | 50,000 |
| Ledger entries per project | 500,000 |
| Vault documents | 5,000 |
| Event log per project | 1 million before compaction |

---

## 13. Current state

`src/core/project/` has a project model, serializer, validator, and version
manager — the right instincts. `src/services/storageService.ts` uses browser
storage. `supabase/schema.sql` defines server-side tables.

| Current | Target |
|---|---|
| Browser storage | Encrypted local store with an event log |
| Server-side project data | Local; cloud holds ciphertext only |
| Project versioning exists | Full schema migration with snapshots and CI fixtures |
| No event sourcing | Event log as the source of truth |
| No content addressing | Content-addressed, deduplicated blobs |
| No snapshots | Gate-triggered permanent snapshots |
| No provenance storage | Hash-chained append-only Ledger |
| No deletion guarantees | Real deletion including derivatives and key destruction |
| Rich server schema | Deliberately thin cloud schema with opaque sync objects |

`projectVersionManager.ts` is the closest existing analogue to §8 and is worth
studying before rewriting.
