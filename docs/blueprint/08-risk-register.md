# 08 — Risk Register

> **Revised 2026-08-01** for the product revision requirements. Where this
> document conflicts with them, [11 — Requirements Conflict Analysis]
> (./11-requirements-conflicts.md) is authoritative. See also documents
> 12–21 for the product and system design they specify.

What can kill this, and the observable signal that says it is happening.

`[RECOMMENDATION]` Every risk carries an **early-warning signal** — something
observable before the damage is irreversible. A risk without a signal is a
worry, not a managed risk.

Scoring: Likelihood × Impact, each Low/Medium/High. Assessed against the
strategy in [04](./04-market-position.md) and [05](./05-target-blueprint.md).

---

## Strategic

### R-01 · The disclosure wedge is not valued · **High × High**

`[ASSUMPTION]` The entire strategy rests on users treating AI disclosure as an
obligation to discharge *correctly* rather than a box to tick carelessly. This
is unvalidated.

`[OBSERVED — external]` 74% of UK postgraduates used AI in thesis writing; only
31% received clear guidance. `[INFERRED]` That gap is consistent with either
reading — unmet demand for help, or widespread indifference.

**Signal:** in Stage 1 instrumentation, users who reach the disclosure gate and
abandon, or who confirm in under two seconds without reading.

**Mitigation:** Stage 1 of [07](./07-roadmap.md) validates before Stage 2
spends heavily. `[RECOMMENDATION]` If contradicted, revisit
[03](./03-product-definition.md) before proceeding — do not push through.

### R-02 · An incumbent adds disclosure · **Medium × High**

`[INFERRED]` Nothing stops SciSpace or Paperpal shipping a disclosure
generator. They have corpus, distribution, and funding advantages.

**Signal:** any of Elicit, Consensus, SciSpace, Paperpal shipping
publisher-specific compliance output.

**Mitigation:** `[RECOMMENDATION]` The feature is not the moat — the maintained
per-venue rule set plus per-claim provenance is. Prioritise Stage 2, which is
much harder to copy than a template. `[INFERRED]` Their marketing position
also disincentivises foregrounding "declare your AI use", which buys time but
is not a defence.

### R-03 · Thesis-to-publication is too narrow · **Medium × High**

`[ASSUMPTION]` [03](./03-product-definition.md) reads the product as serving
PhD candidates converting doctoral work into journal articles. Whether that
segment alone reaches 100,000 users is unknown.

**Signal:** Stage 1 research showing users arriving without a completed thesis,
i.e. the assumed starting point is wrong.

**Mitigation:** `[RECOMMENDATION]` The compliance layer generalises to any
venue with rules — grant applications, institutional theses, conference
submissions. Widen via rule packs, not new products.

### R-04 · Institutional angle is unvalidated · **Medium × Medium**

`[OBSERVED]` No LMS integration, supervisor role, cohort, or department model
exists. `[ASSUMPTION]` [04](./04-market-position.md) proposes institutions as
the route to scale on no code evidence.

**Signal:** institutional pilots stalling on procurement or on the absence of
supervisor visibility.

**Mitigation:** validate in Stage 1. `[RECOMMENDATION]` Do not build
integration before a named institution asks.

---

## Architectural

### R-05 · Stage 2 migration corrupts provenance · **Medium × High**

`[OBSERVED]` Existing manuscripts are `Record<string, string>` with no
provenance.

`[INFERRED]` If migration marks pre-existing text `human` rather than
`unknown`, every migrated project carries a false audit trail — in a product
whose value *is* the audit trail. Unrecoverable, because there is no evidence
to reconstruct from.

**Signal:** any migration design that assigns authorship it cannot evidence.

**Mitigation:** `[RECOMMENDATION]` `authorship: unknown` is mandatory for
pre-migration content. An honest gap is recoverable; a false record is not.

### R-06 · Rebuilding the orchestrator unused · **Medium × Medium**

