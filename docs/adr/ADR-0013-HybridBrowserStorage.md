# ADR-0013: Hybrid IndexedDB + localStorage Persistence

## Status

Accepted (2026-08-01) — Phase 1, Task 1. Implemented in
`src/services/storageService.ts`, consumed by
`src/hooks/useProjectPersistence.ts`.

## Context

Two product constraints were set explicitly by the project owner and bound this
decision:

1. **No paid backend of any kind** until the product is at scale. Persistence
   must be browser-local; a server-side datastore was off the table.
2. **No payment collection from students** before ~10k users, so the design
   could not assume revenue to fund hosting.

Against that, project state had outgrown its storage. Everything lived in
`localStorage` under a per-user profile key, and `localStorage` caps at ~5 MB
per origin in every major browser. The Phase 1 multi-document work — ten
academic document types, each with a full section set, plus the Knowledge Vault
— makes a single project large on its own, and the product is explicitly
multi-project. Users were on track to hit a hard, silent wall: `localStorage`
signals exhaustion by throwing `QuotaExceededError` mid-write, which is easy to
turn into lost work.

`IndexedDB` is the only browser-local store without a practically-limiting
quota (typically a large percentage of free disk, hundreds of MB to GB). It is
asynchronous and considerably more awkward than `localStorage`, and it is
unavailable or blocked in some contexts — private-browsing modes and
locked-down enterprise profiles among them.

## Decision

Persist to **IndexedDB as primary, `localStorage` as automatic fallback**,
behind one module (`src/services/storageService.ts`) so no caller has to know
which store answered.

- **Database**: `scholar-agentic-os`, version 1, object stores `projects`
  (keyPath `id`) and `metadata`.
- **Fallback is silent and automatic.** Every IndexedDB path is wrapped; on
  failure — including `indexedDB is not defined`, as under jsdom in tests — the
  call logs a warning and completes against `localStorage`. Callers see one
  Promise-based API either way.
- **Metadata stays in `localStorage`** (`loadMetadata` / `saveMetadata` are
  synchronous). The project *list* is small, is read on nearly every render,
  and benefits from synchronous access; only project *bodies* are large enough
  to need IndexedDB.
- **Compression above 100 KB** (`COMPRESSION_THRESHOLD`). Larger payloads are
  base64-encoded with a `z1:` prefix; `decompress()` passes through anything
  lacking that prefix, so the format is self-describing and old records stay
  readable. Encoding is deliberately synchronous — an async compressor was
  tried first and could not be called from the synchronous save path without
  restructuring persistence, and the ~33% base64 overhead is irrelevant when
  the ceiling is hundreds of MB rather than 5.
- **`migrateToHybridStorage()`** moves existing `localStorage` profiles into
  IndexedDB on first run, so no user loses data on upgrade.

The persistence API became `async`, and `useProjectPersistence.ts` was updated
to match.

## Consequences

**Positive**

- The ~5 MB ceiling is gone; multi-document, multi-project work is viable.
- Zero infrastructure cost, satisfying both constraints above.
- Works offline by construction, which suits the existing PWA/service-worker
  setup.
- Degrades rather than fails where IndexedDB is unavailable — the app still
  runs, with the old ceiling.

**Negative**

- **Single-device by design.** Nothing syncs across browsers or machines. This
  is an accepted, owner-approved trade for zero backend cost; users must be
  warned in-product, and it is the main thing a future sync backend would fix.
- **Clearing browser data destroys projects.** Export/backup is the only
  mitigation.
- Async persistence introduced a class of bug the old synchronous code could
  not have: an in-flight load resolving after unmount. This caused a real CI
  failure and is now guarded by a `cancelled` flag in
  `useProjectPersistence.ts`, alongside the global RTL `cleanup()` in
  `src/testSetup.ts`.
- Two code paths (IndexedDB and fallback) means both need exercising; tests use
  `fake-indexeddb/auto` for the primary path, and jsdom without it naturally
  exercises the fallback.

## Alternatives rejected

- **Server-side datastore (Supabase/Postgres)** — solves sync properly, but
  violates the no-backend-cost constraint outright.
- **`localStorage` alone with aggressive compression** — buys a small multiple
  of 5 MB and still ends at a hard wall; postpones the problem rather than
  removing it.
- **Origin Private File System / File System Access API** — ample capacity, but
  materially worse browser support than IndexedDB and a poor fit for the
  record-oriented access pattern here.

## Revisit when

Sync across devices becomes a requirement — at which point this module is the
right seam to put a remote adapter behind, keeping the local store as the
offline cache rather than replacing it.
