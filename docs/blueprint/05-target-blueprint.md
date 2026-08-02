# 05 — Target Blueprint

> **Revised 2026-08-01** for the product revision requirements. Where this
> document conflicts with them, [11 — Requirements Conflict Analysis]
> (./11-requirements-conflicts.md) is authoritative. See also documents
> 12–21 for the product and system design they specify.

A redesign, not a refactor. Assumes a multi-year horizon and 100,000+ users.

Depends on the strategic choice in [03 §Strategic tension](./03-product-definition.md)
and the positioning in [04](./04-market-position.md): **this is a submission
integrity system, not a research assistant.**

---

## Product vision

> **Every claim traceable to an approved source. Every AI contribution
> declared, in the form the target publisher requires. Enforced at the moment
> of export, not left to the author's memory.**

`[INFERRED]` This is the existing system's behaviour, stated as intent. The
gates already exist; the redesign makes them the organising principle rather
than three checks bolted onto a writing tool.

---

## System philosophy

Five principles. Each is a constraint that rejects otherwise-reasonable designs.

### 1. Provenance is the primary data structure

`[RECOMMENDATION]` The manuscript is not text. It is a graph of **claims**,
each carrying: who wrote it (human / which model / hybrid), what supports it
(which approved sources), and when it changed.

`[OBSERVED]` Today `sections: Record<string, string>` makes this inexpressible —
disclosure can only be asserted at document level, and citation integrity can
only be counted, never verified per claim.

This is the single highest-leverage change in the blueprint. Everything the
market analysis identifies as defensible depends on it.

### 2. Compliance rules are data, not code

`[RECOMMENDATION]` Publisher requirements — disclosure wording and placement,
citation style, section structure, word limits, what counts as non-reportable
assistive AI — live in a versioned, declarative rule set that ships
independently of the application.

`[OBSERVED]` Precedent exists and works: `providerCatalog.ts` reduced provider
support from "an adapter plus two server branches" to one entry. The same move
applied to publishers turns editorial knowledge into a maintainable asset —
which [04](./04-market-position.md) identifies as the actual moat.

### 3. The client is the system of record

`[OBSERVED]` Manuscripts never touch the server today. `[INFERRED]` This yields
zero per-user storage cost, real offline capability, and a privacy story no
server-based competitor can match.

`[RECOMMENDATION]` Keep it. Add sync as an *optional, encrypted, opt-in*
replication layer — never as a migration of the source of truth.

### 4. Refusal is a feature

`[OBSERVED]` The system already declines to export undisclosed AI use and
declines to cite unapproved sources.

`[RECOMMENDATION]` Generalise: every gate states *what is missing*, *why it
matters for the target venue*, and *the single action that clears it*. A gate
that blocks without explaining is a bug.

### 5. Bring your own inference

`[OBSERVED]` 28 cloud providers, 11 local runners, BYOK and local modes already
exist. `[INFERRED]` This is what makes 100k users economically possible.

`[RECOMMENDATION]` Managed inference is a capped trial, never the default.

---

## What survives the redesign

Judged on whether it is correct, tested, and aligned with the vision.

| Component | Verdict | Why |
|---|---|---|
| `documentExportService.ts` | **Keep, extend** | Real OOXML/PDF from one model; already the disclosure enforcement point |
| `providerCatalog` + `localRunnerCatalog` | **Keep** | Catalog-driven pattern is the model for the rule set |
| `aiGateway` + `providerFailover` + `apiVault` | **Keep** | Working, tested, error-kind classified |
| `storageService.ts` | **Keep, extend** | Correct hybrid design; becomes the local half of sync |
| `citation_compliance/` | **Keep, test properly** | Six real formatters + canonical model; 1 test file is the defect |
| `document_intelligence/` | **Keep** | Real parsers, reasonably tested |
| Compliance gates | **Keep — promote to core** | The product |
| `phaseGating.ts` | **Keep, generalise** | Becomes the gate engine |
| `agents/` + `skills/` | **Merge into one** | Near 1:1 registries; keep skills, drop the agent wrapper |
| `src/ai/` | **Delete or adopt — decide** | 6,086 lines, 2 tests, no live import edge |
| `src/research/` | **Fold into skills** | Overlaps agents by name and purpose |
| Duplicate submission UI | **Consolidate to one** | Two implementations both mounted |
| `server/routes/auth.ts`, `parser.ts` | **Delete** | 1,347 lines, zero importers |
| `PaperProject` as one aggregate | **Replace** | ~45 fields, total coupling, cause of the stale-closure class of bug |

