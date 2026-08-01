# 15 — Evidence Pipeline

Covers revision requirement #4. How material enters the system, how it is
approved, and how provenance is preserved.

`[RECOMMENDATION]` **Governing rule: nothing influences a manuscript until a
human approves it.** `[OBSERVED]` This already holds — four call sites filter
`status === "approved"` before a source reaches AI context or a bibliography.
This document generalises that gate to every intake path, including ones that
do not yet exist.

---

## 1. Intake surfaces

| Source | Handling | Status |
|---|---|---|
| PDFs, papers, books | Parse → text + structure + metadata | `[OBSERVED]` implemented (`pdf-parse`) |
| Word documents | Parse → text + heading structure | `[OBSERVED]` implemented (`mammoth`) |
| Plain text, Markdown | Direct ingest | `[OBSERVED]` implemented |
| Notes | Direct ingest, marked as **user-authored** | `[RECOMMENDATION]` new |
| Spreadsheets (`.xlsx`, `.csv`) | Tabular ingest; schema inferred | `[OBSERVED]` `xlsx` dependency present, not wired to intake |
| Datasets | Registered with schema; **not** sent to inference by default | `[RECOMMENDATION]` new |
| Images, figures | Registered with caption and source; optional OCR/vision description | `[RECOMMENDATION]` new |
| Video links | Transcript retrieval where available; **link + timestamp cited, never invented content** | `[RECOMMENDATION]` new |
| Web URLs | Fetch, extract, snapshot with retrieval date | `[OBSERVED]` partial (`parse-external-link`) |
| DOI / identifier | Resolve to canonical metadata | `[OBSERVED]` implemented (`lookup-doi`) |
| Reference managers | Zotero, Mendeley, BibTeX, RIS | `[OBSERVED]` BibTeX/RIS importers exist |
| Prior drafts | Parse; sections mapped; **authorship marked `unknown`** | `[RECOMMENDATION]` new |
| Research tools | Elicit, Consensus, SciSpace exports | `[RECOMMENDATION]` new — import-first per [C-02](./11-requirements-conflicts.md#c-02--positioning-submission-integrity-vs-full-authoring-assistant) |

`[RECOMMENDATION]` Two intake rules that are easy to get wrong:

- **Prior drafts enter as `authorship: unknown`, never `human`.** `[INFERRED]`
  The system has no evidence about how that text was produced. Recording a
  false provenance corrupts the ledger the product's value rests on (R-05); an
  honest gap is recoverable.
- **Datasets are registered, not ingested into prompts.** `[INFERRED]` Sending
  raw research data to a cloud provider is a confidentiality decision the user
  must make deliberately, not a side effect of uploading a file.

---

## 2. Record structure

Every intake produces one record, regardless of surface:

```
EvidenceRecord
  id, kind, title, authors[], year, identifier?
  origin: upload | url | doi | import:<tool> | proposed:<adapter>
  retrievedAt, sourceLocation
  content: { text?, structure?, tabular?, media? }
  integrity: { hash, snapshotRef? }
  approval: unapproved | approved | rejected
  approvedAt?, approvalNote?
  usedBy: ClaimRef[]
```

`[RECOMMENDATION]` `origin` and `retrievedAt` are mandatory. `[INFERRED]` The
question a reader or examiner asks is *"where did this come from and when"* —
if the record cannot answer it, the provenance claim is decorative.

`[RECOMMENDATION]` `integrity.hash` supports detecting that a cited source
changed after approval — `[INFERRED]` a real failure mode for web sources, and
the reason `snapshotRef` exists.

---

## 3. Proposed sources

When a user's material is insufficient, the system proposes secondary sources
(requirement #4).

### Rules

`[RECOMMENDATION]`

1. **Authenticated sources only.** Real APIs with real identifiers — Crossref,
   arXiv, PubMed, OpenAlex, and institutional endpoints. `[OBSERVED]` Proxy
   Edge Functions for arXiv, WHO, IMF, and search already exist.
2. **Never invented.** A proposal without a resolvable identifier is not
   shown. `[OBSERVED]` This project has already had to remove fabricated
   content once — its own record documents hardcoded fake reviewer comments
   being replaced with honest empty states. Fabricated citations are the
   single most damaging failure an academic tool can produce.
3. **Always `unapproved`.** A proposal is a suggestion, never an addition.
4. **Reason shown.** Each proposal states why it was surfaced — matched
   concept, cited by an approved source, same method — so the user can judge
   rather than defer.
5. **Empty is a valid result.** `[INFERRED]` "No suitable sources found" is
   correct and useful. Padding with weak matches trains users to approve
   without reading, which defeats the gate.

### Sufficiency

`[RECOMMENDATION]` The system flags insufficiency against the output type's
expectations rather than a global threshold — a poster and a PhD thesis have
different needs. Signals: fewer approved sources than the type suggests;
sections with no supporting evidence; claims without support edges; a citation
set clustered in a single year or venue.

`[RECOMMENDATION]` Flag; never auto-fill.

---

## 4. Approval workflow

```
Intake ─→ [unapproved] ─→ user review ─→ approved | rejected
                                              │
                                    usable in AI context,
                                    citations, bibliography
```

`[RECOMMENDATION]` The review surface shows, for each candidate: full metadata,
origin and retrieval date, an extract, why it was proposed if applicable, and
where it would be used.

`[RECOMMENDATION]` Approval is **per project**, not global — including for
Knowledge Vault items ([13](./13-user-journey.md) §4). `[INFERRED]` Approval
means "I vouch for this source in *this* argument," which does not transfer.

`[RECOMMENDATION]` Bulk approval is permitted but recorded distinctly in the
ledger. `[INFERRED]` Approving forty sources in one action is a weaker
attestation than forty individual approvals; the record should reflect that
honestly rather than flatten it.

`[RECOMMENDATION]` Rejection is retained with an optional note — it is evidence
of diligence, and useful when a supervisor asks why something was excluded.

### Revocation

`[RECOMMENDATION]` Un-approving a source already cited surfaces every affected
claim and blocks export until each is re-sourced or removed. `[INFERRED]`
Silently leaving orphaned citations would be the worst possible outcome: the
manuscript would appear supported when it is not.

---

## 5. Transparency

`[RECOMMENDATION]` Three views, all derived from the same records:

- **Per claim** — which approved sources support this sentence.
- **Per source** — which claims rest on this source; when approved; by what route it arrived.
- **Per manuscript** — unsupported claims; approved-but-unused sources; sources changed since approval; distribution by year, venue, and origin.

`[INFERRED]` The third view is what a supervisor or examiner actually wants,
and no competitor produces it — because it requires owning both the evidence
graph and the manuscript, which is only possible with the claim-level model in
[06](./06-architecture-spec.md).

---

## 6. What is never sent

`[RECOMMENDATION]` Reinforcing [21](./21-data-and-security.md):

- Uploaded files are parsed **locally** wherever the client can
  (`[OBSERVED]` desktop always; web where the format allows).
- Raw datasets are never sent to inference without an explicit per-use
  confirmation naming the provider.
- Under local inference, no evidence content leaves the device at all.
- Under cloud inference, only the **extracted text of approved sources** needed
  for the specific task is transmitted — never the full library, never
  unapproved material.

`[INFERRED]` That last clause is a meaningful privacy property and a direct
consequence of the approval gate: material the user has not vouched for is also
material that never leaves their machine.
