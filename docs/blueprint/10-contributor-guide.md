# 10 — Contributor Guide

> **Revised 2026-08-01** for the product revision requirements. Where this
> document conflicts with them, [11 — Requirements Conflict Analysis]
> (./11-requirements-conflicts.md) is authoritative. See also documents
> 12–21 for the product and system design they specify.

How to work on this codebase without repeating the mistakes it already made.
Written from observed failures, not from general best practice.

---

## Before anything else

```bash
npm install
npm run lint     # tsc --noEmit  — STRICTER THAN BUILD
npm test         # vitest run    — 106 files, 1104 tests
npm run build    # vite + esbuild
npm run dev      # tsx server.ts
```

`[OBSERVED]` **`npm run lint` is the one that gates CI, and it catches things
`npm run build` does not.** Vite transpiles without full type-checking, so a
green build is not a green CI. Several commits were merged red for exactly this
reason.

Run all three before pushing. If you run only one, run `lint`.

---

## The rules that matter

These are not style preferences. Each exists because its absence caused a
specific, documented problem.

### 1. Search before you build

`[OBSERVED]` This codebase contains three provider abstractions, two submission
suites, two agent registries, two Knowledge Vault surfaces, and two hosting
configurations. Every one was created by someone who did not check whether the
thing already existed.

The duplicated submission UI is live today: a user sees two cover-letter
editors and two checklists in the Publishing tab.

```bash
# before adding a feature, look for it
git grep -il "coverletter\|checklist"
git grep -l "healthCheck\|providerRegistry"
```

### 2. Dependencies point downward

```
experience → orchestration → domain → capability → foundation
```

Never upward, never sideways between siblings. See
[06](./06-architecture-spec.md). `[OBSERVED]` The absence of this rule is the
single cause behind most structural debt in
[09](./09-technical-debt-register.md).

### 3. Never weaken a gate

`[OBSERVED]` Three gates are load-bearing product behaviour, not validation
niceties:

- Unapproved sources cannot reach AI context or a bibliography — four call
  sites filter `status === "approved"`.
- Export emits AI-disclosure text only when `aiUseDisclosure.confirmedAt` is
  set.
- Phases cannot be entered out of order.

`[INFERRED]` These *are* the product ([03](./03-product-definition.md)). If a
change makes a gate easier to bypass, it is a product regression regardless of
how it is framed. Adding a gate is normal; removing or loosening one needs an
explicit decision.

### 4. Do not fabricate data

`[OBSERVED]` This codebase has a history of removing invented content — an
audit found hardcoded fake reviewer comments displayed as if they were real
correspondence, and they were replaced with honest empty-state text.

Never invent citations, reviewer feedback, metrics, or sources. An empty state
saying "nothing here yet" is always correct; plausible fake data in an academic
integrity tool is a serious defect.

`[OBSERVED]` Naming counts too: a variable called `mockSettings` that held real
settings was renamed because it misled readers.

### 5. Async effects need unmount guards

`[OBSERVED]` Storage is Promise-based, so an effect can resolve after its
component unmounts. This caused a real CI failure — `setState` firing after
jsdom teardown.

Two guards exist and must be preserved:

- The `cancelled` flag in `useProjectPersistence.ts`.
- `src/testSetup.ts`, which registers `@testing-library/react`'s `cleanup()` in
  `afterEach`. `[OBSERVED]` `test.globals` is off, so RTL's automatic cleanup
  does **not** self-register — without this file every rendered tree stays
  mounted across test files.

### 6. Adding an AI provider is a catalog entry

`[OBSERVED]` `src/config/providerCatalog.ts` (28 entries) and
`localRunnerCatalog.ts` (11) are consumed by both the browser bundle and
`server.ts`.

Add an entry. Do **not** write an adapter, and do **not** add an
`if (provider === ...)` branch. `[OBSERVED]` The previous hand-written approach
left one provider completely unusable on one of two code paths.

---

## Testing

`[OBSERVED]` Vitest, not Jest.

**jsdom suites must wire `localStorage` themselves.** Every existing jsdom test
opens with:

```ts
// @vitest-environment jsdom
Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});
```

`fake-indexeddb/auto` is available for IndexedDB-backed code.

