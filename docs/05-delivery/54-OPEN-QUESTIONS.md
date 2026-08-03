# Open Questions

> **Doc ID:** 54 · **Status:** Design · **Depends on:** all

Decisions deliberately deferred, with what each blocks, what would answer it,
and when it must be answered. A question without a deadline is a decision being
avoided.

---

## How to read this

| Field | Meaning |
|---|---|
| **Blocks** | What cannot be built until this is answered |
| **Answer by** | The phase before which a decision is required |
| **Leaning** | Current inclination, recorded so the eventual decision has a starting point |
| **Deciding** | What evidence or event settles it |

---

## OQ-01 — Pricing and tier boundaries

**Blocks:** `REQ-ADM-1` subscription management, billing integration, the
managed-credit design.
**Answer by:** Phase 3 (public 1.0 ships with tiers).

The tier structure in `11` §7 is designed; the prices and the exact boundaries
are not. Specifically: what the Scholar tier costs, whether managed model credits
are included or metered, and where the free tier's project limit sits.

**Constraints already fixed** (`01` §11): free must complete a whole project
with local models; export is never gated; bring-your-own-key works on every tier.

**Leaning:** a single low monthly price for Scholar with a modest credit
allowance, priced so that a student can justify it against a single
proofreading fee.

**Deciding:** beta willingness-to-pay signals; the actual cost of managed credits
under real usage.

---

## OQ-02 — Kernel implementation language

**Blocks:** Phase 0 in its entirety.
**Answer by:** before Phase 0 starts. **This is the most urgent question here.**

Rust or TypeScript-on-Node for the Kernel process (`40` §10).

| | Rust | TypeScript/Node |
|---|---|---|
| Memory footprint | Much better against the 8 GB baseline | Worse |
| Memory safety in the trusted process | Strong | Weaker |
| Shared domain logic with the Console | None — duplicate implementations | Full reuse |
| Existing code reuse | None | Citation, document, and project logic already exists |
| Team velocity | Lower initially | Higher |
| WASM plugin host | Natural | Workable |

**Leaning:** Rust for `kernel/*` and `platform/*`; TypeScript for `domain/*`
compiled to WASM so it is shared with the Console. This gets memory safety where
it matters and reuse where it pays, at the cost of a more complex build.

**Deciding:** a two-week Phase 0 spike measuring footprint and build complexity
for the hybrid against pure TypeScript.

---

## OQ-03 — Sync protocol: snapshot-merge or CRDT

**Blocks:** Phase 4 sync; constrains future collaboration.
**Answer by:** Phase 4.

`44` §5.4 leans snapshot-and-merge for v1: simpler, adequate for single-user
multi-device, and does not commit the data model prematurely.

The cost is that real-time collaboration (`55` §2) would likely need CRDTs, and
retrofitting them onto a snapshot model is expensive.

**The complication:** the Ledger is append-only and merges by union regardless,
so provenance is unaffected by this choice. The question is only about draft
text.

**Leaning:** snapshot-merge for v1, with the CDM designed so a CRDT layer could
be introduced without changing the document model.

**Deciding:** whether collaboration lands within two years of 1.0. If it will,
paying the CRDT cost early is cheaper.

---

## OQ-04 — LaTeX support scope

**Blocks:** `REQ-EXP-4`; sets expectations for STEM users.
**Answer by:** Phase 6.

Three levels: (a) export `.tex` + `.bib` for users who continue in LaTeX —
currently specified (`33` §6.5); (b) import from LaTeX; (c) LaTeX as a first-class
authoring surface.

(c) is effectively a different product and conflicts with the provenance model —
provenance over LaTeX source is a distinct and harder problem than provenance
over a structured document model.

**Leaning:** (a) in Phase 6, (b) if demand warrants, (c) never.

**Deciding:** the proportion of beta users in LaTeX-dominant fields
(mathematics, physics, theoretical CS) and whether they can work from DOCX.

---

## OQ-05 — Handwriting recognition approach

**Blocks:** `REQ-VLT-2` handwritten notes; part of Phase 4.
**Answer by:** Phase 4.

Handwritten lab notes and lecture notes are explicitly in scope for the Vault.
Local handwriting OCR is substantially harder than printed OCR, and quality
varies enormously by handwriting.

