# 03 — Product Definition

> **Revised 2026-08-01** for the product revision requirements. Where this
> document conflicts with them, [11 — Requirements Conflict Analysis]
> (./11-requirements-conflicts.md) is authoritative. See also documents
> 12–21 for the product and system design they specify.

What this software *is*, derived from what it does. Product claims made in
prior documents were not used as input.

---

## What exists today

`[INFERRED]` **A guided, browser-local production line that takes a doctoral
researcher from raw thesis material to a journal-submittable manuscript
package, and refuses to let them skip the steps that get papers desk-rejected.**

That reading comes from three observations, not from any stated vision:

1. `[OBSERVED]` The workflow is a fixed, gated sequence — `WORKFLOW_PHASES`
   A–I with G1/G2 sub-phases, enforced by `phaseGating.ts`. The product has an
   opinion about order and applies it.
2. `[OBSERVED]` Phase B is `Grounding`, described in code as "Anchor paper draft
   in doctoral thesis", and `PaperProject` carries `dissertationMaterials`. The
   assumed starting point is an existing thesis, not a blank page.
3. `[OBSERVED]` The terminal phases produce a *submission pack* — cover letter,
   checklist, compliance summary, reviewer-response scaffolding — not just a
   document.

`[INFERRED]` The centre of gravity is the **transition from thesis to
publication**. That is a narrower and more specific product than "AI research
assistant".

---

## Who it serves

`[INFERRED]` **A PhD candidate or early-career researcher converting completed
doctoral work into journal articles.** Evidence:

- `[OBSERVED]` `dissertationMaterials`, `styleAspiration`, `orcidId`,
  `authorAffiliation`, and a parallel `coAuthor*` set — the metadata of formal
  academic authorship.
- `[OBSERVED]` `targetJournal`, `preferredJournalScope`, `complianceRules`,
  `targetReferenceCount` — journal-directed, not coursework-directed.
- `[OBSERVED]` Six citation styles including Vancouver and IEEE — medical and
  engineering publishing, not undergraduate essays.
- `[OBSERVED]` Provider options are dominated by free tiers and local runners
  (Gemini "generous free tier", Groq "usable free tier", Ollama, LM Studio).

`[INFERRED]` The last point implies a **cost-constrained** user. Combined with
the browser-local architecture — which eliminates per-user server cost — the
implied user cannot or will not pay much, and the system is built so they don't
have to.

`[ASSUMPTION]` Institutional context could not be determined from code. There
is no LMS integration, no supervisor role, no cohort or department model. The
system treats the researcher as an individual actor.

---

## The problem it actually solves

`[INFERRED]` **Process failure, not writing ability.**

The system's distinctive machinery is not text generation — it is refusal:

- `[OBSERVED]` Unapproved sources cannot enter AI context or a bibliography
  (four call sites filtering `status === "approved"`).
- `[OBSERVED]` Export will not emit AI-use disclosure unless the user has
  explicitly confirmed it (`confirmedAt`), and every export routes through that
  gate.
- `[OBSERVED]` Phases cannot be entered out of order.

`[INFERRED]` A tool built primarily to *write* would not implement any of
these. These exist to stop a specific category of failure: submitting work that
is unsupported by approved evidence, undisclosed in its AI use, or assembled
out of order. That is a **compliance and integrity** product wearing a writing
tool's clothes.

---

## What it fails to solve

`[OBSERVED]` **Working across devices.** No server-side project storage. A
student on a laptop and a lab machine has two disjoint universes.

`[OBSERVED]` **Working with anyone else.** No supervisor, co-author, or
reviewer role exists in the data model. `coAuthor*` fields are *metadata about*
a co-author, not an account. The collaboration kernel was deleted.

`[INFERRED]` **Per-claim citation integrity.** `sections: Record<string,
string>` cannot anchor a citation to a sentence, so the system can count
references but cannot verify that a given claim is supported by the source
attached to it.

`[INFERRED]` **Paragraph-level AI provenance.** Disclosure is asserted at
document level. The regime that publishers are moving toward — *which parts*
were AI-assisted — is not expressible in the current model.

