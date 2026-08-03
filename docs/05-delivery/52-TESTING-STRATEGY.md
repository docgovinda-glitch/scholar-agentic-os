# Testing Strategy

> **Doc ID:** 52 · **Status:** Design · **Depends on:** `13`, `51`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

What we test, how, and the specific tests that hold the product's guarantees.

---

## 1. Principles

| # | Principle |
|---|---|
| T1 | **Guarantees are tested, not asserted.** Every claim in this documentation that says MUST has a test |
| T2 | **Test on baseline hardware.** Performance verified on 8 GB / 4 cores, not developer machines |
| T3 | **Architectural rules are CI-enforced.** Layer boundaries, egress paths, and plane isolation fail the build |
| T4 | **Agents are evaluated, not unit-tested.** Non-deterministic components need golden sets and thresholds |
| T5 | **No user content in any test fixture.** Ever. Fixtures are public, synthetic, or authored |
| T6 | **Failure paths are tested as thoroughly as success paths** |

---

## 2. The pyramid

```
            ┌──────────────┐
            │  Journey     │  ~20   full user journeys (26)
            ├──────────────┤
            │  E2E         │  ~120  cross-module flows
            ├──────────────┤
            │  Integration │  ~600  module + real kernel
            ├──────────────┤
            │  Unit        │ ~4000  pure logic
            └──────────────┘
      ┌────────────────────────────┐
      │ Architectural · Evaluation │  continuous, orthogonal
      │ Performance · Security     │
      └────────────────────────────┘
```

---

## 3. Coverage obligations

Per `13` §6:

| Layer | Branch coverage | Notes |
|---|---|---|
| `domain/provenance` | **100%** | The failure would be invisible and most damaging |
| `domain/*` (other) | 95% | Pure logic, no mocks needed |
| `services/*` | 90% | Integration against a temp store |
| `platform/*` | 85% | Recorded provider fixtures |
| `app/*` | 80% | Real kernel, fake providers |
| `surface/*` | Component + journey | Coverage percentage is a poor proxy here |

---

## 4. The tests that hold the guarantees

These are named individually because they are the ones that must never be
weakened to make a build pass.

### 4.1 Citation integrity — `REQ-SRC-8`

| Test | Asserts |
|---|---|
| `no-unapproved-citation` | No code path mints a citation from a non-approved source; attempted commits are rejected by the store invariant (`45` §5.1) |
| `discovery-adds-nothing` | Corpus size is unchanged after a discovery run producing 50 candidates |
| `drafting-removes-unresolvable` | An agent returning a citation not in the corpus results in that citation being **removed**, and the claim marked unsupported |
| `revocation-surfaces-dependents` | Revoking approval produces a finding on every dependent claim |

**Target: zero fabricated citations in exported documents** (`10` §8.2). Any
occurrence is a P0 defect and a post-mortem.

### 4.2 Provenance — `REQ-INT-1`, `REQ-INT-2`

| Test | Asserts |
|---|---|
| `provenance-survives-editing` | A scripted 150k-word session — 10,000 random inserts, deletes, moves, cut/pastes, undos — ends with zero attribution loss and a verifying hash chain |
| `edit-threshold` | The 30% materiality rule (`32` §4.4) classifies correctly at boundaries |
| `review-requires-interaction` | Scrolling, opening, and exporting do not mark spans reviewed; only the three interactions in `32` §4.3 do |
| `refinement-preserves-origin` | Refining human text keeps human origin and does not lower the authorship ratio |
| `refinement-refuses-unreviewed` | AG-17 refuses `ai_generated_unreviewed` input |
| `ledger-tamper-detected` | A modified entry breaks the chain and is detected |
| `undo-restores-ledger` | Undo restores text and Ledger state together |

`provenance-survives-editing` is the single most important test in the suite and
is the Phase 1 exit gate (`51`).

### 4.3 Citation formatting

Golden sets per style (APA 7, MLA 9, Chicago author-date, Chicago notes, Harvard,
IEEE, Vancouver), covering: journal article, book, chapter, conference paper,
thesis, website, dataset, preprint, report, legal source; with 1, 2, 3, 7, and
21+ authors; missing fields; non-Latin names; corporate authors; and edge cases
each style specifies.

