# 07 — Roadmap

Sequenced path from the current system to [05](./05-target-blueprint.md).
No dates — sequence and exit criteria only, because effort estimates without a
team size are fiction.

`[RECOMMENDATION]` Ordering principle: **fix what is broken, prove the wedge,
then rebuild the core.** Every stage ships something usable. No stage requires
a rewrite before value appears.

---

## Stage 0 — Stop the bleeding

Defects and dead weight. Nothing here is architecture; all of it is currently
costing something.

| Item | Evidence | Exit criterion |
|---|---|---|
| Resolve duplicated submission UI | `[OBSERVED]` Two cover-letter editors and two checklists both render in the Publishing tab | One implementation; no duplicate surface |
| Decide `src/ai/` — adopt or delete | `[OBSERVED]` 6,086 lines, 2 tests, no live import edge | One provider abstraction remains |
| Delete dead server routes | `[OBSERVED]` `auth.ts` (1,088) + `parser.ts` (259), zero importers | Removed; `users.json` path audited |
| Test the citation formatters | `[OBSERVED]` 1 test file / 17 source files | Per-formatter tests, real fixtures |
| Make `lint` unskippable | `[OBSERVED]` `tsc --noEmit` stricter than `build`; commits merged red | Pre-commit hook + required status check |
| Pick one hosting target | `[OBSERVED]` `render.yaml` and `netlify.toml` both present | One documented path |

`[INFERRED]` Highest value here is the duplicated UI — it is the only item a
user can see today.

**Gate:** no known user-visible defects; one provider abstraction; CI cannot be
bypassed.

---

## Stage 1 — Prove the wedge

Test the strategic bet in [04](./04-market-position.md) before building on it.
`[ASSUMPTION]` The bet is unvalidated: that users treat disclosure as an
obligation to discharge correctly rather than a box to tick.

| Item | Rationale |
|---|---|
| Extract venue rules to data | `[RECOMMENDATION]` Generalise the hardcoded Elsevier placement into a `VenueRulePack`. Start with 5–10 real venues. |
| Venue-aware export | Export consumes the rule pack: placement, wording, citation style, reference-list heading |
| Instrument gates | `[OBSERVED]` No live telemetry exists — there is currently no way to know which gates users hit or where they abandon |
| Readiness view | `[RECOMMENDATION]` Replace phase navigation as the primary mental model with "what blocks submission to *this* venue" |
| **User research** | `[ASSUMPTION]` Validate assumptions 1 and 4 from [04](./04-market-position.md) with real candidates |

**Gate:** a user can select a real journal, see venue-specific blockers, and
export a manuscript whose disclosure matches that publisher's stated
requirement. Evidence exists on whether they value it.

`[RECOMMENDATION]` If user research contradicts the wedge, stop and revisit
[03](./03-product-definition.md) and [04](./04-market-position.md) before
Stage 2. Stage 2 is expensive and predicated on this.

---

## Stage 2 — The provenance core

The largest and most valuable change. `[INFERRED]` Everything defensible
depends on it; it is deliberately after validation.

| Item | Evidence |
|---|---|
| Manuscript block/claim model | `[OBSERVED]` `Record<string, string>` cannot express per-claim provenance or citation anchoring |
| Provenance ledger | `[RECOMMENDATION]` Append-only; disclosure becomes *derived*, not asserted |
| Evidence graph + support edges | `[RECOMMENDATION]` Makes "which claims are unsupported?" a query |
| Migrate existing projects | `[OBSERVED]` `migrateToHybridStorage()` is the precedent |
| Skills return patches | `[RECOMMENDATION]` Reviewable before acceptance |
| Claim-level provenance UI | Inline indicators for AI-authored and unsupported claims |

`[RECOMMENDATION]` Migration must mark pre-existing text `authorship: unknown`,
never `human`. `[INFERRED]` A false provenance record corrupts the audit trail
the entire product rests on; an honest gap is recoverable.

**Gate:** disclosure is generated from the ledger with no hand-authored text,
and unsupported claims can be listed for any manuscript.

---

## Stage 3 — Multi-device

`[OBSERVED]` The most serious product gap: a student on a laptop and a lab
machine has two disjoint universes.

| Item | Constraint |
|---|---|
| Encrypted sync adapter | Client-side encryption; server stores ciphertext only |
| Block-level conflict resolution | `[INFERRED]` Only possible after Stage 2 — the string map cannot merge |
| Opt-in, local-only preserved | Privacy and zero-storage-cost properties are structural advantages |

**Gate:** a project edits cleanly on two devices with no plaintext server-side.

---

## Stage 4 — Scale readiness

`[RECOMMENDATION]` Before growth, not after. Each item is an `[OBSERVED]`
blocker.

| Item | Evidence |
|---|---|
| Distributed rate limiting | In-process limits do not survive horizontal scaling |
| Move parsing off the SPA process | 50 MB synchronous parse shares the event loop with page serving |
| Wire managed-AI quota | `src/ai/quota` exists but is unreachable; managed cost scales linearly |
| Static CDN + thin API split | `[INFERRED]` Correct shape given manuscripts never touch the server |
| Layer rule enforced in CI | `[OBSERVED]` Its absence produced three provider abstractions |

**Gate:** load evidence for the target scale; managed mode cannot exceed budget.

---

## Stage 5 — Ecosystem

| Item | Rationale |
|---|---|
| Venue rule packs as contributions | `[INFERRED]` The compounding moat — editorial labour, not engineering |
| Import from Elicit / Consensus / SciSpace / Zotero | `[RECOMMENDATION]` Complement rather than compete; all imports enter unapproved |
| Capability adapter plugins | `[OBSERVED]` The catalog pattern already proves this works |
| Skill plugins | Sandboxed from the ledger |

**Gate:** a third party ships a venue rule pack without touching app code.

---

## Explicitly deferred

`[RECOMMENDATION]` Deferred as decisions, not oversights:

| Deferred | Until |
|---|---|
| Real-time collaborative editing | After Stage 2 at minimum — inexpressible before the block model, and a far larger commitment than sync |
| LMS / institutional integration | The institutional angle is `[ASSUMPTION]`; validate in Stage 1 |
| Rebuilding the orchestrator | A live consumer needs it. `[OBSERVED]` ~5,500 lines were built unused and deleted once already |
| Own literature corpus | `[INFERRED]` Unwinnable against 270M-paper incumbents |

---

## Sequencing rationale

`[INFERRED]` Why this order and not another:

- **Stage 0 before everything** — the duplicated UI is a live defect, and
  paying maintenance on three provider abstractions taxes every later stage.
- **Stage 1 before Stage 2** — Stage 2 is the expensive one and is predicated
  on an unvalidated assumption. Validating first is cheap; being wrong after is
  not.
- **Stage 2 before Stage 3** — block-level merge is impossible against a
  string map, so sync built first would need rebuilding.
- **Stage 4 before growth** — the scaling blockers are silent. In-process rate
  limits do not fail loudly; they just stop limiting.
- **Stage 5 last** — an ecosystem needs a stable core to extend.

`[RECOMMENDATION]` The one reordering worth considering: pull "instrument
gates" from Stage 1 into Stage 0. It is small, and no other decision here can
be evaluated without usage data.