`[OBSERVED]` ~5,500 lines of workflow engine, scheduler, queue, dependency
resolver, retry manager, and failure recovery were written, never wired to any
consumer, and deleted in `4afb6c8`.

`[INFERRED]` The same pull exists again — [06](./06-architecture-spec.md)
specifies persisted runs, which is where that build started last time.

**Signal:** orchestration code growing faster than the consumers calling it.

**Mitigation:** `[RECOMMENDATION]` Build only against a live consumer. A
CI-enforced check that every orchestration module has a non-test importer.

### R-07 · A fourth provider abstraction · **Medium × Medium**

`[OBSERVED]` Three exist. Nothing structural prevented the second or third.

**Signal:** any new module owning a provider registry, health check, or routing.

**Mitigation:** `[RECOMMENDATION]` The registry-uniqueness test in
[05](./05-target-blueprint.md). A convention that is not checked is not a rule
— that is precisely how three arose.

### R-08 · Sync erodes the privacy position · **Low × High**

`[INFERRED]` Zero-knowledge sync is materially harder than plaintext sync. The
pressure to "just store it server-side for now" will be real, and it would
forfeit both the privacy story and the zero-per-user-storage-cost property that
makes 100k users viable.

**Signal:** any design in which the server can read manuscript content.

**Mitigation:** `[RECOMMENDATION]` Treat "server never holds plaintext" as an
invariant with a test, not a preference.

---

## Operational

### R-09 · Managed AI cost runs away · **High × Medium**

`[OBSERVED]` Server-held `GEMINI_API_KEY`; `src/ai/quota` exists but is
unreachable from the live path. No per-user cap.

`[INFERRED]` Cost scales linearly with users, with no enforcement point.

**Signal:** provider spend rising faster than active users.

**Mitigation:** `[RECOMMENDATION]` Wire quota before any growth push. Managed
mode is a capped trial; BYOK or local is the default.

### R-10 · Rate limits fail open under scaling · **Medium × Medium**

`[OBSERVED]` Four in-process `rateLimit` configurations. They reset on deploy
and do not coordinate across instances.

`[INFERRED]` Adding a second instance silently doubles the effective limit —
it fails open and quietly, which is the dangerous shape.

**Signal:** abuse patterns appearing only after horizontal scaling.

### R-11 · Single-device loses users before sync ships · **High × Medium**

`[OBSERVED]` No server-side project storage.

`[INFERRED]` A researcher working across a laptop and a lab machine cannot use
this for its primary purpose — a hard blocker discovered *after* investment,
which is worse than a missing feature discovered early.

**Signal:** support requests or churn citing device switching.

**Mitigation:** `[RECOMMENDATION]` State the limitation prominently in-product
now. Stage 3 fixes it; honesty until then costs less than surprise.

### R-12 · Data loss from cleared browser storage · **Medium × High**

`[OBSERVED]` IndexedDB with `localStorage` fallback; no server copy.

`[INFERRED]` Clearing browser data destroys work with no recovery path. For a
multi-year thesis this is catastrophic and entirely plausible.

**Signal:** any report of lost projects.

**Mitigation:** `[RECOMMENDATION]` Prominent export/backup before Stage 3.
`[OBSERVED]` `apiVault.ts` already implements backup/restore for keys — the
same treatment is needed for projects.

---

## Compliance

### R-13 · Venue rules drift and go stale · **High × High**

`[OBSERVED — external]` Publisher AI policies changed materially during 2025–26
and continue to diverge.

`[INFERRED]` A stale rule pack produces *confidently wrong* compliance output —
worse than no guidance, because the user trusts it. This is the failure mode
that would most damage the product's credibility.

**Signal:** rule packs whose `effectiveFrom` has not moved while the publisher's
policy page has.

**Mitigation:** `[RECOMMENDATION]` `effectiveFrom` versioning is already in
[06](./06-architecture-spec.md). Add provenance per rule pack — source URL and
review date — and surface staleness to the user rather than hiding it.

### R-14 · Over-claiming compliance · **Medium × High**

