# 21 — Data Residency and Security Architecture

Covers revision requirements #12 (local-first) and #13 (security). Resolves
[C-07](./11-requirements-conflicts.md#c-07--local-first-vs-administrator-visibility).

---

## 1. Data classification

`[RECOMMENDATION]` Four tiers. This table is the contract every other document
defers to; where a feature would move data up a tier, the tier wins.

| Tier | Contents | Location | Server can read |
|---|---|---|---|
| **1 — Never transmitted** | Manuscript text · uploaded files · datasets · provenance ledger · evidence content · API keys · local model I/O · vault passphrase | Device only | **No — never present** |
| **2 — Transmitted, opaque** | Encrypted project blobs when sync is enabled | Server (ciphertext) | **No — no key** |
| **3 — Transmitted, minimal** | Account identity · degree level · discipline · entitlement · aggregate counters · error reports (scrubbed) | Server | Yes |
| **4 — Server-side by nature** | Managed-mode inference payloads · outbound proxy requests | Server, ephemeral | Yes, in transit |

### Tier 4 is the honest exception

`[RECOMMENDATION]` Managed inference **necessarily** transmits content — that is
what inference is. Consequences, stated rather than glossed:

- Managed mode is a **capped trial**, never the default
  ([12](./12-client-strategy.md)).
- The user is told, in the AI Setup Wizard, that managed mode sends text to a
  third-party provider.
- BYOK sends to the user's own provider account under their own terms.
- **Local inference transmits nothing.** `[INFERRED]` This is the only
  configuration in which tier 1 is absolute, and it is the reason local runners
  matter beyond cost.
- Only the extracted text of **approved sources** needed for the specific task
  is sent — never the full library, never unapproved material
  ([15](./15-evidence-pipeline.md) §6).

---

## 2. What is local, synced, remote, never sent

`[RECOMMENDATION]` Requirement #12 asks for this explicitly:

**Always local.** Manuscripts and claims · provenance ledger · uploaded files
and datasets · decrypted API keys · vault passphrase · local model weights and
I/O · agent run records · draft history.

**Synced, only if the user opts in, always encrypted.** Manuscript and claim
structure · evidence *records* (metadata, not files) · ledger entries ·
project settings and requirement overrides.

**Server-side.** Account and auth records · entitlement · aggregate counters ·
rule packs and output catalogue (published *to* clients) · admin audit log.

**Never sent, under any configuration.** Vault passphrase · decrypted keys ·
raw uploaded files · local model I/O · manuscript content to an administrator.

---

## 3. Key and secret management

`[OBSERVED]` `apiVault.ts` implements client-side encryption with device-bound
or passphrase unlock, plus backup and restore.

`[RECOMMENDATION]`

- Keys encrypted at rest with a key derived from device binding or passphrase.
- **Never transmitted in plaintext.** BYOK keys are used from the client
  directly where CSP permits.
- `[OBSERVED]` A server-side `ENCRYPTION_KEY`-gated fallback exists that
  decrypts server-stored keys via a legacy `users.json` path
  ([09](./09-technical-debt-register.md) TD-03). `[RECOMMENDATION]` **Audit and
  remove.** It is a live path into a store the architecture no longer intends
  to use, and it contradicts tier 1.
- Passphrase loss is unrecoverable — stated at setup, at reset, and in admin
  documentation ([20](./20-admin-platform.md)).
- Desktop should use the OS keychain where available in preference to a
  browser-equivalent store.

---

## 4. Authentication and authorisation

`[OBSERVED]` Supabase-backed. `[OBSERVED]` `VITE_SUPABASE_ANON_KEY` is baked
into the client bundle by design — public.

`[INFERRED]` **Row-level security is therefore the entire authorisation
boundary for server-side data.** `[RECOMMENDATION]` It requires an explicit
audit with a written policy statement per table, and a test suite asserting
that a user cannot read another user's rows. `[OBSERVED]` This was not audited
during reconstruction and remains the largest unexamined security surface
(R-04 / TD-04).

`[RECOMMENDATION]` Authorisation model: users access only their own records;
administrators access tier 3 only; institutional administrators are scoped to
their tenant; no role grants access to tiers 1 or 2.

---

## 5. Data isolation

`[RECOMMENDATION]` Per-user isolation enforced at the database layer via RLS,
not in application code. `[INFERRED]` Application-level filtering fails open —
a missing `where` clause exposes everything; RLS fails closed.

`[RECOMMENDATION]` Institutional deployments are separate tenants with no
cross-tenant reads. Encrypted blobs are keyed per user so that even a database
compromise yields ciphertext without keys.

---

## 6. Transport and application security

`[OBSERVED]` Currently in place: `helmet` with an explicitly configured CSP
(`connect-src` extended, `form-action` set) and four rate limiters
(`aiAbuseLimit`, `parseFileLimit`, `parseExternalLinkLimit`, `lookupDoiLimit`).

`[RECOMMENDATION]` Gaps to close:

- **Rate limiting is in-process** and does not survive horizontal scaling —
  it fails open silently (TD-15). Move to a shared store before scaling.
- **SSRF on `/api/parse-external-link`** — user-supplied URLs are fetched
  server-side with no observed allowlist (TD-17). Require scheme and host
  validation, block private ranges, cap size and redirects.
- **50 MB synchronous parsing shares the SPA process** (TD-16) — move to an
  isolated worker.
- Uploaded files must be treated as hostile input: type verified by content,
  size capped, parsing sandboxed.

---

## 7. Threat model

`[RECOMMENDATION]` Ordered by expected impact.

| Threat | Vector | Mitigation | Residual |
|---|---|---|---|
| **Device compromise** | Malware, stolen unlocked device | Encryption at rest; passphrase unlock; OS keychain | **High** — local-first means the device is the boundary |
| **Lost/stolen device** | Physical | Encryption; sync as recovery **if enabled** | High if sync off — accepted cost |
| **RLS misconfiguration** | Public anon key + wrong policy | Audit; per-table policy; isolation tests | Unquantified until audited |
| **Provider key exfiltration** | XSS reaching vault | CSP; encryption; no plaintext in DOM | Medium |
| **Malicious upload** | Crafted PDF/DOCX | Sandboxed parsing; size caps; content-type verification | Medium |
| **SSRF** | External-link parsing | Allowlist, private-range blocking | **Open** (TD-17) |
| **Supply chain** | Compromised dependency | Lockfile, review, minimal deps; `[RECOMMENDATION]` no third-party "humanizer" (C-06) | Medium |
| **Prompt injection via source** | Malicious text in an uploaded PDF | Sources are data, never instructions; approval gate; outputs reviewed | Medium |
| **Server compromise** | Infrastructure | Tiers 1–2 unreadable; blast radius is tier 3 | **Low by design** |
| **Insider (admin)** | Privileged access | No mechanism to read tiers 1–2; admin audit log | **Low by design** |

`[INFERRED]` The bottom two rows are the architecture's strongest security
property and follow directly from local-first: a total server compromise
exposes account records and counters, not a single manuscript.

`[INFERRED]` The top two are its weakest, and are the direct cost of the same
decision. That trade is deliberate and must be communicated to users, not
buried.

`[RECOMMENDATION]` Prompt injection deserves particular attention as source
volume grows: an uploaded PDF containing instructions aimed at the model is a
realistic vector in a system whose core function is feeding sources to
inference. The approval gate limits exposure to material a human chose, which
helps but does not eliminate it.

---

## 8. Backup and disaster recovery

`[INFERRED]` The sharpest trade-off in the architecture. Local-first means
**the user is responsible for backups**, and R-12 rates data loss as
Medium × High. For a multi-year thesis, loss is catastrophic and entirely
plausible.

`[RECOMMENDATION]` User-facing:

- **Disclose at signup**, not on first loss ([13](./13-user-journey.md)).
- **Scheduled local export** — automatic snapshots to a user-chosen location,
  desktop by default.
- **One-click full backup** — a single portable, encrypted archive of projects,
  ledger, and evidence records. `[OBSERVED]` `apiVault.ts` already implements
  this pattern for keys; extend it to projects.
- **Optional encrypted sync** as the recovery path for users who want it.
- **Backup reminders** proportionate to unsaved work.

`[RECOMMENDATION]` Platform-side: server components are stateless with respect
to manuscripts, so recovery scope is account records, rule packs, and audit
logs — small, and restorable from standard backups. `[INFERRED]` Recovery
objectives are therefore modest; the hard recovery problem sits on the user's
device, which is exactly where the architecture chose to put it.

---

## 9. Privacy

`[RECOMMENDATION]`

- **Data minimisation** — collect only what operates the account.
- **No content analytics.** Counters, never text.
- **Opt-in telemetry**, locally inspectable before enabling
  ([20](./20-admin-platform.md)).
- **Export everything** — a user can extract all their data in open formats at
  any time.
- **Deletion is honest** — account deletion removes server records; local data
  is removed by the user on their device, and the UI says so.
- **Third-party transmission is named** — the AI Setup Wizard states which
  provider receives text under each mode.

`[INFERRED]` For an academic tool this is more than compliance posture:
unpublished research data and unsubmitted manuscripts are commercially and
academically sensitive, and confidentiality is a genuine adoption driver for
institutions — the same property that makes local inference attractive.
