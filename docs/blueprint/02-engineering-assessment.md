# 02 — Engineering Assessment

> **Revised 2026-08-01** for the product revision requirements. Where this
> document conflicts with them, [11 — Requirements Conflict Analysis]
> (./11-requirements-conflicts.md) is authoritative. See also documents
> 12–21 for the product and system design they specify.

Unsparing evaluation. Evidence in [01](./01-system-inventory.md).

---

## Verdict

`[INFERRED]` This is a **substantially real system with a genuine and unusual
differentiator, wrapped in an architecture that has accreted three competing
implementations of its own core abstraction.** It is not a prototype and it is
not vapour: the export path produces real OOXML and real selectable-text PDFs,
the citation formatters are six distinct implementations behind a registry, the
provider catalog drives both browser and server from one definition, and 1,104
tests pass. It is also not ready to carry 100,000 users, for reasons that are
architectural rather than cosmetic.

The single most important observation in this document: **the parts of this
codebase that are most valuable are the least fashionable, and the parts that
are most duplicated are the most fashionable.** The compliance gates — source
approval, AI-use disclosure, phase gating — are small, well-placed, uniquely
positioned, and under-celebrated. The AI provider abstraction is large,
implemented three times, and is table stakes.

---

## Strengths

### 1. The compliance gates are the real asset `[OBSERVED]`

Three enforcement points sit in live code paths and cannot be bypassed through
the UI:

- Unapproved sources cannot enter AI context or a bibliography — four
  independent call sites filter `status === "approved"`.
- Export refuses to emit AI-use disclosure text unless `confirmedAt` is set, and
  every export routes through a confirmation gate.
- Disclosure is placed immediately before references, matching a specific
  publisher convention rather than a generic footer.

This is correct, deliberate engineering against an external standard. It is
also the hardest thing in the repo for a competitor to copy quickly, because
the difficulty is in knowing the rules, not in writing the code.

### 2. Catalog-driven provider configuration `[OBSERVED]`

`providerCatalog.ts` (28 entries) and `localRunnerCatalog.ts` (11) are consumed
by both the browser bundle and `server.ts`. Adding a provider is one entry, not
an adapter plus two server branches. The prior architecture — hand-written
adapters plus `if (provider === ...)` chains duplicated across two endpoints —
had produced a provider that was completely unusable on one path. That class of
bug is now structurally prevented.

### 3. Real document output `[OBSERVED]`

`documentExportService.ts` generates genuine OOXML via `docx` and genuine
selectable-text PDF via `pdfmake`'s layout engine, from a single
`buildExportDocumentModel()`. A code comment records that the rasterising
jsPDF+html2canvas approach was rejected specifically because it breaks
copy/search/accessibility. That is the right call and the right reason.

### 4. Honest degradation `[OBSERVED]`

Storage falls back from IndexedDB to `localStorage` silently and completes.
Failover classifies provider errors by kind rather than blanket-retrying.
`SubmissionPackagingSuite.tsx` contains a comment recording that fabricated
reviewer comments were removed and replaced with empty placeholder text. A
codebase that removes its own fake data is one whose remaining output can be
trusted more.

### 5. Test discipline where it counts `[OBSERVED]`

`hooks` 4/4, `utils` 3/3, `services` 29/28, `components` 37/44. The most
churn-prone and most business-critical areas are the best covered.

---

## Weaknesses

### 1. Three implementations of AI provider abstraction `[INFERRED]`

`src/ai/` (6,086 lines, 37 files) and `src/services/aiGateway.ts` (1,134 lines)
both own provider registries, health checking, and routing. There is no import
edge from the gateway into `src/ai/`. `src/ai/` additionally contains `router`,
`quota`, `cache`, `telemetry`, `benchmark`, `discovery`, and `hardware`
sub-packages with **2 test files across 37 source files**.

`[INFERRED]` `src/ai/` is an aspirational second-generation AI layer that was
never cut over to. Inferred from: it duplicates the live layer's
responsibilities; it is near-untested while the live layer is well-tested; and
the live UI path (`aiService` → `aiGateway` → catalog) never touches it.

This is the single largest block of ambiguous-status code in the repository.
Every future change to provider handling must be made in the right one of two
places, and nothing in the type system says which.

### 2. Duplicated submission UI, both mounted `[OBSERVED]`

