# 07 — Roadmap

**Revised** to incorporate the product revision requirements. Where this
conflicts with the original sequencing,
[11](./11-requirements-conflicts.md) records why.

Sequenced path to [05](./05-target-blueprint.md) and documents 12–21. No dates
— sequence and exit criteria only, because effort estimates without a team size
are fiction.

`[RECOMMENDATION]` Ordering principle, unchanged by the revision: **fix what is
broken, prove the wedge, then rebuild the core.** Every stage ships something
usable. No stage requires a rewrite before value appears.

`[INFERRED]` The revision widens *scope* substantially — four degree levels, a
dozen-plus output types, two independent clients, an admin platform. It does
not change the dependency order: the provenance model still gates per-claim
disclosure, and per-claim disclosure still gates the product's central claim.

---

## Stage 0 — Stop the bleeding

Defects and dead weight. Nothing here is architecture; all of it is currently
costing something.

| Item | Evidence | Exit criterion |
|---|---|---|
| Resolve duplicated submission UI | `[OBSERVED]` Two cover-letter editors and two checklists both render | One implementation |
| Decide `src/ai/` — adopt or delete | `[OBSERVED]` 6,086 lines, 2 tests, no live import edge | One provider abstraction |
| Consolidate Knowledge Vault surfaces | `[OBSERVED]` TD-14 — three components, one aliased to another's name | One surface, before [13](./13-user-journey.md) builds on it |
| Delete dead server routes | `[OBSERVED]` 1,347 lines, zero importers | Removed; `users.json` path audited |
| Test citation formatters | `[OBSERVED]` 1 test file / 17 source files | Per-formatter tests |
| Make `lint` unskippable | `[OBSERVED]` `tsc --noEmit` stricter than `build` | Pre-commit hook + required check |
| Pick one hosting target | `[OBSERVED]` `render.yaml` and `netlify.toml` both present | One documented path |
| **Instrument onboarding and gates** | `[OBSERVED]` TD-19 — no telemetry in the live path | Funnel and gate-hit data flowing |
| **Audit Supabase RLS** | `[OBSERVED]` TD-04 — anon key is public; RLS is the whole boundary | Written policy per table; isolation tests |

`[RECOMMENDATION]` Two items moved *into* Stage 0 by the revision:
instrumentation, because [20](./20-admin-platform.md) makes gate-hit rates the
primary product signal and nothing else can be evaluated without it; and the
RLS audit, because the admin platform and multi-tenancy both assume it holds.

**Gate:** no known user-visible defects; one provider abstraction; CI cannot be
bypassed; usage is measurable.

---

## Stage 1 — Output-first foundation and validation

`[RECOMMENDATION]` The revision's highest-value early work, and where the
strategic bet gets tested.

