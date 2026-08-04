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
npm test        # 158 files, 1736 tests — all passing
npm run build   # client + server bundles — succeeds
```

| Measure | Value |
|---|---|
| Source files (`src`, `server`) | 431 |
| Lines of TypeScript/TSX | ~90,000 |
| Test files / tests | 158 / 1736 |
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

### 1. The two-client split — architectural, decide before building more UI

`src/main.tsx` routes on `window.location.pathname`: `/desk` mounts `DeskApp`,
everything else mounts the legacy phase-based `App`. These are two separate
applications sharing a repository.

| | Legacy `App` | `Desk` |
|---|---|---|
| Route | everything except `/desk` | `/desk` |
| Size | ~81 component files | 1,163 lines total |
| Auth | wrapped in `AuthProvider` | **none — unauthenticated** |
| Status | what users actually get | the architecture docs 20/21/22 describe |

Desk is the specified architecture but is a skeleton with no auth. The legacy
app is the real product but does not match the specified information
architecture. Only Desk's *types* are imported elsewhere — `DeskApp` and
`DeskShell` themselves have no consumer outside `/desk`.

**This is the decision that gates the remaining UI work**, and it is a product
decision, not a mechanical one: either Desk grows into the real client and the
legacy app retires, or Desk retires and its IA is folded into the legacy app.
Building more screens before choosing means building them twice.

### 2. Per-screen redesign

The design system landed; the layouts did not change. Information architecture,
navigation, and screen-level composition are unchanged from the phase-based
original. Now unblocked — there is one system to build against.

### 3. Verification that cannot be done from source

- Lighthouse performance and accessibility on a real deployment
- PWA install on physical iOS and Android devices
- Screen-reader passes (VoiceOver, NVDA) on the primary journeys
- Contrast verification covers *tokens*; it cannot see a component that puts
  the wrong token on the wrong surface

### 4. Feature gaps

- OCR for scanned documents (integration)
- Reference-manager import: Zotero, Mendeley, BibTeX, RIS
- Vault on mobile: collection browsing, quick search, attachment preview
- Share Target API
- PDF export writer with proper tagging; TOC, front matter, cross-references
- AI use declaration drafting

### 5. Platform tier — not started

Plugin runtime and sandbox, plugin registry and signing, the operator console,
Foundry authoring and golden sets, agent release channels, feature flags with
targeting, telemetry aggregation, admin audit with justification, break-glass
controls, and institutional SSO/SCIM.

---

## Recommended order

1. **Decide the client split** (§1). Everything in §2 depends on it.
2. **Deploy and measure** (§3). Lighthouse and device testing need a running
   deployment, and the results will reorder §2.
3. **Redesign screens** (§2) against whichever client won.
4. **Close feature gaps** (§4) — largely independent, parallelisable.
5. **Platform tier** (§5) — not required for launch.

---

## Success criteria for ship

- [x] Type check, test suite, and production build all green
- [x] Contrast verified automatically, in CI
- [x] Single design token system, light and dark
- [ ] Client split resolved
- [ ] Lighthouse ≥ 90 performance, ≥ 95 accessibility on deployment
- [ ] PWA installs on physical iOS and Android
- [ ] Screen-reader pass on registration → setup → workspace → export
- [ ] All Pocket features usable at 360 px
- [ ] Supabase schema migrated in production
- [ ] `scholar.gkshah.com.np` resolves and serves the deployment
