# Roadmap

> **Doc ID:** 50 · **Status:** Design · **Depends on:** `10`, `51`

The multi-year arc. Phase-level work breakdown is in `51`; this document
explains *what lands when and why that order*.

---

## 1. Sequencing logic

The order is driven by four dependencies that cannot be reordered:

1. **Provenance before drafting.** Retrofitting span-level provenance onto an
   editor built without it is substantially harder than building it in
   (`13` §8.4). The Ledger and the editor are Phase 1.
2. **The Warden before any provider call.** An egress chokepoint added later is
   an egress chokepoint with bypasses. Phase 1.
3. **Approval before discovery.** Building discovery first creates pressure to
   let results flow into the corpus. The queue exists before anything fills it.
4. **Security before extensibility.** The plugin sandbox depends on the
   capability system, which depends on the kernel's trust model.

Everything else is sequenced by user value.

---

## 2. The arc

| | Theme | Duration | Ships |
|---|---|---|---|
| **Phase 0** | Foundations | 2 months | Kernel, store, event log, crypto, capability system |
| **Phase 1** | The honest editor | 4 months | Workbench shell, editor, **Ledger**, **Warden**, Gateway, local models |
| **Phase 2** | The academic workflow | 4 months | Atlas, gates, sources with approval, Rubric, drafting pipeline |
| **Phase 3** | Complete the loop | 3 months | Export, compliance reporting, integrity gate, onboarding, Workshop |
| **Phase 4** | Memory and reach | 3 months | Vault, discovery, Console, sync |
| **Phase 5** | Platform | 4 months | Plugins, Foundry, admin plane, institutional features |
| **Phase 6+** | Depth | ongoing | Catalog breadth, collaboration, advanced agents |

**First public release: end of Phase 3** (~13 months). That is the earliest
point at which a user can complete a real project end to end and export a
submittable file — which is the only meaningful definition of a first release for
this product.

---

## 3. Release milestones

### M1 — Internal alpha (end of Phase 1)

**Can do:** write in a provenance-tracked editor, with local or cloud models,
with egress controlled and visible.

**Cannot do:** anything academic. No output types, no sources, no compliance,
no export.

**Purpose:** validate the hardest technical bet (`53` `RISK-01`) before building
on it. If span-level provenance through arbitrary editing does not work at
150k words, we need to know at month 6, not month 13.

### M2 — Private beta (end of Phase 2)

**Can do:** create a project from an output type, establish requirements,
approve sources, agree a structure, draft sections with evidence binding.

**Cannot do:** export. Deliberately — beta users work with us on the workflow
before the product can produce a file.

**Cohort:** ~30 users across the six personas, recruited for willingness to
report friction rather than for enthusiasm.

### M3 — Public 1.0 (end of Phase 3)

**Can do:** a complete project, `G0` through `G7`, exported to DOCX or ODT, with
onboarding and the Workshop.

**Tiers:** Free and Scholar. Free is fully capable with local models
(`11` §7).

**Surfaces:** Workbench only. No Console, no sync, no Vault.

That is a defensible 1.0: the product does one thing completely rather than
several things partially.

### M4 — 1.5 (end of Phase 4)

Vault, discovery, Console, sync. The product becomes multi-device and gains its
long-term memory.

### M5 — 2.0 (end of Phase 5)

Plugins, the Foundry, institutional tiers. The product becomes a platform.

---

## 4. What each phase delivers, and why then

### Phase 0 — Foundations (2 months)

Kernel process, encrypted store, event log, snapshots, crypto and key hierarchy,
capability system, IPC.

**Why first:** everything sits on it, and it is the layer where mistakes are most
expensive to correct. Nothing user-visible ships.

### Phase 1 — The honest editor (4 months)

Workbench shell with the panel system · CDM and the editor · **the Provenance
Ledger** · **the Warden** · the Gateway with local and cloud providers · the AI
Setup Wizard.

**Why now:** the two irreversible architectural bets (`P1` provenance, `P3`
egress control) are proved here. The editor is the highest-risk build and gets
the most time.

**Deliberately excluded:** anything academic. Building output types before the
editor works would produce a workflow around an editor that then needs replacing.

### Phase 2 — The academic workflow (4 months)

