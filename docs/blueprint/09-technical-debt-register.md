# 09 — Technical Debt Register

Every known compromise, with evidence and a reproduction command where one
exists. Ordered by severity. No item is listed without evidence.

Severity: **S1** user-visible or correctness-threatening · **S2** structural,
compounding · **S3** contained, cost is maintenance only.

---

## S1 — User-visible or correctness-threatening

### TD-01 · Duplicated submission UI, both mounted

`[OBSERVED]` `SubmissionPackagingSuite.tsx` generates cover letters, renders a
pre-flight checklist, and tracks a submission's status.
`CoverLetterGenerator.tsx`, `SubmissionChecklistBuilder.tsx`, and
`SubmissionTracker.tsx` do the same three things. Both sets render in the
Publishing tab of `App.tsx`.

**Impact:** a user sees two cover-letter editors and two checklists. State is
not shared between them, so edits in one are invisible in the other.

**Cause** `[INFERRED]`: Phase 2 components were built without checking for
existing implementations. Flagged at the time and merged anyway.

**Fix:** consolidate to one. `ReviewerResponseManager` does not overlap and
should survive regardless — the old panel had only a static response template.

```bash
grep -n "CoverLetterGenerator\|SubmissionPackagingSuite" src/App.tsx
```

### TD-02 · Citation formatters effectively untested

`[OBSERVED]` `src/citation_compliance/` — 17 source files, six formatters (APA
7, IEEE, MLA 9, Chicago, Harvard, Vancouver), two importers, a canonical
reference model — has **1 test file**.

**Impact** `[INFERRED]`: a malformed reference list is among the most damaging
silent defects possible here — it reaches a journal editor, and the author
carries the consequence. This is the lowest-coverage, highest-consequence area
in the repository.

**Fix:** per-formatter tests against real fixtures for each reference kind.

```bash
find src/citation_compliance -name '*.test.*' | wc -l   # 1
find src/citation_compliance -name '*.ts' | grep -v __tests__ | wc -l   # 17
```

### TD-03 · Legacy credential path still reachable from live code

`[OBSERVED]` `server.ts:203` defines `USERS_DB_PATH` → `users.json` (17 bytes,
at repo root). `server.ts:229` warns that without `ENCRYPTION_KEY`,
"server-stored provider API keys (resolveApiKey's users.json fallback) cannot
be decrypted". `users.json` is also referenced by the dead
`server/routes/auth.ts`, by `server/services/userDb.ts`, and by
`scripts/migrate-users-to-supabase.ts`.

**Impact** `[INFERRED]`: a file-based credential store persists as a live
fallback after auth moved to Supabase. Whether it can still be written to was
not determined.

**Fix:** audit the `resolveApiKey` fallback; remove the path or document why it
must remain.

### TD-04 · Supabase RLS is the entire authorisation boundary, unaudited

