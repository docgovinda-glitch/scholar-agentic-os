# Roadmap

> **Doc ID:** 50 · **Status:** Design · **Revision:** 2 (website-only)

The release arc. Phase-level work breakdown is in `51`; this explains what
lands when and why that order.

---

## 1. What revision 2 changed

Revision 1 planned a desktop application over roughly 20 months, with the first
public release at month 13. Website-only removes the entire foundations phase —
no local kernel, no encrypted local store, no capability system before anything
user-visible, no cross-platform installer pipeline — and lets the existing
codebase carry forward rather than be replaced.

| | Revision 1 | Revision 2 |
|---|---|---|
| First public release | ~13 months | **~7 months** |
| Phases before user-visible work | 1 (2 months) | 0 |
| Existing code reused | Little | Most |
| Surfaces to build | 3 | 2, sharing a codebase |

---

## 2. Sequencing logic

Three dependencies drive the order:

1. **Approval before discovery.** Building discovery first creates pressure to
   let results flow into the corpus. The approval queue exists before anything
   fills it — this is what makes fabricated citations structurally impossible
   rather than merely discouraged.
2. **The Warden before any provider call.** An egress boundary added later is an
   egress boundary with bypasses.
3. **Editor before Studio.** The Language & Voice Studio operates on document
   spans and needs a document model to operate on.

Everything else is sequenced by user value, and the Studio is pulled as early as
its dependencies allow because it is the product's differentiator.

---

## 3. The arc

| | Theme | Duration | Ships |
|---|---|---|---|
| **Phase 1** | Foundation and editor | 2 months | Restructured services, auth, Desk shell, editor, Gateway, Warden |
| **Phase 2** | The academic workflow | 3 months | Atlas, gates, sources with approval, Rubric, drafting |
| **Phase 3** | Voice and output | 2 months | **The Studio**, export, onboarding — **public 1.0** |
| **Phase 4** | Reach | 2 months | Pocket, discovery, Vault |
| **Phase 5** | Platform | 3 months | Plugins, Foundry, admin plane, institutional tier |
| **Phase 6+** | Depth | ongoing | Catalog breadth, collaboration, advanced agents |

**First public release at the end of Phase 3, roughly month 7.**

---

## 4. Milestones

### M1 — Internal alpha (end of Phase 1)

**Can do:** write in a browser-based editor with AI assistance, with egress
controlled and visible.

**Cannot do:** anything academic. No output types, no sources, no compliance.

**Purpose:** prove the editor and the egress boundary before building on them.

### M2 — Private beta (end of Phase 2)

**Can do:** create a project from an output type, establish requirements, approve
sources, agree a structure, draft sections bound to evidence.

**Cannot do:** refine language, or export.

**Cohort:** ~30 users across the personas, recruited for willingness to report
friction. **At least a third must be second-language writers** — they are the
primary user of the feature landing next, and their input shapes Phase 3.

### M3 — Public 1.0 (end of Phase 3)

**Can do:** a complete project, `G0` through `G7`, with the full Language & Voice
Studio, exported to DOCX or ODT.

**Surfaces:** Desk only. Pocket ships in Phase 4.

**Tiers:** Free and Scholar.

A defensible 1.0: it does one thing completely.

### M4 — 1.5 (end of Phase 4)

Pocket, discovery, and the Vault. The product becomes usable from a phone and
gains long-term memory.

### M5 — 2.0 (end of Phase 5)

Plugins, Foundry, institutional tiers. The product becomes a platform.

---

## 5. What each phase delivers, and why then

### Phase 1 — Foundation and editor (2 months)

Restructure the existing Express server into API and service tiers · auth,
sessions, MFA · the Desk region shell · the CDM and editor · autosave and
recovery · the Gateway with multiple providers · **the Warden** · the AI
provider setup flow.

**Why first:** the editor and the egress boundary are the two things everything
else sits on. Both are hard to retrofit.

**Reuses:** the React client, Express server, Supabase auth, and provider
failover that already exist.

### Phase 2 — The academic workflow (3 months)

