# Open Questions

> **Doc ID:** 54 · **Status:** Design · **Revision:** 2 (website-only)

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

## OQ-02 — Editor engine

**Blocks:** Phase 1 editor work.
**Answer by:** before Phase 1 starts. **The most urgent question here.**

The editor must support the CDM, tracked changes, comments, inline suggestion
decorations, and the Studio's per-change diff overlay, at 100k words in a
browser.

Options: build the document model over an existing text engine (ProseMirror,
Lexical, or similar), or build the editing surface from scratch.

**Leaning:** build over an existing engine. The CDM lives above it as our own
structure; the engine handles text layout, selection, and input handling, which
are large and unrewarding to reimplement.

**Deciding:** a two-week spike measuring input latency at 100k words with
tracked changes and decorations active, on the target baseline.

---

## OQ-03 — Vector store

**Blocks:** Phase 4 Vault semantic search.
**Answer by:** Phase 4.

pgvector inside the existing Postgres, or a dedicated vector database.

pgvector keeps the stack small — one database, one backup regime, one thing to
operate, which matters for a team of two to four (`RISK-13`). A dedicated store
performs better past a few million vectors.

**Leaning:** pgvector. At 5,000 documents per user it is comfortably sufficient,
and the operational simplicity is worth more than headroom we may never need.

**Deciding:** measured recall and latency at the `NFR-SCALE-1` target, on
representative hardware.

---

## OQ-04 — LaTeX support scope

**Blocks:** `REQ-EXP-4`; sets expectations for STEM users.
**Answer by:** Phase 6.

Three levels: (a) export `.tex` + `.bib` for users who continue in LaTeX —
currently specified (`33` §6.5); (b) import from LaTeX; (c) LaTeX as a first-class
authoring surface.

(c) is effectively a different product: LaTeX authoring means a source editor,
a compile loop, and package management, none of which the CDM, the Rubric, or
the Studio operate on.

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

Options: a self-hosted recognition model in our service tier; a third-party
vision model via the Warden with explicit consent; or image storage with
metadata search and no transcription.

**Leaning:** self-hosted where quality permits, so handwritten notes do not
leave for a third party. Explicit opt-in to a vision provider where it does not.

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

**Blocks:** `REQ-SEC-8` MFA enforcement; institutional AI policy expression.
**Answer by:** Phase 5.

How far can an institution's policy reach into a user's workspace? MFA
enforcement is uncontroversial. AI policy is harder: what happens when a
student's personal project sits in an institutional workspace, and what happens
when they disagree with the policy?

**Boundaries already fixed:** policy must be visible to the user; institutions
never receive documents or Writing History automatically (`32` §8.4).

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

## OQ-11 — Pocket rendering for export

**Blocks:** `REQ-EXP` on Pocket (`20` §6).
**Answer by:** Phase 4.

The capability matrix permits Pocket export for synced projects. But rendering
DOCX server-side means the server briefly handles plaintext, which contradicts
`44` §2.

Options: refuse Pocket export entirely; render in the browser from synced,
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
| Desktop application? | **No.** Website only, two surfaces | `01` §8 |
| Should Pocket replicate Desk? | No | `20` §6, `23` §2 |
| **Do we optimise output against AI detectors?** | **No, permanently** | `01` §7 |
| **Do we claim output will pass detection?** | **No.** No surface, page, or document may imply it | `02` §9.1 |
| May the UI use the word "humanize"? | Yes, meaning *read naturally and sound like me*. Not in any detection claim | `02` §9.1 |
| Do we measure human-vs-AI authorship? | No. Withdrawn in revision 2 | `32` §8.2 |
| Do we block export on unreviewed AI text? | No. Withdrawn in revision 2 | `32` §8.2 |
| Is Writing History mandatory? | No — off by default, user-owned, blocks nothing | `32` §8.4 |
| Is AI disclosure mandatory? | No — optional, user-editable | `32` §8.5 |
| Do we produce a plagiarism similarity score? | No — attribution findings only | `32` §9 |
| Does refinement have a capped intervention level? | No — level 5 substantially rewrites | `32` §4 |
| Do we train on user content? | Never | `41` §11 |
| Can staff browse user content? | No routine access; break-glass only, with user notification | `44` §4 |
| Do institutions receive student work automatically? | No | `32` §8.4 |
| Can users bulk-approve sources? | No — bulk reject only | `12` F-SRC-3 |
| Is the Knowledge Vault required? | No | `43` §1.1 |

## Review

Open questions are reviewed at every phase review. A question past its
"answer by" phase without a decision blocks that phase review — which is the
mechanism that stops deferral becoming avoidance.