`SubmissionPackagingSuite.tsx` generates cover letters (AI, with a template
fallback), renders a pre-flight checklist, and tracks a single submission's
status. `CoverLetterGenerator.tsx`, `SubmissionChecklistBuilder.tsx`, and
`SubmissionTracker.tsx` do the same three things. **Both sets render in the
Publishing tab.** A user sees two cover-letter editors and two checklists.

This is not a latent inconsistency; it is a live, user-visible defect.

### 3. The manuscript is untyped text `[OBSERVED]`

`sections: Record<string, string>`. There is no block, node, paragraph, or span
model. Consequences that follow directly `[INFERRED]`:

- Citations cannot be anchored to a position, so citation integrity cannot be
  verified per-claim — only counted in aggregate.
- Tracked changes, comments, and suggestion-mode are not expressible.
- Concurrent editing is impossible without last-write-wins over whole sections.
- "Which AI wrote which paragraph" — the question disclosure regimes are
  moving toward — cannot be answered, only asserted at document level.

The disclosure feature is the product's strongest asset, and this data model
caps how far it can go.

### 4. Component-layer mass `[OBSERVED]`

22,455 lines across 44 files; five files exceed 1,000 lines. Business logic
lives inside components — `AIControlCenter.tsx` performs health checks,
manages scan state, and owns the local-backend list inline.

`[OBSERVED]` This directly caused a production-visible CI failure: a test
clicked a Refresh button that was still `disabled` mid-scan, because scan state
and render were entangled in one 1,450-line component.

### 5. Orphaned server auth `[OBSERVED]`

`server/routes/auth.ts` — 1,088 lines defining ten endpoints — is imported by
nothing. `server/routes/parser.ts` (259 lines) likewise. `users.json` (17 bytes)
is still referenced from `server.ts`, from the dead `auth.ts`, from `userDb.ts`,
and from a migration script.

`[INFERRED]` A half-finished migration from file-based auth to Supabase. The
risk is not the dead code itself but the live `server.ts` reference to
`USERS_DB_PATH` and the `ENCRYPTION_KEY`-gated key-decryption fallback, which
means a legacy credential path may still be partially wired.

### 6. Test coverage inverted against risk `[OBSERVED]`

`src/ai` 2/37, `src/research` 1/28, `src/citation_compliance` 1/17, `src/core`
0/9, `src/auth` 0/2.

Citation formatting is the domain where a silent error is most damaging — a
subtly malformed reference list is exactly the kind of defect that reaches a
journal editor. It has one test file for six formatters, two importers, and a
canonical reference model.

### 7. CI does not gate what CI claims to gate `[OBSERVED]`

`npm run lint` is `tsc --noEmit` and is stricter than `npm run build`, because
Vite transpiles without full type-checking. Several commits merged red because
only `build` and `test` were run locally. There is no pre-commit hook and no
branch protection requiring the check.

---

## Architectural inconsistencies

`[OBSERVED]` **Two phase models.** `WORKFLOW_PHASES` (A–I with G1/G2) executes.
A 10-phase model is described in prose; its implementation
(`src/lifecycle/ResearchLifecycleEngine.ts`) was deleted. Documentation cited
the deleted file as authoritative.

`[OBSERVED]` **Two Knowledge Vault surfaces.** `App.tsx` imports
`ThesisReader.tsx` and names it `KnowledgeVaultManager`; a separate real
`KnowledgeVaultManager.tsx` (965 lines) is used by `KnowledgeVaultWizard.tsx`.
`ThesisReader` wraps `KnowledgeVaultEngineV2`. Three components, overlapping
purpose, one aliased to another's name.

`[OBSERVED]` **Two hosting targets.** `render.yaml` (Docker + Express API) and
`netlify.toml` (static SPA, no API proxy). Only one can serve this app.

`[INFERRED]` **Agents vs. skills is a registry duplicated, not a layering.**
Seven agents map near one-to-one onto nine skills; agents mostly delegate. The
abstraction earns its keep only if agents compose multiple skills — currently
they largely do not.

---

## Scalability

`[INFERRED]` The **product** scales to 100,000 users more easily than most
comparable systems, because manuscripts never touch the server — per-user
storage cost is zero and the API is stateless. That is a genuine structural
advantage created by the browser-local decision.