Atlas with 24 output types · intake generation · the gate model · source upload
and ingestion · **the approval queue** · the Rubric with extraction and
continuous evaluation · the drafting pipeline · agents AG-01 to AG-16.

**Why now:** this is the product's substance and it needs only Phase 1.

**Discovery is excluded**, deliberately, until approval is proven with uploaded
sources.

### Phase 3 — Voice and output (2 months)

**The Language & Voice Studio in full**: five levels, voice profiles, L1 support,
explanatory mode, meaning verification, the diff · export to DOCX, ODT, PDF ·
onboarding and the Workshop · optional Writing History · agents AG-17 to AG-24.

**Why now:** it makes the product shippable, and the Studio is what people will
tell each other about.

### Phase 4 — Reach (2 months)

**Pocket** in full, including the approval queue and refinement review · PWA with
share target and push · literature discovery · the Knowledge Vault.

**Why now:** Pocket needs a working product to be a companion to. Discovery needs
a proven approval queue.

### Phase 5 — Platform (3 months)

Plugin runtime · Foundry with agent release channels · admin plane with two-plane
isolation · institutional tier with SSO and institution profiles.

### Phase 6+ — Depth

Catalog breadth, discipline variants, reviewer-response workflow, remaining
export formats, collaboration.

---

## 6. Deliberate non-goals per phase

| Phase | Will not do | Why |
|---|---|---|
| 1 | Output types, sources, compliance | Prove the editor and egress first |
| 2 | Discovery, export, Studio | Approval before firehose; workflow before polish |
| 3 | Pocket, Vault | 1.0 is a complete single-surface product |
| 4 | Plugins, admin plane | Extensibility after the product works |
| 5 | Real-time collaboration | A distinct design problem (`55` §2) |

---

## 7. Cadence

| Item | Frequency |
|---|---|
| Production deploy | Continuous; several times weekly |
| Feature flag changes | Immediate |
| Agent version | As needed, evaluation-gated |
| Phase review | End of each phase, against exit criteria |
| Roadmap revision | Quarterly |

Continuous deployment is one of website-only's largest gains: no version
fragmentation, no installer pipeline, no users stranded on an old build during a
four-year doctorate.

---

## 8. Resourcing

Two to four people. Phase durations assume:

| Role | Phases |
|---|---|
| Full-stack / services | 1, 2, 5 |
| Frontend / editor | 1, 2, 3, 4 |
| Product engineering | 2, 3, 4 |
| Part-time design and academic domain input | throughout |

At two people, roughly double every duration. The sequencing does not change.

---

## 9. What would change the plan

| Signal | Response |
|---|---|
| Editor performance inadequate in-browser at length (M1) | Address before Phase 2. Section-scoped loading and virtualisation are the levers |
| Rule extraction quality poor (Phase 2) | Ship with venue profiles and manual entry; extraction becomes a Phase 4 quality push |
| **Studio output does not satisfy second-language beta users (Phase 3)** | **Hold 1.0.** This is the differentiator; shipping it weak wastes the launch |
| Voice matching does not perceptibly work | Ship the five levels without it; voice matching becomes Phase 4 |
| Institutional interest arrives early | Pull SSO and institution profiles forward; do not pull plugins with them |
| Server costs exceed projection | Tighten deterministic-first routing and free-tier caps before reducing capability |

---

## 10. Success gates

| Milestone | Gate |
|---|---|
| M1 | Editor latency < 50 ms at 100k words; no model call bypasses the Warden; autosave loses nothing across forced refresh |
| M2 | 30 beta users complete `G0`–`G4`; **zero citations to unapproved sources**; median time to first structured draft < 90 min |
| M3 | Exported DOCX opens cleanly in Word, LibreOffice, and Google Docs; **Studio satisfaction ≥ 4.5/5 among second-language beta users**; onboarding completion ≥ 70% |
| M4 | Pocket Lighthouse ≥ 90 performance, 100 accessibility; approval queue fully usable at 360 px with a screen reader |
| M5 | Plugin sandbox escape tests pass; two-plane isolation verified; agent promotion gated by evaluation |