Options: local model only (private, weaker); Warden-gated cloud OCR with explicit
consent (better, but sends images of the user's notes); or ship image storage and
search-by-metadata without transcription.

**Leaning:** local first, with an explicit opt-in cloud path for users who
accept the trade-off, and honest quality expectations either way.

**Deciding:** measured accuracy of available local handwriting models on real
academic notes.

---

## OQ-06 — Retraction data sourcing

**Blocks:** `REQ-SRC-6` authenticity evidence; Vault retraction monitoring.
**Answer by:** Phase 2.

Retraction status is a headline authenticity signal. Crossref carries retraction
metadata; the Retraction Watch database has broader coverage with licensing
considerations.

**The rule already fixed:** "retraction database unreachable" must never be
reported as "not retracted" (`42` AG-06 QA).

**Leaning:** Crossref as the primary open source, supplemented where licensing
permits, with coverage limits stated in the UI.

**Deciding:** licensing terms and measured coverage against a sample of known
retractions.

---

## OQ-07 — Agent improvement feedback mechanism

**Blocks:** `REQ-AI-8`; Foundry feedback loop.
**Answer by:** Phase 5.

`41` §11 fixes the constraints: no training on user content, opt-in feedback,
operator-reviewed configuration changes. What is undecided is the mechanism —
what a user submits when a suggestion is bad, and how that reaches a golden set
without carrying content.

Options: a structured rating with no content; a rating plus a user-reviewed
excerpt; or purely aggregate signals with no submission at all.

**Leaning:** aggregate signals by default, plus an explicit "report this
output" flow where the user sees and edits the exact payload before sending.

**Deciding:** whether aggregate signals alone are enough to diagnose regressions
in practice during Phase 2–4.

---

## OQ-08 — Institution profile distribution

**Blocks:** institution profiles (`14` §11); Phase 5 institutional tier.
**Answer by:** Phase 5.

Who authors and maintains the profile that encodes a university's thesis
regulations? Options: we curate the largest institutions; institutions author
their own under their licence; or the community contributes via plugins with
review.

Each has a maintenance-burden and a correctness-liability profile, and a wrong
institution profile is `RISK-18` at scale.

**Leaning:** institutions author their own (they have the authority and the
incentive), we curate a small set of the largest as examples, and community
contributions are permitted through the reviewed plugin path.

**Deciding:** whether early institutional customers will actually maintain their
profiles.

---

## OQ-09 — Institutional policy enforcement model

**Blocks:** `REQ-SEC-8` MFA enforcement; `32` §11 policy expression.
**Answer by:** Phase 5.

How far can an institution's policy reach into a user's workspace? MFA
enforcement is uncontroversial. AI policy enforcement (`32` §11) is harder: what
happens when a student's personal project sits in an institutional workspace, and
what happens when they disagree with the policy?

**Boundaries already fixed:** policy must be visible to the user; institutions
never receive documents or reports automatically; escrow requires a visible
indicator.

**Leaning:** policy applies per-workspace, is always visible, and a user may
create a personal workspace outside institutional control — with the institution
able to see that institutional work must live in the institutional workspace.

**Deciding:** institutional customer requirements, tested against `RISK-11`.

---

## OQ-10 — Default local model

**Blocks:** AI Setup Wizard defaults; free-tier quality.
**Answer by:** Phase 1.

Which model the Wizard recommends first on a baseline machine. It sets the
quality impression for every free user and directly affects `RISK-05`.

**Leaning:** the strongest 7–8B instruction-following model that fits comfortably
in 8 GB, re-evaluated each release rather than fixed — the registry design
(`41` §3.2) exists partly so this can change without a client release.

**Deciding:** measured performance on the agent golden sets at baseline hardware.

---

## OQ-11 — Console rendering for export

**Blocks:** `REQ-EXP` on the Console (`20` §6).
**Answer by:** Phase 4.

The capability matrix permits Console export for synced projects. But rendering
DOCX server-side means the server briefly handles plaintext, which contradicts
`44` §2.

Options: refuse Console export entirely; render in the browser from synced,
client-decrypted content; or accept a consented server-side path.

**Leaning:** browser-side rendering from client-decrypted content. It preserves
the guarantee, at the cost of a second implementation of the DOCX writer —
which the WASM-compiled `domain/*` decision in `OQ-02` would make cheaper.

**Deciding:** `OQ-02`'s outcome, and whether WASM export performance is
acceptable in a browser.

---

## OQ-12 — What happens to a project when a plugin is uninstalled

**Blocks:** `47` §6 lifecycle detail.
**Answer by:** Phase 5.

`47` §6 states that contributed content is preserved as a frozen copy so
projects do not break. The detail is undecided: does a frozen output type still
receive the plugin's future updates if reinstalled, and how is a divergence
between the frozen copy and the plugin's current version presented?

**Leaning:** frozen copies are inert; reinstalling offers an upgrade with a
visible diff, exactly as output type versioning works (`45` §8.2).

**Deciding:** implementation experience in Phase 5.

---

## Questions that are closed

Recorded so they are not silently reopened.

| Question | Answer | Where |
|---|---|---|
| Should AI disclosure be mandatory? | No — optional, user-editable, generated from fact | `32` §9.2 |
| Should we offer detection evasion? | No, permanently | `01` §5, `32` §6.1 |
| Should we produce a plagiarism similarity score? | No — attribution findings only | `32` §10.2 |
| Should the Console replicate the Workbench? | No | `20` §6, `23` §2 |
| Should refinement lower the authorship ratio? | No | `32` §5.3 |
| Should the operator be able to read user content for support? | No | `49` §3, `49` §7 |
| Should institutions receive authorship reports automatically? | No | `32` §11, `49` §9 |
| Can users bulk-approve sources? | No — bulk reject only | `12` F-SRC-3 |
| Can users mark all spans reviewed at once? | No | `32` §6.4 |
| Is the Knowledge Vault required? | No — architecturally optional | `43` §1.1 |
| Do we train on user content? | Never | `01` §5, `41` §11 |

---

## Review

Open questions are reviewed at every phase review. A question past its
"answer by" phase without a decision blocks that phase review — which is the
mechanism that stops deferral becoming avoidance.