---

## Target architecture

Five layers. The rule is that dependencies point **downward only** — a lower
layer never imports a higher one.

```
┌──────────────────────────────────────────────────────────┐
│  EXPERIENCE          workspace · gates · review surfaces │
├──────────────────────────────────────────────────────────┤
│  ORCHESTRATION       skills · pipelines · gate engine    │
├──────────────────────────────────────────────────────────┤
│  DOMAIN              manuscript · provenance · evidence  │
│                      compliance rule set · venues        │
├──────────────────────────────────────────────────────────┤
│  CAPABILITY          inference · parsing · citation ·    │
│                      export · discovery adapters         │
├──────────────────────────────────────────────────────────┤
│  FOUNDATION          storage · sync · identity · events  │
└──────────────────────────────────────────────────────────┘
```

`[OBSERVED]` The current system has no such rule, which is how three provider
abstractions and two submission suites came to coexist.

### Domain layer — the new core

`[RECOMMENDATION]` This layer does not exist today and is the heart of the
redesign.

**Manuscript model.** Ordered blocks; each block a list of claims; each claim
carrying `authorship` (`human` | `ai:<model>` | `hybrid`), `support` (approved
source refs), and a revision trail. Sections become a view over blocks, not the
storage unit.

**Provenance ledger.** Append-only. Every AI generation, human edit, and
acceptance is an entry. Disclosure is *derived* from the ledger, never typed by
a user. This makes the disclosure statement auditable rather than asserted —
directly serving the institutional need in [04](./04-market-position.md).

**Evidence graph.** Sources with approval state, and the claims each supports.
Makes "which claims are unsupported?" a query rather than a manual review.

**Compliance rule set.** Per-venue declarative rules — disclosure wording and
placement, citation style, structure, limits, assistive-AI carve-outs.
Versioned, with an effective date, because publisher policies change and a
manuscript must be checkable against the rules in force when it was submitted.

### Orchestration layer

`[RECOMMENDATION]` One registry, not two. `[OBSERVED]` Agents and skills map
near one-to-one today; the wrapper earns nothing.

Skills are pure functions over domain objects with declared inputs, outputs,
and required approvals. Pipelines compose them. The **gate engine** generalises
`phaseGating.ts`: a gate is a predicate over domain state plus a remediation
message.

`[RECOMMENDATION]` Skill execution must be *resumable and inspectable* — a
persisted run record with status. `[OBSERVED]` Today execution is one-shot and
in-memory; a closed tab loses the run. Note that a full workflow engine already
existed and was deleted (`src/orchestrator`, ~5,500 lines) — rebuild only what
a live consumer needs, or that history repeats.

### Capability layer

`[RECOMMENDATION]` Each capability is a port with swappable adapters:
`InferencePort` (existing gateway + catalogs), `ParsingPort`, `CitationPort`,
`ExportPort`, `DiscoveryPort`.

`[RECOMMENDATION]` `DiscoveryPort` should import from Elicit/Consensus/SciSpace
and reference managers rather than rebuilding discovery — per
[04](./04-market-position.md), that is a fight not worth having. Every imported
source enters as *unapproved*, preserving the gate.

### Foundation layer

`[RECOMMENDATION]` Storage keeps the current hybrid design and gains an
**optional encrypted sync** adapter: client-side encryption, server stores
ciphertext only. Preserves the privacy and cost properties while removing the
single-device limitation identified in [03](./03-product-definition.md) as the
most serious product gap.

`[RECOMMENDATION]` An event bus for observability — every gate evaluation,
skill run, and export emits an event. `[OBSERVED]` There is no telemetry in the
live path today (`src/ai/telemetry` exists but is unreachable), so there is
currently no way to know which gates users actually hit.

---

## Plugin system

`[RECOMMENDATION]` Three extension points, in descending priority:

1. **Venue rules** — the most valuable. A journal, publisher, or university
   contributes a rule pack. Data, not code; reviewable by non-engineers.
2. **Capability adapters** — a new provider, parser, or export format.
   `[OBSERVED]` The catalog pattern already proves this works.
3. **Skills** — new analyses over domain objects.

`[RECOMMENDATION]` Plugins declare capabilities and are sandboxed from
provenance. Nothing outside the domain layer may write to the ledger — the
audit trail is only worth as much as its tamper-resistance.

---

## User experience

`[RECOMMENDATION]` Three shifts from the current UI:

**From phases to readiness.** `[OBSERVED]` Today the user navigates A–I.
`[RECOMMENDATION]` Show a live readiness state for the target venue — what is
blocking submission, why, and the one action that clears it. Phases become
navigation, not the mental model.

**Provenance visible in the editor.** Claim-level indicators for AI-authored
and unsupported claims, inline. The disclosure statement is then a *summary of
something the user has already seen*, not a surprise at export.

**Venue-first setup.** Choosing the target journal early loads its rule pack
and makes every downstream gate concrete instead of generic.

---

## Developer experience

`[RECOMMENDATION]` Directly addressing observed failures:

- **Enforce the layer rule in CI.** `[OBSERVED]` Three provider abstractions
  and two submission suites exist because nothing prevented them. A dependency
  check is cheap and would have caught all of it.
- **Make `lint` unskippable.** `[OBSERVED]` `tsc --noEmit` is stricter than
  `build`; several commits merged red. Pre-commit hook plus required status
  check.
- **Coverage floors per layer.** `[OBSERVED]` Coverage is inverted against risk
  (`citation_compliance` 1/17). Domain and capability layers should carry the
  highest floors.
- **One registry per concept, asserted by test.** A test that fails when a
  second provider registry appears is worth more than a convention.

---

## Deployment and scaling

`[RECOMMENDATION]`

**Static-first.** The SPA is the product; it should deploy to a CDN. `[OBSERVED]`
Both a Netlify static config and a Render Docker service exist — pick one.
Static hosting plus a thin API is the correct shape given manuscripts never
touch the server.

**Thin, stateless API.** Only what cannot run client-side: CORS-blocked
outbound fetches, managed-mode inference, sync ciphertext relay. `[OBSERVED]`
Supabase Edge Functions already do the proxy job well — that pattern should
absorb the rest.

**Fix the scaling blockers before growth.** `[OBSERVED]` In-process rate limits
do not survive horizontal scaling; 50 MB synchronous parsing shares the event
loop with SPA serving; managed AI has no wired quota.

**Local deployment as a first-class target.** `[OBSERVED]` Local runners and
browser-local storage already make a fully offline install possible. For
institutions with confidentiality constraints this is a differentiator, not a
side effect.

---

## Future-proofing

| Property | Mechanism |
|---|---|
| Maintainability | Layer rule enforced in CI; one registry per concept |
| Modularity | Ports and adapters at the capability layer |
| Extensibility | Venue rule packs as data |
| Observability | Event bus; every gate and skill run emits |
| Testability | Domain layer is pure functions over plain objects |
| Documentation | Rule packs and skill manifests are self-describing |
| CI/CD | Lint required; layer check; coverage floors |
| Multi-provider AI | Existing catalog pattern, unchanged |
| Offline | Client is system of record; local runners |
| Cloud-native | Static CDN + stateless functions |
| Local deploy | Same artifact, local inference |
| Plugins | Three declared extension points |
| Multi-agent | Skills + pipelines + persisted runs |
| Horizontal scale | No server-side session or manuscript state |

---

## What this blueprint deliberately does not do

`[RECOMMENDATION]` Stated so they are decisions rather than omissions:

- **No corpus.** Import from tools that already have one.
- **No real-time collaborative editing.** Provenance and gates first;
  concurrent editing is a much larger commitment and the data model must land
  before it is even expressible.
- **No LMS integration yet.** The institutional angle in
  [04](./04-market-position.md) is an `[ASSUMPTION]`; validate before building.
- **No rebuild of the deleted orchestrator.** ~5,500 lines were written and
  deleted unused. Rebuild only against a live consumer.