`[INFERRED]` If the product implies "this manuscript is compliant" rather than
"these checks passed", it assumes liability it cannot discharge — journal
requirements exceed anything checkable here.

**Signal:** UI copy asserting compliance rather than describing checks.

**Mitigation:** `[RECOMMENDATION]` Gates report *what was checked*. The author
remains responsible — which is exactly what COPE and ICMJE require, so the
honest framing is also the compliant one.

---

## Process

### R-15 · Documentation drifts again · **High × Medium**

`[OBSERVED]` This document set exists because the previous one described seven
deleted modules as present and cited a deleted file as the source of the
product's headline model.

**Signal:** any structural claim in this set that no longer matches the code.

**Mitigation:** `[RECOMMENDATION]` Every claim here is tagged and traceable to
a reproducible command. `[RECOMMENDATION]` Consider CI checks for the cheap
mechanical ones — module existence, test counts.

### R-16 · Red CI normalised · **Medium × Medium**

`[OBSERVED]` Multiple commits merged with failing CI because `npm run lint` is
stricter than `npm run build` and was not run locally.

`[INFERRED]` Once red CI is normal, it stops carrying information.

**Signal:** more than one consecutive red commit on `main`.

**Mitigation:** `[RECOMMENDATION]` Required status check plus pre-commit hook —
Stage 0 of [07](./07-roadmap.md).

---

## Revision-driven risks

Introduced by the scope in [11](./11-requirements-conflicts.md) and documents
12–21.

### R-17 · Breadth dilutes the product · **High × Medium**

`[INFERRED]` Four degree levels and a dozen-plus output types
([14](./14-output-catalog.md)) is a far wider surface than the original
single-workflow product. The failure mode is a system that serves every level
adequately and none well.

**Signal:** completion rates diverging sharply by degree level; support load
concentrated in one segment.

**Mitigation:** `[RECOMMENDATION]` C-01's resolution — depth stays in the
engine, breadth lives in rule packs and output definitions, which are editorial
work. If breadth starts requiring *engine* changes per level, the resolution has
failed and should be revisited.

### R-18 · Two clients diverge · **High × High**

`[OBSERVED]` The repository already contains five duplicated-concept failures
because nothing prevented a second implementation. Two independent clients
multiply that risk structurally.

`[INFERRED]` The specific danger is gate divergence: a manuscript that passes on
desktop and fails on web destroys trust in the compliance claim, which is the
product.

**Signal:** any gate-parity test failure; any capability appearing in one client
without an entry in the [12](./12-client-strategy.md) §4 register.

**Mitigation:** `[RECOMMENDATION]` Shared domain core as a hard boundary,
gate-parity asserted by test, feature differences declared rather than emergent.

### R-19 · Desktop distribution and update lag · **Medium × Medium**

`[INFERRED]` Web releases are server-controlled; desktop users may run old
versions indefinitely. A publisher policy change must reach users in days, and
a desktop release cycle cannot guarantee that.

**Signal:** version telemetry showing a long tail on old builds; users hitting
rules that changed after their build shipped.

**Mitigation:** `[RECOMMENDATION]` Rule packs version and ship **independently**
of the application ([20](./20-admin-platform.md) §8), with a supported minimum
and in-client upgrade prompts.

### R-20 · Quality commitment drifts toward detector tuning · **Medium × High**

