# Database Access — HTTPS Data API over a Direct Connection

> **Doc ID:** 62 · **Status:** Accepted · **Date:** 2026-08-04
> **Depends on:** `45`, `61`

---

## 1. Decision

**Project persistence reaches Postgres through Supabase's Data API (PostgREST)
over HTTPS, not through a direct Postgres connection.**

`src/services/store/restProjectStore.ts` is the default backend.
`pgProjectStore.ts` is retained and still selected when `DATABASE_URL` is set
and Supabase credentials are not.

Backend precedence, in `src/services/store/projectStore.ts`:

| Order | Backend | Selected when |
|---|---|---|
| 1 | Data API (HTTPS) | `VITE_SUPABASE_URL` **and** `SUPABASE_SERVICE_ROLE_KEY` are set |
| 2 | Direct Postgres | `DATABASE_URL` is set and (1) is not available |
| 3 | In-memory | nothing else is configured — **warns loudly** |

---

## 2. Why

The direct connection was attempted first and did not survive contact with the
deployment. Four independent faults, each found only in production, each
costing an outage:

**1. The documented hostname does not resolve.** `db.<ref>.supabase.co`
publishes no A record — it is IPv6-only. Render's outbound network is
IPv4-only. The connection string in Supabase's own dashboard cannot be used
from Render at all.

**2. The pooler that fixes (1) needs three more things right.** Region
(`ap-south-1`), port, and a tenant-qualified username (`postgres.<ref>`) —
none of which appear in the connection string the dashboard shows first.

**3. TLS fails by default.** Supabase's certificate chains to its own root,
which Node does not trust:

```
Error: self-signed certificate in certificate chain
  code: 'SELF_SIGNED_CERT_IN_CHAIN'
```

The widely-copied fix is `rejectUnauthorized: false`, which restores the
connection by no longer verifying who answers it — on the link carrying every
user's documents. The correct fix is pinning Supabase's root CA, which is
committed (`supabaseRootCa.ts`) and still in place for backend (2).

**4. It needs a credential nothing else needs.** The database password is
distinct from the anon key, the service-role key, and the access token. Three
separate passwords were rejected with `28P01` while the role was demonstrably
healthy — `postgres` existed, could log in, and had a password set. The most
likely cause is a reset dialog whose value is shown before it is applied.
The Management API has no endpoint to reset it, and `ALTER USER postgres` is
refused (`42501`, only superusers may alter privileged roles), so it could not
be resolved from the server side at all.

The Data API path has none of these. It is HTTPS to the hostname the app
already uses, authenticated with the service-role key the server already needs
to verify tokens. **One credential, one protocol, one hostname.**

---

## 3. What this changes about the threat model

This is the part that matters more than the connectivity.

A direct Postgres connection is reachable only by something holding the
database password. **PostgREST publishes every table in the `public` schema at
`https://<ref>.supabase.co/rest/v1/<table>`**, reachable by anyone with the
anon key — which is public by design and ships inside the browser bundle.

`supabase/schema_store.sql` previously recorded, correctly for the connection
model at the time:

> No Row Level Security here: this table is written only from the server
> process, over a direct Postgres connection … never from a browser client
> with the anon key.

Adopting the Data API invalidates that sentence. Without RLS, anyone who viewed
the page source could read and rewrite every project in the database.

**RLS was already enabled on the live table — but only because Supabase enables
it by default on new tables, not because the schema asked for it.** A database
created from `schema_store.sql` alone would have had it off, and the move to
PostgREST would then have exposed everything. That is now explicit:

```sql
alter table public.projects enable row level security;
alter table public.projects force row level security;
```

with **deliberately zero policies**. RLS on with no policy denies `anon` and
`authenticated` entirely, while `service_role` and `postgres` keep full access
through `BYPASSRLS`. The server holds the service-role key; browsers never do.

Verified against the live project:

| Actor | Read | Write |
|---|---|---|
| `anon` | `[]` — filtered to nothing | `401`, `42501` row-level security violation |
| `service_role` | works | works |

Owner-level authorization stays in the route layer (`loadOwnedProject`), which
is the only place that can distinguish "not yours" from "not found" and answer
404 for both. A policy here could only deny.

**`restProjectStore.ts` must never be imported by client code.** It carries the
service-role key, which bypasses RLS. Its only consumer is
`server/routes/project.ts`.

---

## 4. Trade-offs accepted

**No multi-statement transactions.** PostgREST has no equivalent of `BEGIN` /
`COMMIT`. Acceptable here because this store's entire surface is single-row
reads, single-row upserts, and one owner-scoped list — every operation is
already atomic. **This does not generalise:** a store that must write two
tables consistently has to use backend (2), which is why it was kept.

**Less expressive queries.** Filters, ordering, and upserts are all this store
needs. Anything requiring a join, a CTE, or a window function belongs in SQL.

**A second code path to maintain.** Both backends implement the same
`ProjectStore` interface and share the route layer above them, so the cost is
bounded to one file.

---

## 5. Failure modes worth remembering

**An empty body is not an error.** `Prefer: return=minimal` writes return an
empty body, and PostgREST answers **201** for an insert, not only 204. Calling
`res.json()` on that throws `Unexpected end of JSON input` — which reported a
create that had genuinely succeeded as a 500, leaving the caller with a failure
and a row that existed anyway. The store now decides on the body, not the
status code.

The unit tests missed it because the fake returned `JSON.stringify(body)` for
every response, so an "empty" body arrived as the four characters `"null"`,
which parses cleanly. **A test double that is tidier than the real thing hides
exactly the bugs it was written to catch.**

**The in-memory fallback is the dangerous one.** It behaves correctly right up
until the process restarts, and on a plan that idles the container out after
~15 minutes, a user's projects vanish within the hour with nothing reported.
It now announces itself at startup rather than being entered silently.

---

## 6. Related

- `61-CLIENT-CONSOLIDATION.md` — the authorization model this persists
- `docs/04-architecture/45-DATA-ARCHITECTURE.md` — the longer-term target
- `src/services/store/restProjectStore.ts` · `pgProjectStore.ts` · `projectStore.ts`
- `supabase/schema_store.sql` — the RLS declaration
- `scripts/supabase-sql.sh` — running SQL over HTTPS when 5432 is unreachable
