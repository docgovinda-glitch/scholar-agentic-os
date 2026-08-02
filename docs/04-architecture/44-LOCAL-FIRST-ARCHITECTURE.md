# Local-First Architecture

> **Doc ID:** 44 · **Status:** Design · **Depends on:** `40`, `45`, `46`

What stays on the device, what may leave, how sync works, and the honest
statement of what the user takes on in exchange.

---

## 1. The commitment

**User documents, processing, indexing, embeddings, caches, and knowledge assets
remain on the user's device by default.** Only what authentication, licensing,
account management, or user-enabled synchronisation genuinely requires may leave
(`REQ-LOC-1`, `REQ-LOC-2`).

This is a capability property, not a policy. The cloud plane is built so that it
*cannot* hold plaintext user content (`40` §4.1) — which means the promise
survives a change of management, a change of business model, and a subpoena.

---

## 2. What lives where

### 2.1 On the device, always

| Data | Notes |
|---|---|
| Documents and drafts | Never transmitted except through user-enabled sync, encrypted |
| The Provenance Ledger | Per project |
| Approved corpus and source files | Including uploaded PDFs |
| The Vault | Encrypted |
| Full-text and vector indexes | Derived, rebuildable |
| Embeddings | Derived |
| Compiled Rubrics | Derived from requirement sources |
| Snapshots and version history | |
| API keys | Platform keystore (`46` §5) |
| Model files | Multi-gigabyte; obviously local |
| Caches | Parsed content, resolved metadata, model responses |
| Settings and layout | |
| Egress audit log | |
| Diagnostic log | User-viewable, user-exportable, never auto-transmitted |

### 2.2 In the cloud, minimally

| Data | Why | Encrypted E2E |
|---|---|---|
| Account: email, password hash, MFA secret | Authentication | n/a — auth data |
| Subscription state | Licensing | n/a |
| Device and session list | Security | n/a |
| Sync envelopes | User-enabled sync | **Yes** — ciphertext only |
| Sync metadata: object IDs, versions, timestamps | Conflict detection | Opaque IDs |
| Aggregate telemetry | Product health | n/a — no user identifiers |

### 2.3 Transmitted to AI providers, conditionally

Only what the Warden permits, per the user's policy (`41` §5). The user can see
exactly what would go, before it goes.

### 2.4 Never transmitted anywhere

- API keys (`REQ-SEC-3`).
- Vault passphrase or any encryption key.
- Document titles, to the Relay — filenames and titles are content.
- Prompts or model outputs, to the operator.
- Per-user behavioural paths.

---

## 3. Offline capability

| Capability | Offline |
|---|---|
| Create and edit documents | Full |
| Structure and outline | Full |
| Citation formatting, bibliography | Full |
| Deterministic compliance rules (~80%) | Full |
| Vault search: keyword and semantic | Full |
| Corpus search | Full |
| Local model inference | Full |
| Provenance and authorship | Full |
| Export, every format | Full |
| Snapshots and restore | Full |
| Plugins (without `net:outbound`) | Full |
| Cloud model inference | Queued |
| Literature discovery | Unavailable, explained |
| Identifier resolution, retraction check | Queued |
| Sync | Queued |
| Console | Cached content only |

### 3.1 Offline is tested, not asserted

`52` §5.3 specifies an automated test that completes a full project from `G0` to
`G7` with the network interface disabled, using a local model. If that test does
not pass, local-first is marketing.

### 3.2 Offline UX

| Element | Behaviour |
|---|---|
| Status | Persistent offline indicator |
| Queued actions | Listed, individually cancellable |
| Unavailable features | Labelled with the reason, not silently disabled |
| Reconnection | Automatic; queue drains; conflicts surfaced |
| Preparation | A "prepare for offline" action pre-fetches sources and verifies a local model is ready (`26` Journey 8) |

---

## 4. Local processing

Everything computationally significant happens on the device.

| Operation | Cost on baseline hardware |
|---|---|
| PDF parse (300 pages) | 5–15 s |
| OCR (300 pages) | 2–8 min |
| Audio transcription | ~0.3× realtime |
| Embedding (1,000 chunks) | 1–4 min |
| Vector index build (5,000 docs) | 20–60 min |
| Local inference (7B) | 5–15 tokens/sec |
| Compliance evaluation | < 300 ms |
| Export (20k words) | < 8 s |