`[RECOMMENDATION]` Humanized output is now a locked product commitment
([C-06](./11-requirements-conflicts.md#c-06--output-quality-and-disclosure-control--resolved-by-owner-decision)),
delivered through voice learning from the author's own writing.

`[INFERRED]` The risk is not the commitment but its drift: when a user asks why
their text still "reads like AI", the shortest path is to start measuring
against a detector. That path is fragile — classifier behaviour changes without
notice, so quality tuned to it degrades silently and the product's central
claim ends up resting on a third party's model.

`[OBSERVED]` The drift has occurred here before: detection-evasion prompt
language was found in `aiService.ts` and removed.

**Signal:** any prompt, test, metric, or roadmap item referencing detection
tools, detector scores, or "undetectable"; any request to benchmark against a
classifier.

**Mitigation:** `[RECOMMENDATION]` The two constraints in
[18](./18-finalisation-export.md) §2 — meaning never altered, no detector
targeting — and no third-party humanizer dependency. `[INFERRED]` Voice learned
from the author is a stable target the product controls; a classifier is not.

### R-24 · Local setup abandonment · **High × Medium**

`[INFERRED]` Local inference is what makes the product free and private — the
two properties the cost-constrained student segment cares about most. A setup
flow that loses users forfeits both, and the users least able to self-serve are
exactly the ones the widened audience adds.

**Signal:** local-setup funnel drop-off; users on managed allowance exhaustion
who do not convert to local or BYOK.

**Mitigation:** `[RECOMMENDATION]` [22](./22-local-setup.md) — capability
detection before recommendation, bundled runtime where possible, honest speed
reporting, and never leaving a user without a working fallback.

### R-25 · Notification channel loses trust · **Medium × Medium**

`[INFERRED]` Admin-pushed notifications ([20](./20-admin-platform.md) §9) are
the only channel for policy-change and security notices. If it carries
marketing or over-sends, users mute it — and the security notices go with it.

**Signal:** rising per-category opt-out rates; falling read rates on
`important` and `critical`.

**Mitigation:** `[RECOMMENDATION]` Operational categories only, per-audience
send caps, confirmation above a threshold, and an opt-out floor that keeps only
critical security notices non-silenceable.

### R-21 · Admin platform erodes the local-first boundary · **Medium × High**

`[INFERRED]` Every conventional admin need — support access, content
moderation, debugging a user's problem — pushes toward reading user data. Each
individually looks reasonable; together they would make the local-first promise
false.

**Signal:** any admin feature request requiring visibility into tier 1 or 2
data; any support process that asks users to send their manuscript.

**Mitigation:** `[RECOMMENDATION]` The explicit "cannot do" table in
[20](./20-admin-platform.md) §10, published as a user-facing guarantee — which
makes erosion a visible broken promise rather than a quiet drift.

### R-22 · Prompt injection through uploaded sources · **Medium × Medium**

`[INFERRED]` The system's core function is feeding user-supplied documents to
inference. A PDF containing text aimed at the model is a realistic vector, and
source volume only grows.

**Signal:** anomalous agent output; instructions appearing in generated text.

**Mitigation:** `[RECOMMENDATION]` Sources are data, never instructions; the
approval gate limits exposure to material a human chose; all output is
reviewed before entering the manuscript. `[INFERRED]` This reduces but does not
eliminate the risk.

### R-23 · Evaluation sandbox becomes a data back door · **Low × High**

`[INFERRED]` Pre-release evaluation ([20](./20-admin-platform.md) §7) needs
realistic fixtures, and the most realistic fixtures are real user manuscripts —
which the architecture promises never to transmit.

**Signal:** any proposal to source evaluation fixtures from user data without
explicit per-user consent.

**Mitigation:** `[RECOMMENDATION]` Synthetic or explicitly consented material
only, stated as a constraint on the sandbox rather than a policy preference.

---

## Top five by exposure

| # | Risk | Score | Why it leads |
|---|---|---|---|
| 1 | R-01 Wedge not valued | H×H | Everything else is predicated on it |
| 2 | R-13 Rule drift | H×H | Confidently wrong output destroys trust |
| 3 | R-05 Provenance corruption | M×H | Unrecoverable; damages the core asset |
| 4 | R-12 Data loss | M×H | Catastrophic per user; plausible today |
| 5 | R-09 AI cost runaway | H×M | Threatens viability at the target scale |

`[RECOMMENDATION]` R-01 and R-13 are addressed by Stage 1; R-05 is a design
constraint on Stage 2; R-09 and R-12 are cheap to mitigate now and should not
wait for their stage.