`[OBSERVED]` **Literature discovery at competitive depth.** Discovery exists
(`data-discovery`, `journal-discovery`, arXiv/WHO/IMF/search proxies) but
against a handful of sources. Competitors index 100M+ papers.

---

## Capabilities that already exist

`[OBSERVED]`

| Capability | Substance |
|---|---|
| Real document export | OOXML via `docx`; selectable-text PDF via `pdfmake` |
| Six citation styles | APA 7, IEEE, MLA 9, Chicago, Harvard, Vancouver, behind a registry |
| Reference import | BibTeX and RIS → `CanonicalReference` |
| Document ingestion | PDF, DOCX, TXT, Markdown + heading detection |
| 39 AI backends | 28 cloud catalog entries + 11 local runners, one definition, both tiers |
| Encrypted key vault | Device-bound or passphrase, with backup/restore |
| Provider failover | Error-kind classified, not blanket retry |
| Unlimited local storage | IndexedDB with `localStorage` fallback and migration |
| Offline capability | PWA assets; local runners mean AI works offline too |
| Seven research agents | Planner, literature, gap, question, methodology, statistics, integrity |
| Compliance gates | Source approval, AI-use disclosure, phase gating |

---

## Which features carry real value

`[INFERRED]` Ranked by *defensibility* — how hard to replicate, weighted by how
much a user would miss it:

**1. The AI-use disclosure gate.** Small in code, large in value. Every major
publisher now mandates disclosure, in a specific place, with specific wording.
This implements that, and gates export on it. Competitors treat AI use as
something to hide; this treats it as something to declare correctly.

**2. Approved-sources-only enforcement.** Structurally prevents the failure
mode that most damages AI-assisted academic work — text supported by sources
the author never vetted. Four independent call sites, not one.

**3. Real export fidelity.** Unglamorous, frequently done badly, and the point
at which a manuscript either is or is not submittable.

**4. Local-model support.** Ollama, LM Studio, custom endpoints — a
cost-constrained or confidentiality-constrained researcher can run entirely
offline. Rare among competitors.

**5. Six citation styles with a canonical model.** Real breadth. Under-tested,
which is a defect, not a value judgement.

---

## Which features add unnecessary complexity

`[INFERRED]`

**`src/ai/` (6,086 lines, 2 tests).** Duplicates the live provider layer.
Carries `benchmark`, `discovery`, `hardware`, `quota`, `cache`, `telemetry`
sub-packages, none reachable from the UI. Its cost is not the lines — it is
that every provider change now has two plausible homes.

**The duplicated submission suite.** Two cover-letter editors and two
checklists render in the same tab. Pure negative value.

**`src/research/` (2,173 lines, 1 test).** Overlaps the agents/skills layer:
`literature`, `methodology`, `novelty`, `evidence`, `roadmap` mirror agents of
the same names.

**Agents *and* skills as separate registries.** Justified only if agents
compose multiple skills. Near one-to-one mapping today.

---

## The product in one sentence

`[INFERRED]`

> **A zero-backend-cost, offline-capable manuscript production line that turns
> a finished thesis into a submittable journal package, and enforces the
> evidence-approval and AI-disclosure rules that publishers now require —
> rather than generating text and leaving compliance to the author.**

The compliance clause is the product. Everything before it is the delivery
mechanism.

---

## The strategic tension

`[INFERRED]` The codebase is pulled between two products:

- **A** — a *research assistant*: discovery, summarisation, drafting. This is
  where `src/ai`, `src/research`, and the agent layer point. It is a crowded
  market with far better-funded incumbents (see [04](./04-market-position.md)).
- **B** — a *submission-integrity system*: gates, disclosure, compliance,
  export fidelity. This is where the working, tested, live code points.

`[OBSERVED]` The evidence favours B being real and A being aspirational: the
gates are wired and tested; `src/ai` is 2/37 tested and unreachable.

`[RECOMMENDATION]` Choose B explicitly. Product A is competing with Elicit,
Consensus, and SciSpace on corpus size — a fight this system cannot win. Product
B has no serious incumbent and is already half-built here.