| Item | Reference |
|---|---|
| Output-type catalogue as versioned data | [14](./14-output-catalog.md) — `[OBSERVED]` `documentTypes.ts` is the right shape, wrong location |
| Venue rule packs — 10–15 real venues across degree levels | [17](./17-compliance-engine.md) |
| Requirement determination with visible source and confidence | [17](./17-compliance-engine.md) §2 |
| Output-first workspace and readiness view | [13](./13-user-journey.md) §5 |
| Revised onboarding, vault optional | [13](./13-user-journey.md) §2–4 |
| Venue-aware export | [18](./18-finalisation-export.md) |
| **`.odt` export** | Requirement #9 — same export model |
| **User research across all four degree levels** | [C-08](./11-requirements-conflicts.md#c-08--roadmap-validate-then-build-vs-a-specified-feature-set) |

**Gate:** an undergraduate and a PhD candidate can each select their real
output type and venue, see requirements the system determined for them, and
export something compliant. Evidence exists on whether disclosure changes
behaviour **at each level**.

`[RECOMMENDATION]` The validation question is narrowed, not removed. `[INFERRED]`
It matters *more* after the audience widened: a PhD candidate submitting to
Elsevier has an obvious reason to care about disclosure; a second-year
undergraduate may not. A negative result at undergraduate level does not stop
the product — it changes which features lead there.

---

## Stage 2 — Provenance core

The largest and most valuable change. `[INFERRED]` Everything defensible
depends on it; it is deliberately after validation.

| Item | Reference |
|---|---|
| Manuscript block/claim model | [06](./06-architecture-spec.md) — `[OBSERVED]` `Record<string, string>` cannot express per-claim provenance |
| Provenance ledger, append-only | [06](./06-architecture-spec.md) |
| Evidence graph and support edges | [15](./15-evidence-pipeline.md) |
| Skills return reviewable patches | [16](./16-authoring-lifecycle.md) §1 |
| Claim-level provenance in the editor | [16](./16-authoring-lifecycle.md) §2 |
| Disclosure derived from the ledger | [18](./18-finalisation-export.md) §4 |
| Provenance report export | [18](./18-finalisation-export.md) §6 |
| Migrate existing projects | `authorship: unknown`, never `human` |

`[RECOMMENDATION]` The migration constraint is a hard one. `[INFERRED]` A false
provenance record corrupts the audit trail the entire product rests on (R-05);
an honest gap is recoverable.

**Gate:** disclosure generated with no hand-authored text; unsupported claims
listable for any manuscript; a provenance report exportable.

---

## Stage 3 — Clients and collaboration

`[RECOMMENDATION]` After Stage 2, because both depend on the block model.

| Item | Reference |
|---|---|
| Desktop client — local inference, filesystem library, bulk ingest | [12](./12-client-strategy.md) §2 |
| Web client — guided navigation, managed onramp, mobile review | [12](./12-client-strategy.md) §3 |
| Gate-parity test across clients | [12](./12-client-strategy.md) §6 |
| Encrypted sync, opt-in, block-level merge | [12](./12-client-strategy.md) §5 |
| **Async review sharing** (collaboration tier 1) | [16](./16-authoring-lifecycle.md) §3 |
| Backup and export tooling | [21](./21-data-and-security.md) §8 |

`[INFERRED]` Async review is placed here rather than later because supervisor
feedback latency is the binding constraint identified in
[04](./04-market-position.md), and tier 1 needs no shared infrastructure.

**Gate:** a project edits cleanly on two devices with no server-side plaintext;
a supervisor can review and return comments.

---

## Stage 4 — Agents and administration

| Item | Reference |
|---|---|
| Agent contracts; collapse 1:1 agents into skills | [19](./19-agent-architecture.md) §2–3 |
| Source Proposer with authenticated adapters | [19](./19-agent-architecture.md), [15](./15-evidence-pipeline.md) §3 |
| Critic agent | [19](./19-agent-architecture.md) §4 |
| Admin: users, providers, quotas, monitoring | [20](./20-admin-platform.md) §1–4 |
| Rule-pack lifecycle tooling | [20](./20-admin-platform.md) §6 |
| Evaluation sandbox with gate-outcome parity | [20](./20-admin-platform.md) §7 |
| Release management, independent rule-pack shipping | [20](./20-admin-platform.md) §8 |

`[RECOMMENDATION]` **Wire managed-AI quota before any growth push** (R-09).
`[OBSERVED]` `src/ai/quota` exists but is unreachable, so managed cost
currently scales linearly with users with no enforcement point.

**Gate:** every agent has a named consumer; no agent wraps a single skill; a
candidate model can be evaluated and promoted without changing a gate outcome.

---

## Stage 5 — Scale and ecosystem

| Item | Evidence |
|---|---|
| Distributed rate limiting | `[OBSERVED]` in-process limits fail open under scaling |
| Parsing off the SPA process | `[OBSERVED]` 50 MB synchronous parse shares the event loop |
| SSRF hardening on external-link parsing | `[OBSERVED]` TD-17 |
| Static CDN + thin API split | `[INFERRED]` correct shape given manuscripts never touch the server |
| Layer rule enforced in CI | `[OBSERVED]` its absence produced three provider abstractions |
| Rule packs and output types as contributions | [17](./17-compliance-engine.md) §7 |
| Import adapters — Elicit, Consensus, SciSpace, Zotero | [C-02](./11-requirements-conflicts.md#c-02--positioning-submission-integrity-vs-full-authoring-assistant) |
| Institutional local deployment | [12](./12-client-strategy.md) §7 |

**Gate:** load evidence at target scale; a third party ships a rule pack
without touching app code.

---

## Explicitly deferred

`[RECOMMENDATION]` Decisions, not oversights:

| Deferred | Until | Reason |
|---|---|---|
| Real-time concurrent editing | After Stage 3 | Inexpressible before the block model; far larger than sync ([C-05](./11-requirements-conflicts.md#c-05--collaboration-deferred-vs-required)) |
| LMS / institutional integration | Validated in Stage 1 | `[ASSUMPTION]` no supervisor or cohort model exists in code |
| Rebuilding a full orchestrator | A live consumer needs it | `[OBSERVED]` ~5,500 lines built unused and deleted once |
| Own literature corpus | Indefinitely | `[INFERRED]` unwinnable against 270M-paper incumbents |
| Poster and presentation output classes | Scoped decision needed | `[INFERRED]` fixed-canvas and slide output fall outside the document model ([14](./14-output-catalog.md) §5) |

---

## Sequencing rationale

`[INFERRED]` Why this order:

- **Stage 0 first** — the duplicated UI is a live defect; three provider
  abstractions tax every later stage; and without telemetry no later decision
  can be evaluated.
- **Stage 1 before Stage 2** — Stage 2 is expensive and rests on an
  unvalidated assumption. Validating is cheap; being wrong afterwards is not.
- **Stage 2 before Stage 3** — block-level merge and claim-level review are
  impossible against a string map, so clients built first would need rebuilding.
- **Stage 3 before Stage 4** — agents produce proposals users review; the
  review surface must exist first.
- **Stage 5 last** — an ecosystem needs a stable core to extend.

`[RECOMMENDATION]` The one reordering worth considering: pull `.odt` export
forward into Stage 0. `[INFERRED]` It is small, shares the existing export
model, and is a hard blocker for institutions with open-source mandates —
disproportionate value for the effort.