`[OBSERVED]` The **binding constraints** are elsewhere:

- Render `plan: starter`, single service, no autoscaling declared. Every AI
  request proxies through it.
- `express.json({ limit: "50mb" })` with synchronous PDF/DOCX parsing on the
  same process that serves the SPA. A few concurrent large parses will starve
  the event loop.
- Rate limits are in-process; they reset on deploy and do not coordinate across
  instances, so horizontal scaling silently multiplies the effective limit.
- Server-held `GEMINI_API_KEY` means managed-mode cost scales linearly with
  users, with no per-user quota enforcement in the live path (`src/ai/quota`
  exists but is not wired).

`[INFERRED]` Single-device storage is a **product** scaling limit as real as
any infrastructure one: a student who writes on a laptop and a lab machine
cannot use this for its primary purpose.

---

## Maintainability, coupling, cohesion

`[INFERRED]` Cohesion is high in the newer service modules (`storageService`,
`documentExportService`, `providerFailover`) — each has one clear job and a
narrow surface. It is low in the large components, which mix data fetching,
domain rules, and rendering.

`[OBSERVED]` Coupling to `PaperProject` is total. Its ~45 fields are threaded
through components, services, agents, and export as one object. Any change to
it is a change everywhere.

`[INFERRED]` The `updateProject` stale-closure bug — two calls in one tick
silently dropping the first's fields, which lost version-history checkpoints
on every AI-drafted section — is a direct consequence of that shape, not an
isolated slip.

---

## Security

`[OBSERVED]` Good: helmet with explicit CSP, four rate limiters, client-side
encrypted vault with device-bound or passphrase unlock, secrets marked
`sync: false`.

`[INFERRED]` Concerns:

- The Supabase anon key is baked into the bundle by design, so **RLS policy is
  the entire authorisation boundary.** Not audited here; `supabase/schema.sql`
  is the file that matters.
- `ENCRYPTION_KEY`-gated server-side key decryption via a `users.json` fallback
  is a live path into a legacy store.
- `/api/parse-external-link` fetches user-supplied URLs server-side — SSRF
  surface. Rate-limited, but no allowlist was observed.
- Rate limiting is in-process and therefore not a real control under horizontal
  scaling.

---

## Feature status

| Feature | Status | Evidence |
|---|---|---|
| Phase A–I workflow | **Working** | `WORKFLOW_PHASES`, `phaseGating.ts`, wired in `App.tsx` |
| DOCX / PDF export | **Working** | `documentExportService.ts`, real OOXML + pdfmake |
| Source approval gate | **Working** | 4 call sites filtering `status === "approved"` |
| AI-use disclosure gate | **Working** | `confirmedAt` check + export modal |
| Multi-provider AI | **Working** | catalog + gateway + failover, well tested |
| Encrypted key vault | **Working** | `apiVault.ts`, 591 lines, tested |
| Hybrid storage | **Working** | `storageService.ts` + migration |
| Citation formatters | **Working, under-tested** | 6 formatters, 1 test file |
| Document parsing | **Working** | PDF/DOCX/TXT/MD + heading detection, 10 tests |
| Agents / skills | **Partial** | executes one-shot; no queue, retry, or persistence |
| `src/ai/` subsystem | **Abandoned or pre-cutover** | 2/37 tested, no live import edge |
| Submission suite | **Duplicated** | two implementations, both mounted |
| Server auth | **Dead** | 1,088 lines, zero importers |
| 10-phase lifecycle | **Deleted** | `4afb6c8`; survives only in prose |
| Knowledge graph / KQL | **Deleted** | `4afb6c8` |
| Cross-device sync | **Absent** | no server-side project storage |
| Collaboration | **Absent** | kernel deleted; data model cannot express it |

---

## Production readiness

`[INFERRED]` **Ready:** export, compliance gates, provider handling, storage,
parsing.

`[INFERRED]` **Not ready:** anything requiring more than one device; anything
requiring more than one Render instance; the duplicated submission UI, which is
a defect users can see today; citation correctness at the level a journal
submission demands, given the test coverage.

`[RECOMMENDATION]` The three changes with the best ratio of user-visible value
to effort, in order: resolve the duplicated submission UI; test the citation
formatters properly; decide `src/ai`'s fate and delete or adopt it. None
requires architectural change.