**Wait for the state you actually depend on.** `[OBSERVED]` A test waited for a
scan to *start* and then clicked a button that was `disabled` until the scan
*finished* — the click was a silent no-op and the assertion compared a number to
itself. Wait for the specific condition:

```ts
// wrong — resolves on the first of several calls
await waitFor(() => expect(mock).toHaveBeenCalled());

// right — waits for the work to actually complete
await waitFor(() => expect(screen.getByText("Refresh")).toBeEnabled());
```

**Coverage is inverted against risk.** `[OBSERVED]` `citation_compliance` has
1 test file across 17 source files; `src/ai` has 2 across 37. If you touch
citation formatting, add tests — a malformed reference list reaches a journal
editor, and the author carries the consequence.

---

## Commits and pull requests

`[OBSERVED]` The existing history uses long-form commit bodies that explain
*why*, not just *what*, and name the specific bug or constraint. Match that —
it is one of the genuinely good habits in this repository.

Before pushing:

- [ ] `npm run lint` clean
- [ ] `npm test` passing
- [ ] `npm run build` clean
- [ ] Searched for an existing implementation of what you added
- [ ] No gate weakened
- [ ] No fabricated data or misleading names
- [ ] Documentation updated if a structural claim changed

`[OBSERVED]` That last item is not optional. This blueprint set exists because
documentation drifted until it described seven deleted modules as present and
cited a deleted file as the definition of the product's headline model.

---

## Where things live

| Concern | Location |
|---|---|
| Data model | `src/types.ts` — `PaperProject` |
| Persistence | `src/services/storageService.ts`, `src/hooks/useProjectPersistence.ts` |
| AI task orchestration | `src/services/aiService.ts` |
| Provider gateway | `src/services/aiGateway.ts` + `src/config/*Catalog.ts` |
| Key vault | `src/services/apiVault.ts` |
| Export | `src/services/documentExportService.ts` |
| Citation | `src/citation_compliance/` |
| Parsing | `src/document_intelligence/` |
| Skills / agents | `src/skills/`, `src/agents/` |
| Gates | `src/utils/phaseGating.ts`; approval filters in `aiService.ts` + `documentExportService.ts` |
| Server API | `server.ts` + `server/routes/{health,admin,parse,ai}.ts` |

**Do not use as reference** `[OBSERVED]`:

- `server/routes/auth.ts`, `server/routes/parser.ts` — imported by nothing
  (1,347 lines). They read as live API surface and are not.
- `src/ai/` — 6,086 lines, 2 test files, no live import edge. Its status is
  unresolved ([09](./09-technical-debt-register.md) TD-05). Do not build
  against it until that decision is made.
- Any document outside `docs/blueprint/` — treat as historical context, never
  as truth.

---

## Deployment

`[OBSERVED]`

- **Render** — Docker web service `scholar-agentic-os`, `plan: starter`, runs
  `npm start` → `dist/server.cjs` on port 3000. Deployment is driven by
  Render's git integration, **not** by this repo's CI.
- **Supabase** — auth plus 12 Edge Functions (registration/password approval
  flows and four outbound proxies).
- **CI has no deploy step.** `.github/workflows/ci.yml` runs type-check, tests,
  build, and a bundle-size check on Node 20.x and 22.x. Nothing else.
- `netlify.toml` also exists (static SPA, no API proxy). `[INFERRED]` It cannot
  serve the Express API and is an alternative target, not a complement — see
  [09](./09-technical-debt-register.md) TD-13.

Secrets are `sync: false` in `render.yaml`. `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are Docker build ARGs baked into the client bundle —
`[INFERRED]` so Supabase RLS is the entire authorisation boundary. Treat any
change touching it as security-sensitive.

---

## Getting oriented

Read in this order:

1. [00 Executive Summary](./00-executive-summary.md) — the whole picture
2. [03 Product Definition](./03-product-definition.md) — what you are building
3. [09 Technical Debt Register](./09-technical-debt-register.md) — what will
   bite you
4. [06 Architecture Specification](./06-architecture-spec.md) — where things
   should go

`[RECOMMENDATION]` If a claim in these documents conflicts with the code, the
code is right and the document is stale. Fix it in the same pull request.