**Why so thorough:** a subtly wrong bibliography is worse than an obviously wrong
one, because nobody catches it before submission.

### 4.4 Export fidelity — `REQ-EXP-6`

| Test | Method |
|---|---|
| `docx-opens-clean` | Generated files opened programmatically in LibreOffice; validated against the OOXML schema; manual verification in Word and Google Docs each release |
| `odt-opens-clean` | Validated against the ODF schema; opened in LibreOffice |
| `template-fidelity` | Content lands in the template's own styles; missing styles reported, never silently substituted |
| `tracked-changes-roundtrip` | Export → open in Word → edit → reimport, with attribution preserved |
| `page-limit-measured` | Layout measurement matches the rendered page count |
| `no-broken-file` | A writer failure never produces a file on disk |

### 4.5 Agent evaluation — `REQ-ADM-5`

Per `42` §8.2. Each agent has a versioned golden set with expected outputs and
metric thresholds.

| Property | Approach |
|---|---|
| Fixtures | Public documents, synthetic cases, operator-authored examples. **Never user content** |
| Metrics | Per-agent: precision, recall, schema conformance, checkpoint pass rate |
| Regression | Every affected golden set, not only the target |
| Non-determinism | Multiple samples; thresholds on distributions, not single runs |
| Cost | Recorded per evaluation; a regression in cost is a regression |

An agent version cannot reach `stable` without passing (`51` Phase 5 exit).

### 4.6 Compliance extraction

Golden set of real requirement sources — published author guidelines, university
handbooks, funder calls, DOCX templates — with expert-annotated expected rules.

| Metric | Threshold |
|---|---|
| Rule recall (rules that should be found) | ≥ 0.85 |
| Rule precision (rules found that are real) | ≥ 0.90 |
| Parameter accuracy (correct numbers) | ≥ 0.95 |
| Severity assignment | ≥ 0.90 |
| Template extraction (deterministic) | 1.00 |

Precision is weighted above recall: a wrong rule costs the user a correction and
erodes trust; a missing rule is caught by the user who knows their institution.

---

## 5. Journey and scenario tests

### 5.1 Full journeys

The nine journeys in `26` are automated end to end, each asserting the critical
moments identified there.

### 5.2 Gate traversal

Every workflow variant (`14` §7) traversed `G0`→`G7`, asserting: no gate
advances without sign-off, backward transitions invalidate correctly, and
chaptered projects gate independently.

### 5.3 Offline — the local-first proof

```
Test: full-project-offline
  1. Disable the network interface
  2. Create a project, complete intake
  3. Upload 8 local PDFs; ingest, parse, index
  4. Compile a Rubric from a local template file
  5. Approve sources; agree structure
  6. Draft three sections with a local model
  7. Run compliance; resolve findings
  8. Review all spans
  9. Export DOCX
  Assert: file is valid; zero network calls attempted or queued incorrectly
```

**If this test fails, local-first is marketing** (`44` §3.1). It runs on every
build.

### 5.4 Surface and device matrix

| Target | Tested |
|---|---|
| Desk | Windows 10/11, macOS 12+, Ubuntu 22.04+ |
| Baseline hardware | 8 GB RAM, 4 cores, no GPU — a real machine in CI, not a throttled container |
| Pocket desktop | Last two versions of Chrome, Firefox, Safari, Edge |
| Pocket mobile | 2019 mid-tier Android, recent iOS Safari, 360 px viewport |
| Approval queue | The one flow tested against the oldest supported baseline |

---

## 6. Security testing

Per `46` §17.

| Test | Cadence | Asserts |
|---|---|---|
| `no-http-outside-gateway` | Every build | No HTTP client is constructed outside `gateway` and `relay-client` |
| `warden-unbypassable` | Every build | Every provider call passes the Warden |
| `capability-enforcement` | Every build | No agent or plugin exceeds its declared capabilities |
| `no-write-draft-capability` | Every build | No agent or plugin holds `write:draft` |
| `plane-isolation` | Every build | No admin-plane import reaches user-plane code |
| `no-key-material-leaks` | Every build | Keys absent from logs, IPC payloads, crash dumps, diagnostics |
| `relay-ciphertext-only` | Every build | The sync service receives no plaintext |
| `sandbox-escape` | Every release | Plugin sandbox holds against escape attempts |
| Dependency and secret scanning | Every commit | — |
| Penetration test | Annually and pre-major-release | — |