`[OBSERVED]` `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are Docker build
ARGs baked into the client bundle — public by construction.

`[INFERRED]` Row-level security in `supabase/schema.sql` is therefore the only
thing separating users' data. **Not audited in this analysis.**

**Fix:** explicit RLS audit with a written policy statement per table.

---

## S2 — Structural, compounding

### TD-05 · Three implementations of AI provider abstraction

`[OBSERVED]` `src/ai/` (6,086 lines / 37 files / **2 test files**) and
`src/services/aiGateway.ts` (1,134 lines) both own provider registries, health
checks, and routing. No import edge from the gateway into `src/ai/`. `src/ai/`
also carries `router`, `quota`, `cache`, `telemetry`, `benchmark`, `discovery`,
`hardware` — none reachable from the UI.

**Impact** `[INFERRED]`: every provider change has two plausible homes and
nothing in the type system indicates which. The largest ambiguous-status block
in the repo.

**Fix:** decide. Adopt `src/ai` (and test it) or delete it. Not both.

```bash
git grep -l "from .*src/ai/" -- src/services src/components | head
```

### TD-06 · `PaperProject` is a 45-field god object

`[OBSERVED]` One interface in `src/types.ts` carrying intake, authorship,
workflow, artifacts, research state, quality reports, AI settings, model
preferences, usage logs, and cost metrics — threaded through components,
services, agents, and export as one object.

**Impact** `[INFERRED]`: total coupling. This shape *caused* the
`updateProject` stale-closure bug, in which two calls in the same tick silently
dropped the first's fields — losing a version-history checkpoint on every
AI-drafted section, confirmed in production. That was a symptom, not an
isolated slip.

**Fix:** decompose along the domain boundaries in
[06](./06-architecture-spec.md).

### TD-07 · Manuscript is untyped text

`[OBSERVED]` `sections: Record<string, string>`.

**Impact** `[INFERRED]`: caps the product. Per-claim citation integrity,
paragraph-level AI provenance, tracked changes, and block-level merge for sync
are all inexpressible. The product's strongest asset — disclosure — is limited
to a document-level assertion.

**Fix:** Stage 2 of [07](./07-roadmap.md).

### TD-08 · Dead server routes

`[OBSERVED]` `server/routes/auth.ts` (1,088 lines, ten endpoints) and
`server/routes/parser.ts` (259 lines) are imported by nothing.
`server/routes/index.ts` re-exports only `health`, `admin`, `parse`, `ai`.

**Impact:** 1,347 lines that read as live API surface and are not.

```bash
cat server/routes/index.ts && grep -n "routes/index" server.ts
```

### TD-09 · Test coverage inverted against risk

`[OBSERVED]` `src/ai` 2/37 · `src/research` 1/28 · `src/citation_compliance`
1/17 · `src/core` 0/9 · `src/auth` 0/2 — against `hooks` 4/4, `utils` 3/3,
`services` 29/28.

**Impact** `[INFERRED]`: the best-covered code is the most recently touched;
the worst-covered includes the most consequence-bearing (citation) and the
largest ambiguous block (`src/ai`).

### TD-10 · Business logic inside large components

`[OBSERVED]` Five components exceed 1,000 lines. `AIControlCenter.tsx` (1,450)
performs health checks, owns scan state, and defines the local-backend list
inline.

**Impact** `[OBSERVED]`: directly caused a CI failure — a test clicked a Refresh
button still `disabled` mid-scan, because scan state and render were entangled.

### TD-11 · Agents and skills duplicate each other

`[OBSERVED]` Two registries; seven agents mapping near one-to-one onto nine
skills, with agents mostly delegating.

**Impact** `[INFERRED]`: an abstraction layer that earns nothing until agents
compose multiple skills.

### TD-12 · `src/research` overlaps the agent layer

`[OBSERVED]` 2,173 lines / 28 files / **1 test file**, with `literature`,
`methodology`, `novelty`, `evidence`, `roadmap` sub-packages mirroring agents
of the same names.

---

## S3 — Contained

### TD-13 · Two hosting configurations

`[OBSERVED]` `render.yaml` (Docker, Express API) and `netlify.toml` (static SPA,
no API proxy or redirect). `[INFERRED]` Only one can serve this application.

### TD-14 · Two Knowledge Vault surfaces plus a misleading alias

`[OBSERVED]` `App.tsx:39` imports `./components/ThesisReader` and names it
`KnowledgeVaultManager`. A separate real `KnowledgeVaultManager.tsx` (965
lines) exists and is used by `KnowledgeVaultWizard.tsx`. `ThesisReader` wraps
`KnowledgeVaultEngineV2.tsx`.

**Impact** `[INFERRED]`: reading `App.tsx` gives a false impression of which
component renders.

### TD-15 · In-process rate limiting

`[OBSERVED]` Four `rateLimit` configurations in `server.ts`, all in-memory.

**Impact** `[INFERRED]`: they reset on deploy and do not coordinate across
instances — horizontal scaling silently multiplies the effective limit. Fails
open and silently, which is the dangerous shape.

### TD-16 · Synchronous parsing on the SPA process

`[OBSERVED]` `express.json({ limit: "50mb" })`; PDF/DOCX parsing runs in the
same process that serves the SPA.

**Impact** `[INFERRED]`: concurrent large parses starve the event loop and
degrade page serving.

### TD-17 · SSRF surface on external-link parsing

`[OBSERVED]` `/api/parse-external-link` fetches user-supplied URLs server-side.
Rate-limited; no allowlist observed.

### TD-18 · Managed-AI quota not wired

`[OBSERVED]` `src/ai/quota` exists inside the unreachable subsystem. The live
path has no per-user cap while a server-held `GEMINI_API_KEY` is in use.

**Impact** `[INFERRED]`: managed-mode cost scales linearly with users, with no
enforcement point.

### TD-19 · No telemetry in the live path

`[OBSERVED]` `src/ai/telemetry` is unreachable. No gate evaluations, skill runs,
or exports are recorded.

**Impact** `[INFERRED]`: no evidence base for product decisions — which gates
users hit, where they abandon, whether disclosure is valued.

### TD-20 · CI enforcement gap

`[OBSERVED]` `npm run lint` (`tsc --noEmit`) is stricter than `npm run build`,
because Vite transpiles without full type-checking. No pre-commit hook; no
required status check. Several commits merged red as a direct result.

---

## Summary

| Severity | Count | Character |
|---|---:|---|
| S1 | 4 | User-visible or correctness-threatening |
| S2 | 8 | Structural; compounding cost |
| S3 | 8 | Contained; maintenance cost |

`[INFERRED]` The pattern across S2 is one cause: **nothing prevented a second
implementation of an existing concept.** Three provider abstractions, two
submission suites, two agent registries, two vault surfaces, two hosting
configs. A CI-enforced layer and registry rule — [06](./06-architecture-spec.md)
— addresses the cause rather than the instances.

`[RECOMMENDATION]` Best value first: **TD-01** (only item users see today),
**TD-02** (highest consequence per unit of effort), **TD-05** (unblocks
reasoning about everything AI-related).
