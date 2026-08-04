# Scholar Agentic OS — Completion Roadmap

> **Last verified:** 2026-08-04, against the working tree — not from memory.
>
> **How to keep this honest:** every claim below was checked by running the
> thing or reading the file that implements it. The commands used are recorded
> next to each section. A status document that is not re-verified becomes a
> liability faster than it becomes useful — the previous revision of this file
> listed the Pocket API backend, the ODT writer, and the Pocket database schema
> as "still needed" when all three were already committed and passing tests. It
> would have sent the next engineer to rebuild working code.

---

## Verified baseline

```
npm run lint    # tsc --noEmit + contrast verification — clean
npm test        # 160 files, 1783 tests — all passing
npm run build   # client + server bundles — succeeds
```

| Measure | Value |
|---|---|
| Source files (`src`, `server`) | 431 |
| Lines of TypeScript/TSX | ~90,000 |
| Test files / tests | 160 / 1783 |
| `TODO` / `FIXME` markers in source | 0 |

---

## What is actually built

### Foundation and editor — substantially complete

Express API with a service tier, Postgres schema with migrations, Supabase auth
(registration, MFA, password reset), the Desk five-region shell, rich-text
editing with headings/lists/tables/footnotes, autosave with IndexedDB recovery,
comment threading, snapshots and version history, Warden egress classification,
the model gateway with provider failover, adapters for OpenAI/Anthropic/Google/
OpenRouter, AI setup with live key validation, and the chat panel.

### Academic workflow — substantially complete

24 output types with schemas, the dynamic intake form engine, the G0–G7 gate
state machine with sign-off enforcement, Conductor scheduling, PDF/DOCX/ODT
ingestion into the Canonical Document Model, the candidate approval queue,
authenticity checks (DOI resolution, publisher verification, retraction
detection), citation management, the Claim–Evidence graph, Rubric compilation
and evaluation, the compliance panel, and the Mesh agent runtime with
capability enforcement.

### Voice and output — substantially complete

Studio's five intervention levels, voice profile build/apply/drift-detection,
20 first-language profiles, meaning verification, per-change diff reasons, the
five-stage export pipeline, the DOCX writer with template fidelity, and
quotation protection.

**ODT export is implemented** (`src/services/documentExportService.ts`, covered
by `src/services/__tests__/documentExportService.odt.test.ts`) — the previous
revision of this file described it as a stub.

### Pocket (mobile) — implemented, needs device verification

The three-zone shell, four persistent tabs, the approval queue, read view with
comment threads, the ask/chat interface, source discovery, PWA manifest and
service worker, install prompt, background sync, and the tablet master-detail
layout.

**The Pocket API backend exists** — `server/routes/pocket.ts`, 458 lines,
8 endpoints:

```
POST   /projects/:projectId/approve-source
POST   /documents/:docId/comments
GET    /documents/:docId/comments
POST   /chat/stream
GET    /chat/:projectId
POST   /push/subscribe
POST   /sync/actions
GET    /projects/:projectId/approval-queue
```

`supabase/schema_pocket.sql` declares the four supporting tables. The previous
revision listed all of this as the critical unbuilt path.

### Design system — rebuilt 2026-08-04

One token generation replacing three that had coexisted, light and dark both
first-class, and `scripts/verify-contrast.mjs` gating 80 contrast pairings in
`npm run lint`. See `docs/06-decisions/60-DESIGN-DIRECTION.md`.

---

## What genuinely remains

Ordered by what blocks the most.

### 1. Desk feature parity — decided, in progress

**Decided 2026-08-04: Desk becomes the real client; the legacy app retires**
(`docs/06-decisions/61-CLIENT-CONSOLIDATION.md`).

Promoting Desk surfaced and closed a vulnerability first: `/api/projects` and
`/api/studio` required no authentication, projects had no owner, and project
ids were sequential — so any unauthenticated caller could read, overwrite, and
export anyone's work by walking the id space. Fixed, with 37 authorization
tests that were verified to fail when the fix is reverted.

Desk now has authentication, project ownership, an owner-scoped project list,
and working Back/Forward. What remains is feature parity:

- Intake wizards, Knowledge Vault, AI setup, export pipeline UI, submission
  tracking — all legacy-only, each needs porting onto the gate-based model
- Onboarding (registration, password recovery, AI setup, optional Vault)
- Pocket should become Desk's responsive form, not a third client
- Route flip: `/desk` → `/`, legacy reachable during transition
- Delete `src/App.tsx` and legacy-only components once nothing routes to them

### 2. Per-screen redesign

The design system landed; the layouts did not change. Information architecture,
navigation, and screen-level composition are unchanged from the phase-based
original. Now unblocked — there is one system to build against.

### 3. Test files are not typechecked

`tsconfig.json` excludes `**/__tests__/**`. A `store.create()` call kept
compiling after the signature gained a required parameter. Enabling the check
surfaces 199 pre-existing errors, mostly `possibly undefined` after assertions.

### 4. Verification that cannot be done from source

- Lighthouse performance and accessibility on a real deployment
- PWA install on physical iOS and Android devices
- Screen-reader passes (VoiceOver, NVDA) on the primary journeys
- Contrast verification covers *tokens*; it cannot see a component that puts
  the wrong token on the wrong surface

### 5. Feature gaps

- OCR for scanned documents (integration)
- Reference-manager import: Zotero, Mendeley, BibTeX, RIS
- Vault on mobile: collection browsing, quick search, attachment preview
- Share Target API
- PDF export writer with proper tagging; TOC, front matter, cross-references
- AI use declaration drafting

### 6. Platform tier — not started

Plugin runtime and sandbox, plugin registry and signing, the operator console,
Foundry authoring and golden sets, agent release channels, feature flags with
targeting, telemetry aggregation, admin audit with justification, break-glass
controls, and institutional SSO/SCIM.

---

## Recommended order

1. **Port onboarding to Desk** (§1). Registration, password recovery, and AI
   setup are the only path to a usable account, and they are legacy-only —
   Desk cannot be the front door until they move.
2. **Deploy and measure** (§4). Lighthouse and device testing need a running
   deployment, and the results will reorder §2.
3. **Port the remaining legacy surfaces** (§1) onto the gate-based model,
   redesigning each as it moves (§2) rather than porting then restyling.
4. **Flip the route** (§1) once parity is reached; delete legacy after.
5. **Close feature gaps** (§5) — largely independent, parallelisable.
6. **Platform tier** (§6) — not required for launch.

§3 (typechecking tests) is not sequenced here — it is a standalone cleanup that
can land at any point, and gets more valuable the more porting work is in
flight.

---

## Success criteria for ship

- [x] Type check, test suite, and production build all green
- [x] Contrast verified automatically, in CI
- [x] Single design token system, light and dark
- [x] Client split decided — Desk, with auth and ownership enforced
- [ ] Desk at feature parity with the legacy client
- [ ] Lighthouse ≥ 90 performance, ≥ 95 accessibility on deployment
- [ ] PWA installs on physical iOS and Android
- [ ] Screen-reader pass on registration → setup → workspace → export
- [ ] All Pocket features usable at 360 px
- [ ] Supabase schema migrated in production
- [ ] `scholar.gkshah.com.np` resolves and serves the deployment