Atlas with 24 output types · intake generation · the gate model and Conductor ·
source upload, ingestion, and the approval queue · the Rubric with extraction and
continuous evaluation · the drafting pipeline and the first agent cohort.

**Why now:** this is the product's actual value. It requires Phase 1's editor and
Ledger to exist, and nothing else.

**Discovery is excluded** and lands in Phase 4 — approval must be proven with
user-uploaded sources before we add a firehose to it.

### Phase 3 — Complete the loop (3 months)

Export (DOCX, ODT, PDF) · compliance reporting · the export integrity gate ·
authorship reports and optional disclosure · onboarding and the Workshop ·
language refinement.

**Why now:** it makes the product shippable. A user who cannot export has not
completed anything.

### Phase 4 — Memory and reach (3 months)

The Vault with local indexing · literature discovery · the Console · E2E sync.

**Why now:** these are multipliers on a working product rather than parts of it.
The Vault is more valuable once a user has projects to draw it into; the Console
is only meaningful once there is something to review.

### Phase 5 — Platform (4 months)

Plugin runtime · the Foundry and agent release channels · the admin plane ·
institutional tiers · SSO.

**Why now:** extensibility is what makes the catalog scale past what we can
maintain, and institutional features are the growth path (`01` §11). Both
require the security model to be finished.

### Phase 6+ — Depth (ongoing)

Catalog breadth, discipline variants, more agents, reviewer-response workflow,
collaboration (`55` §2), mobile native if warranted.

---

## 5. Deliberate non-goals per phase

Stated so that scope pressure meets a written answer.

| Phase | Will not do | Why |
|---|---|---|
| 0 | Any UI | Foundations are not demonstrable, and pretending otherwise wastes the phase |
| 1 | Output types, sources, compliance | Prove the editor first |
| 2 | Discovery, export | Approval before firehose; workflow before output |
| 3 | Vault, Console, sync | 1.0 is a complete single-device product |
| 4 | Plugins, admin plane | Extensibility needs the security model finished |
| 5 | Real-time collaboration | Conflicts with local-first E2E; a distinct design problem (`55` §2) |

---

## 6. Cadence

| Item | Frequency |
|---|---|
| Desktop release | Every 2 weeks (`stable`), weekly (`beta`), nightly |
| Registry publish | As needed, minutes to effect |
| Agent version | As needed, evaluation-gated |
| Phase review | End of each phase, against exit criteria (`51`) |
| Roadmap revision | Quarterly |

---

## 7. Resourcing assumption

Two to four people (`10` §6). The phase durations assume:

| Role | Phases |
|---|---|
| Platform / kernel | 0, 1, 5 |
| Frontend / editor | 1, 2, 3, 4 |
| Product engineering | 2, 3, 4 |
| Part-time design and academic domain input | throughout |

**If the team is two people, every duration roughly doubles.** The sequencing
does not change — the dependencies in §1 are structural, not resource-driven.

---

## 8. What would change the plan

| Signal | Response |
|---|---|
| Provenance-through-editing proves infeasible at scale (M1) | Stop. Re-architect the editor. This is the product's foundation and there is no version of it without this |
| Rule extraction quality is poor (Phase 2) | Ship with venue profiles and manual entry; extraction becomes a Phase 4 quality push |
| Local models are too weak on baseline hardware (Phase 1) | Adjust default presets toward cloud, keep local as the privacy option, and say so honestly rather than overselling |
| Institutional interest arrives early | Pull SSO and institutional profiles forward from Phase 5; do not pull plugins forward with them |
| A competitor ships provenance tracking | Continue. The workflow, catalog, and compliance engine are the harder half |

---

## 9. Success gates

Each release must clear these before the next phase starts.

| Milestone | Gate |
|---|---|
| M1 | Provenance survives a 150k-word editing session; egress-path architectural test passes; editor latency < 50 ms |
| M2 | 30 beta users complete `G0`–`G4`; zero citations to unapproved sources; median time-to-first-draft < 90 min |
| M3 | Offline end-to-end test passes; exported DOCX opens cleanly in all three targets; onboarding completion ≥ 70% |
| M4 | Vault search < 800 ms at 5,000 documents; sync conflicts never lose data; Console Lighthouse ≥ 90 |
| M5 | Plugin sandbox escape tests pass; two-plane isolation verified; agent promotion gated by evaluation |