### 4.1 Resource management

The Local Processing Dashboard and Resource Monitor (`22` §3.4) exist because
this workload on an 8 GB machine is the difference between a usable product and
an unusable one.

| Control | Behaviour |
|---|---|
| Priority | Interactive work always preempts background work |
| Throttling | User-set ceilings on CPU and memory |
| Scheduling | Heavy work deferrable to idle or to a chosen time |
| Battery | Background processing pauses on battery below a threshold, by default |
| Thermal | Backs off on sustained high temperature where the OS reports it |
| Cancellation | Every background operation cancellable |

---

## 5. Sync

Optional, opt-in, end-to-end encrypted (`REQ-LOC-3`).

### 5.1 Model

```
DEVICE A                        RELAY                      DEVICE B
document                                                   document
   │ encrypt (local key)                                       ▲
   ▼                                                           │ decrypt
sync envelope ──────────▶  ciphertext + opaque   ──────────▶ envelope
                            object ID + version
                            (no title, no content)
```

The Relay stores ciphertext and the minimum metadata sync requires. It cannot
decrypt, cannot search, and cannot enumerate document titles.

### 5.2 Scope

Per-workspace and per-project, user-selected:

| Scope | Typical use |
|---|---|
| Nothing | Full local-only |
| Metadata only | Console shows project status, not content |
| Drafts | Review on the Console |
| Drafts + corpus metadata | Approve sources on the Console |
| Everything except source files | Full Console use without syncing large PDFs |
| Everything | Full multi-device |

Selective scope matters for cost and for bandwidth: a Vault of 50 GB of PDFs is
not something most users want to sync, and the design should not force it.

### 5.3 Conflicts

**Nothing is ever silently discarded** (`REQ-LOC-8`).

| Conflict | Resolution |
|---|---|
| Same document, different devices | Both preserved; side-by-side diff; human chooses or merges |
| Structural | Presented as a structural diff |
| Ledger | **Union.** The Ledger is append-only; entries merge, never conflict |
| Settings | Last-write-wins with the change shown |
| Deletion vs edit | Deletion is never automatic; the user decides |

The Ledger's append-only design pays off here: provenance records from two
devices merge cleanly by construction, which means authorship history survives
multi-device work without a merge algorithm that could lose entries.

### 5.4 Protocol direction

Snapshot-and-merge in v1 rather than CRDTs: it is simpler, adequate for
single-user multi-device (the actual v1 use case), and does not commit us to a
data model before real-time collaboration is designed (`OQ-03`, `55` §2).

---

## 6. Multi-device

| Aspect | Behaviour |
|---|---|
| Devices | Unlimited on paid tiers |
| Keys | Derived from the passphrase on each device; never transmitted |
| Adding a device | Passphrase or Recovery Kit; optionally QR-assisted from an existing device |
| Removing | Revokes sync access; local data on that device is untouched (we cannot reach it) |
| Partial | Different sync scope per device — a work laptop may sync drafts only |

---

## 7. The user's responsibilities

`REQ-LOC-5` and `REQ-LOC-7`. This section exists because the local-first
bargain has a cost, and hiding it would be dishonest.

### 7.1 What we tell the user, and when

| Moment | Message |
|---|---|
| Workspace creation | The full bargain (`25` §8.1): work lives here, we cannot recover it, set up backup |
| Vault creation | Recovery Kit; passphrase loss is unrecoverable |
| First `G4` | Backup reminder if none configured |
| 10,000 words | Escalated backup prompt — modal, once |
| Every 90 days without a verified backup | Reminder |
| Enabling sync | What sync is and — importantly — what it is not |

### 7.2 The wording

Blunt, because softening it would be a disservice:

> **We cannot recover your work.**
>
> Your documents are on this computer, encrypted with a key only you have. That
> is what "we cannot read your work" actually means — it also means we cannot
> restore it if this computer is lost, stolen, or fails.
>
> A backup takes about a minute to set up.

### 7.3 Sync is not backup

The distinction users most reliably get wrong, so it is stated explicitly at the
moment sync is enabled:

> **Sync is not a backup.**
>
> Sync keeps your devices in step. If you delete something, it deletes everywhere.
> If a file is corrupted, the corruption syncs.
>
> A backup is a separate copy you can go back to. You want both.