The build-time architectural tests are cheap and prevent the two failures that
would quietly invalidate the whole security model.

---

## 7. Architectural tests

| Rule | Enforced |
|---|---|
| L2 imports nothing from L3 or L4 | ✓ |
| No filesystem I/O outside `services/storage` | ✓ |
| No key handling outside `services/crypto` | ✓ |
| `surface/*` imports only IPC, shared UI, generated types | ✓ |
| `app/vault` is not a transitive requirement of anything | ✓ |
| No `admin/*` import in user-plane code | ✓ |
| Every provider card supplies all nine fields | ✓ |
| Every output type has a complete intake schema | ✓ |
| Every agent manifest declares permissions, memory, and a golden set | ✓ |
| Every finding type has a location and a remedy | ✓ |

The last four are documentation-conformance tests: they fail the build when the
code drifts from this specification, which is how a design document stays true
over four years.

---

## 8. Performance testing

Budgets from `10` §5, verified on baseline hardware.

| Test | Budget |
|---|---|
| Editor latency at 150k words | < 50 ms |
| Desk cold start | < 4 s |
| Vault semantic search, 5k docs | < 800 ms |
| Compliance re-evaluation | < 300 ms |
| Local model first token, 7B | < 3 s |
| Export, 20k words | < 8 s |
| Pocket FCP on 2019 Android, 4G | < 2.0 s |
| Memory after an 8-hour session | No growth beyond a defined envelope |

Regressions fail the build. The 8-hour memory test runs nightly, not per-commit.

---

## 9. Accessibility testing

| Method | Scope |
|---|---|
| Automated (axe) | Every component, every build |
| Keyboard-only traversal | Every journey |
| Screen reader | NVDA, VoiceOver, TalkBack — every release |
| Provenance a11y (`21` §6.1) | Origin announced; text-mode provenance view |
| Approval card reading order (`23` §10.1) | Every release |
| 200% zoom | Every release |
| Reduced motion, high contrast | Every release |

---

## 10. Data integrity testing

| Test | Asserts |
|---|---|
| `crash-recovery` | Simulated crash at every stage recovers to a consistent state with no loss |
| `migration-fixtures` | Every prior schema version migrates correctly, against real fixture projects |
| `downgrade-refused` | An older client refuses a newer schema with a clear message |
| `snapshot-restore` | Restore reproduces state exactly |
| `deletion-completeness` | Deletion removes content, derivatives, index entries, and sync copies |
| `index-rebuildable` | Deleting the index and rebuilding produces identical search results |
| `sync-never-loses` | Randomised concurrent multi-device edits never discard a version |

`migration-fixtures` grows with every release and is the test that protects
Diego's five-month thesis (`26` Journey 2).

---

## 11. What we deliberately do not test

| Not tested | Why |
|---|---|
| AI output quality by human rating at scale | Unaffordable and unstable; golden sets with thresholds instead |
| Every provider's live API in CI | Recorded fixtures; live smoke tests run separately, out of band |
| Every citation style edge case exhaustively | Diminishing returns past the golden set; real reports drive additions |
| Windows 8, macOS 11, old browsers | Out of support (`NFR-COMPAT-*`) |

---

## 12. Current state

The repository has 107 test files and 1,145 passing tests under Vitest, with
Testing Library for components and supertest for the API — a genuinely solid
base, and unusual for a project at this stage.

| Current | Target |
|---|---|
| Unit and component tests | Full pyramid including journey tests |
| No architectural tests | Ten CI-enforced rules |
| No agent evaluation | Golden sets per agent with promotion gates |
| No performance budgets in CI | Budgets verified on baseline hardware |
| No offline test | The end-to-end offline proof |
| No migration fixtures | Every prior schema version |
| Cost guard test exists (`render.costGuard.test.ts`) | Generalises into the architectural-test category |

The existing cost-guard test is a good instinct — an executable constraint that
stops a documented decision from silently reversing. This strategy applies the
same pattern to the constraints that matter most.
