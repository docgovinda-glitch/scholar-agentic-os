# 06 — Architecture Specification

Module contracts, data flow, and control flow for the target system in
[05](./05-target-blueprint.md). Implementation-agnostic: shapes and
responsibilities, not code.

---

## Layer rule

```
experience → orchestration → domain → capability → foundation
```

An import may only point **downward**. `[OBSERVED]` No such rule exists today,
which is the direct cause of three provider abstractions and two submission
suites coexisting.

`[RECOMMENDATION]` Enforce mechanically in CI. A convention that is not checked
is not a rule.

Two corollaries:

- **The domain layer imports nothing above it and no I/O.** It is pure
  functions over plain objects — which makes it the cheapest layer to test and
  the one that should carry the highest coverage floor.
- **Capabilities are ports.** The domain declares what it needs; adapters
  satisfy it. Swapping `pdfmake` never reaches the domain.

---

## Domain layer

### Manuscript

`[RECOMMENDATION]` Replaces `sections: Record<string, string>`.

```
Manuscript
  blocks: Block[]              // ordered; sections are a view, not storage
  venue: VenueRef              // target publication
  metadata: AuthorshipMetadata

Block
  id, kind: heading|paragraph|figure|table|equation|reference-list
  claims: Claim[]

Claim
  id
  text
  authorship: human | ai:<modelId> | hybrid
  support: SourceRef[]         // approved sources only
  revisions: RevisionRef[]
```

`[INFERRED]` Why this shape: three capabilities the market analysis identifies
as defensible — per-claim citation integrity, paragraph-level AI provenance,
and future suggestion-mode — are all *inexpressible* against a flat string map.
This is the minimum structure that makes them possible.

`[RECOMMENDATION]` Section names become a derived view. Preserves the current
mental model without making the string map the storage unit.

### Provenance ledger

`[RECOMMENDATION]` Append-only. Never edited, never deleted.

```
LedgerEntry
  id, timestamp, actor: human | model:<id>
  action: generate | edit | accept | reject | approve-source | confirm-disclosure
  target: ClaimRef | SourceRef | DocumentRef
  detail: { model?, promptHash?, skillId?, ... }
```

`[RECOMMENDATION]` **The disclosure statement is derived from this ledger, never
authored by hand.** `[OBSERVED]` Today `aiUseDisclosure.disclosureText` is text
with a `confirmedAt` timestamp — the user confirms a statement rather than the
system deriving one. Derivation is what converts disclosure from an assertion
into an audit trail, which is the institutional value in
[04](./04-market-position.md).

`[RECOMMENDATION]` Only the domain layer may append. Plugins and UI never write
directly — an audit trail is worth exactly its tamper-resistance.

### Evidence graph

```
Source
  id, canonical: CanonicalReference   // reuse existing model
  approval: unapproved | approved | rejected
  approvedAt?, approvedBy?
  origin: manual | import:<tool> | discovery:<adapter>

SupportEdge
  claimId → sourceId
  strength: direct | contextual
```

`[OBSERVED]` `CanonicalReference` already exists in `src/citation_compliance/model/`
and is reused unchanged.

`[RECOMMENDATION]` `origin` matters: sources imported from Elicit or Zotero
enter as `unapproved`, preserving the gate that
[03](./03-product-definition.md) identifies as core.

Queries this makes trivial, and which are currently impossible `[INFERRED]`:
unsupported claims; sources cited but never approved; approved-but-unused
sources.

### Compliance rule set

`[RECOMMENDATION]` Declarative, versioned, shipped independently of the app.

```
VenueRulePack
  venueId, name, publisher
  effectiveFrom, version
  disclosure: { required, placement, title, template, exemptions[] }
  citation: { styleId, referenceListHeading }
  structure: { sections[], ordering }
  limits: { wordCountMin?, wordCountMax?, abstractMax? }
  ethics: { requiredStatements[] }
```

`[OBSERVED]` This generalises what `documentExportService.ts` currently
hardcodes for one publisher — disclosure placed immediately before references,
per Elsevier's convention.

`[RECOMMENDATION]` `effectiveFrom` is load-bearing: a manuscript submitted in
March must be checkable against the rules in force in March, not today's.
Publisher policies change; without versioning, historical compliance claims
become unverifiable.

---

## Orchestration layer

### Gate engine

`[RECOMMENDATION]` Generalises `phaseGating.ts` (49 lines today).

```
Gate
  id, appliesTo: VenueRulePack | always
  evaluate(state): pass | block(reason, remediation)
  severity: blocking | advisory
```

`[RECOMMENDATION]` `remediation` is mandatory — the single action that clears
the gate. `[OBSERVED]` The existing gates block correctly but explain
inconsistently; a gate that blocks without explaining is a bug.

Gates migrated from current code `[OBSERVED]`:

| Gate | Today | Target |
|---|---|---|
| Approved sources only | 4 filter sites | One gate, evaluated over the evidence graph |
| Disclosure confirmed | `confirmedAt` check at export | Derived from ledger; venue-specific wording |
| Phase order | `canEnterPhase()` | Gate over domain state |
| Structure / limits | absent | From venue rule pack |

### Skills

`[RECOMMENDATION]` One registry. `[OBSERVED]` Agents and skills are two
registries mapping near one-to-one; the agent wrapper adds indirection without
composition.