### 7.4 Backup design

| Property | Requirement |
|---|---|
| One action | Choose a destination; everything else is automatic |
| Incremental | Only changes after the first run |
| Encrypted | With the user's key |
| Verified | Periodic restore test; the UI shows when a backup last verified |
| Restorable | Full or selective, with a preview before restore |
| Destinations | External drive, network folder, user's own cloud folder, encrypted archive |

**Verification is what separates this from a backup checkbox.** An unverified
backup is a belief, and users discover it was wrong at the worst possible moment.

---

## 8. Storage layout

```
~/Documents/Scholar OS/            (user-chosen)
├── workspaces/
│   └── <workspace-id>/
│       ├── workspace.json         settings (encrypted)
│       ├── projects/
│       │   └── <project-id>/
│       │       ├── project.db     store
│       │       ├── events.log     append-only
│       │       ├── ledger.db      provenance
│       │       ├── blobs/         content-addressed
│       │       ├── index/         derived, rebuildable
│       │       └── snapshots/
│       └── vault/
│           ├── vault.db
│           ├── blobs/
│           └── index/
├── models/                        local model files
├── cache/                         derived, safely deletable
└── logs/
```

| Property | Note |
|---|---|
| Human-navigable | The user can find their files |
| Cache is disposable | Deleting `cache/` loses nothing |
| Index is derived | Deleting `index/` costs a rebuild, not data |
| Blobs are content-addressed | Deduplicated across projects |
| Events are append-only | The recovery substrate |

### 8.1 Location warnings

| Location | Behaviour |
|---|---|
| Local disk | Fine |
| External drive | Warned — disconnection during a write risks corruption |
| Network mount | Warned strongly — locking semantics are unreliable |
| Consumer cloud sync folder (Dropbox, iCloud, OneDrive) | **Warned strongly** — file-level sync of a live database corrupts it |

The last is the most common self-inflicted data loss in local-first
applications. The warning is specific about what will happen, not generic.

---

## 9. Failure and recovery

| Failure | Recovery |
|---|---|
| Crash during write | Event log replay to the last consistent state |
| Corrupt index | Rebuild from blobs |
| Corrupt store | Restore from the last snapshot; report exactly what was lost |
| Corrupt blob | Detected by content hash; restore from backup or sync |
| Disk full | Writes stop cleanly before corruption; space required stated |
| Deleted files | Snapshots, if within retention |
| Lost device, backup configured | Restore on a new device |
| Lost device, no backup | **Unrecoverable.** We said so, repeatedly, and meant it |
| Forgotten Vault passphrase, Recovery Kit held | Recover |
| Forgotten passphrase, no Recovery Kit | **Unrecoverable** |

The two unrecoverable rows are the price of the architecture. They are stated in
the product, in this document, and in support materials, in the same words.

---

## 10. Institutional deployment

Institutions sometimes require managed backup or data residency. Local-first
accommodates this without changing the model:

| Requirement | Approach |
|---|---|
| Managed backup | Institution-configured backup destination on their infrastructure; still encrypted with user keys |
| Data residency | Self-hosted Relay in the required jurisdiction |
| Key escrow | Optional, institution-held escrow key, **visible to the user**, per-workspace, never silent |
| Retention | Institution-configured snapshot retention |

**Key escrow is the sensitive one.** If an institution enables it, every affected
user sees a persistent, unambiguous indicator that their institution can decrypt
their work. Silent escrow would make every privacy claim in this documentation
false, and is not implementable — the UI indicator is enforced client-side and
the escrow key cannot be added without it.

---

## 11. Current state

The repository is a conventional cloud application: React SPA, Express backend,
Supabase database, server-side AI proxying, and `localStorage`/IndexedDB for
client state.

| Current | Target |
|---|---|
| Server-side data | Device-side data |
| Server-side parsing | Local parsing |
| Server-side AI proxy holding keys | Direct client-to-provider through the Warden |
| Browser storage | Encrypted local store with an event log |
| No offline capability | Full offline except discovery and cloud inference |
| No sync (server is the source of truth) | Opt-in E2E encrypted sync |
| No backup story | Verified, one-action backup with escalating prompts |
| No local models | Local-first inference |

This is the largest architectural change in the redesign, and it is the one that
makes the rest of the product's promises true.
