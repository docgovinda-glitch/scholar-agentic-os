# Client Consolidation — Desk Becomes the Product

> **Doc ID:** 61 · **Status:** Accepted · **Date:** 2026-08-04
> **Depends on:** `20`, `21`, `22`, `60`

---

## 1. The situation

`src/main.tsx` routed on `window.location.pathname`. `/desk` mounted `DeskApp`;
everything else mounted `src/App.tsx`. Two applications, one repository.

| | Legacy `App` | `Desk` |
|---|---|---|
| Route | everything except `/desk` | `/desk` |
| Size | ~81 component files | 1,163 lines |
| Auth | wrapped in `AuthProvider` | **none** |
| Data model | `PaperProject`, phase-based | Canonical Document, gate-based |
| Matches docs `20`/`21`/`22` | no | yes |
| What users get | this | not this |

Desk was the specified architecture as a skeleton. Legacy was the real product
with an unspecified architecture. Only Desk's *types* were imported anywhere
else — `DeskApp` and `DeskShell` had no consumer outside `/desk`.

## 2. Decision

**Desk becomes the real client. The legacy app retires.**

Building screens before choosing meant building them twice. Desk is chosen
because it already matches the documented information architecture and the
current data model; the legacy app matches neither, and porting its phase-based
`PaperProject` model into the gate-based Canonical Document model would be the
larger of the two migrations.

This is a sequence, not a switch. Legacy stays served and functional until Desk
covers what it covers.

---

## 3. What shipped first, and why it had to

Promoting Desk surfaced a vulnerability that had to be closed before anything
was built on top of it.

### 3.1 The vulnerability

`server/routes/project.ts` and `server/routes/studio.ts` had **no
authentication of any kind**. `server/routes/pocket.ts` had required auth on
every endpoint since it was written — the gap was specific to the routes Desk
uses.

`ProjectRecord` had **no owner field**, so there was nothing to authorise
against even had auth existed.

Project ids were generated as:

```ts
`proj-${Date.now().toString(36)}-${counter}`   // counter: module-level, incrementing
```

Sequential. Knowing one id gave you its neighbours', and the timestamp narrowed
the remainder to whatever was created in the same millisecond. Enumeration was
arithmetic.

Together, any unauthenticated caller could:

- create projects,
- read any project by walking the id space,
- overwrite any project's document and intake answers,
- sign off gates on work that was not theirs,
- export anyone's manuscript,
- drive `/api/studio/refine`, sending prose to a provider on the deployment's budget.

`/desk` was deployed and reachable this whole time.

### 3.2 The fix

1. **`requireAuth` on `/api/projects` and `/api/studio`.** The Atlas catalog
   (`/api/atlas/output-types`) stays public — a static list of output types with
   no user data, read by the "what are you writing" screen.
2. **`ProjectRecord.ownerId`, required.** Not optional: an optional field lets an
   unowned project be created by omission, which is how this happened.
3. **One authorisation path.** `loadOwnedProject()` fetches and authorises
   together, so a handler is `const record = await loadOwnedProject(...); if (!record) return;`
   and cannot do one without the other. All 15 handlers use it.
4. **404, not 403, for another user's project.** 403 confirms the id names a real
   project, turning id-guessing into an existence oracle. "Not yours" and
   "not there" are indistinguishable from outside.
5. **Unguessable ids** — `crypto.randomUUID()`. Ownership is the access control;
   an opaque id means a *leaked* id (URL, log, screenshot, shared link) discloses
   one project rather than a range.
6. **Owner-scoped listing only.** `listByOwner` is the sole enumeration path;
   there is no code path that returns every project.
7. **Studio sessions namespaced by user.** `sessionId` is client-supplied and
   keys consent grants and scope restrictions. Unnamespaced, one user could
   consent under session `s1` and another inherit that grant by sending the same
   `s1`. Keys are now `${userId}:${sessionId}`.

### 3.3 Verification

`server/routes/__tests__/project.authz.test.ts` — 37 tests. It does **not** mock
`requireAuth` (unlike `project.test.ts`, whose subject is gate logic); only the
Supabase token check underneath is faked, so what is under test is whether the
middleware is genuinely mounted.

The suite was checked against the bug it exists to prevent: with the auth guard
and ownership check reverted, **32 of 37 fail**. It is not passing vacuously.

### 3.4 Migration for existing data

`supabase/schema_store.sql` adds `owner_id uuid not null`, guarded by a
`do $$` block so an already-deployed table gets the column rather than silently
keeping its old shape (`create table if not exists` is a no-op on an existing
table, and every insert would then fail).

Rows created through the unauthenticated endpoint have no recoverable owner.
They are assigned the nil UUID — not deleted (that destroys user work), not left
nullable (a null would bypass the ownership check). No real Supabase user has
the nil UUID, so those rows become unreachable through the API: quarantined,
available for deliberate reassignment or purge.

---

## 4. Client-side changes

- **`DeskAuthGate`** — Desk renders nothing to an anonymous visitor, and **fails
  closed** when Supabase is unconfigured. Failing open there would turn a
  misconfiguration into an access-control failure.
- **`useDeskSession`** — subscribes to Supabase auth state rather than reading it
  once, so sign-out in another tab and token-refresh failure are reflected
  instead of leaving a signed-in shell whose every request 401s. Deliberately not
  `src/auth/authContext.tsx`: that context carries legacy concepts
  (`PaperProject`, `onboardingStep`) and coupling Desk to it would reattach the
  client being retired to the one replacing it.
- **`src/desk/api.ts`** — reads the access token per request, not once at module
  load. supabase-js refreshes tokens in the background; a cached header would
  produce sporadic 401s after about an hour.
- **`ProjectListScreen`** — Desk's entry surface. Reaching a project previously
  meant already knowing its id.
- **Back/Forward** — `popstate` is handled. Going back from a project used to
  leave the URL on the list with the shell still mounted.

---

## 5. What remains

1. **Feature parity.** Desk covers project list, gates, document submission,
   rubric findings, and Studio. Legacy additionally covers intake wizards, the
   Knowledge Vault, AI setup, export pipeline UI, and submission tracking. Each
   ports onto the gate-based model.
2. **Onboarding.** Registration, password recovery, AI setup, and optional Vault
   setup still live in the legacy app.
3. **Pocket.** Currently a tab inside the legacy app. It should become Desk's
   responsive form, not a third client.
4. **Route flip.** `/desk` → `/`, with legacy reachable during transition.
5. **Deletion.** `src/App.tsx` and the legacy-only components, once nothing
   routes to them.

### Known gap, unrelated but found here

`tsconfig.json` excludes `**/__tests__/**`, so **test files are never
typechecked**. This let a `store.create()` call keep compiling after the
signature gained a required parameter. Enabling it surfaces 199 pre-existing
errors — mostly `possibly undefined` after assertions — so it is a real cleanup,
tracked rather than bundled into this change.

---

## 6. Related

- `60-DESIGN-DIRECTION.md` — the design system these screens are built in
- `docs/04-architecture/46-SECURITY-ARCHITECTURE.md` — the security posture this restores
- `server/routes/__tests__/project.authz.test.ts` — executable form of §3