```
SkillManifest
  id, version
  inputs: DomainSelector[]
  outputs: DomainPatch
  requiresApproval: boolean
  inferenceProfile: { taskType, defaultModelHint }
```

`[RECOMMENDATION]` Skills return a **patch**, never mutate. Makes runs
reviewable before acceptance and is what suggestion-mode later requires.

### Pipelines and runs

`[RECOMMENDATION]` Persisted run records, not in-memory execution.

```
Run
  id, pipelineId, status: queued|running|awaiting-approval|complete|failed
  steps: StepRecord[]
  startedAt, completedAt?
```

`[OBSERVED]` Today `executeAgent(id, input)` is one-shot and in-memory; closing
the tab loses the run.

`[RECOMMENDATION]` Build only what a live consumer needs. `[OBSERVED]` A full
orchestrator — queue, scheduler, dependency resolver, retry manager, failure
recovery, ~5,500 lines — was written, never wired, and deleted. Repeating that
is a real risk, not a hypothetical one.

---

## Capability layer

`[RECOMMENDATION]` Five ports.

| Port | Responsibility | Existing adapter |
|---|---|---|
| `InferencePort` | Generate/stream against a provider | `aiGateway` + catalogs + failover `[OBSERVED]` — keep |
| `ParsingPort` | Document → structured blocks | `document_intelligence/` `[OBSERVED]` — keep |
| `CitationPort` | Format, parse, import references | `citation_compliance/` `[OBSERVED]` — keep, test |
| `ExportPort` | Domain → DOCX/PDF | `documentExportService` `[OBSERVED]` — keep, extend |
| `DiscoveryPort` | Find/import sources | Proxies exist; **import-first** `[RECOMMENDATION]` |

`[OBSERVED]` `InferencePort` is the one place the current architecture is
already right: one catalog definition consumed by both browser and server, 28
cloud + 11 local entries, error-kind-classified failover, encrypted vault.
Carried forward unchanged.

`[RECOMMENDATION]` `ExportPort` gains venue-awareness: it consumes a
`VenueRulePack` and the derived disclosure rather than hardcoding placement.

---

## Foundation layer

### Storage and sync

`[OBSERVED]` Current design is sound: IndexedDB primary, `localStorage`
fallback, compression above 100 KB, synchronous metadata, migration path.

`[RECOMMENDATION]` Add an **optional encrypted sync adapter**:

- Client encrypts before transmit; server stores ciphertext only.
- Server never holds plaintext manuscripts — preserves the privacy and
  zero-storage-cost properties.
- Conflict resolution at **block** level, which the new manuscript model makes
  possible and the current string map does not.
- Opt-in. Local-only remains fully supported.

`[INFERRED]` This removes the most serious product gap in
[03](./03-product-definition.md) without surrendering the architecture's main
structural advantage.

### Events

`[RECOMMENDATION]` Every gate evaluation, skill run, export, and approval emits.

`[OBSERVED]` No telemetry exists in the live path (`src/ai/telemetry` is in the
unreachable subsystem), so there is currently no way to know which gates users
hit or where they abandon. That is the first question a growth decision needs
answered.

`[RECOMMENDATION]` Local-first, opt-in export. A privacy-positioned product
cannot ship silent analytics.

---

## Data flow — drafting a section

`[RECOMMENDATION]` Target flow. Contrast with today `[OBSERVED]`: a skill
returns text, a component writes it into `sections[name]`, and provenance is
recorded only as an aggregate usage log.

```
1  User requests draft for a block
2  Orchestration resolves skill + venue rule pack
3  Gate engine evaluates preconditions
     └─ blocked → remediation surfaced, stop
4  Skill assembles context from APPROVED sources only
5  InferencePort generates (provider per user's mode)
6  Skill returns a DomainPatch — claims, not a string
7  Ledger appends `generate` (model, skill, timestamp)
8  User reviews; accept/reject per claim
9  Ledger appends `accept`/`reject`
10 Evidence graph links accepted claims → supporting sources
```

`[INFERRED]` Steps 6–10 are what make per-claim disclosure and citation
integrity possible. They are the difference between the current and target
systems.

## Control flow — export

```
1  User requests export for venue V
2  Load VenueRulePack(V) at effective date
3  Gate engine evaluates ALL blocking gates
     ├─ unsupported claims?
     ├─ unapproved cited sources?
     ├─ disclosure derivable and confirmed?
     └─ structure/limits satisfied?
4  Any blocking failure → refuse, list remediations
5  Derive disclosure statement from ledger + rule pack
6  ExportPort renders per rule pack (placement, style, headings)
7  Ledger appends `export`
```

`[OBSERVED]` Steps 3–6 exist today in reduced form: export refuses without
`confirmedAt`, and disclosure is placed before references per one publisher's
convention. The target generalises this across venues and derives rather than
asserts.

---

## Migration notes

`[RECOMMENDATION]` The manuscript model change is the only one requiring data
migration.

- `Record<string, string>` → blocks is mechanical: one section becomes a
  heading block plus paragraph blocks.
- Existing text has **no provenance** and must be marked
  `authorship: unknown` — not `human`. `[INFERRED]` Recording a false
  provenance would corrupt the audit trail the product depends on; an honest
  gap is recoverable, a false record is not.
- `storageService.migrateToHybridStorage()` `[OBSERVED]` is the precedent for
  doing this without data loss.
