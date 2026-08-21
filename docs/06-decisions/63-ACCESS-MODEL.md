# Access Model — Self-Service Registration with Direct Supabase Authentication & Client AI Isolation

> **Doc ID:** 63 · **Status:** Accepted (Revised) · **Date:** 2026-08-21
> **Supersedes:** August 4, 2026 manual approval gate decision
> **Depends on:** `01`, `25`, `46`

---

## 1. Decision

**Scholar OS uses direct Supabase Authentication with self-service registration and email verification. Normal users do NOT require manual administrator approval.**

1. **Self-Service Registration**: Users register directly with their email, username, and password.
2. **Email Verification**: Standard email confirmation activates the account immediately.
3. **Data Minimization**: Affiliation is optional; no institutional ID upload or identity documents are collected for general accounts.
4. **Client AI Resource Pool**: Non-premium AI runs 100% in-browser via Local AI, Free Cloud, or User BYOK (Conflict #3). Platform credentials are strictly protected by Premium entitlement checks, completely removing the original rationale for an approval gatekeeper.
5. **Reactive Moderation**: Administrators manage platform abuse reactively via `public.profiles.account_status in ('active', 'restricted', 'suspended', 'deleted')`.

---

## 2. Context & Evolution

In early development (Aug 4, 2026), manual administrative approval was considered as a stopgap to protect a shared server-side model credential from open consumption.

Subsequent architectural developments permanently resolved that concern:
- **Conflict #3 (AI Execution & Egress)**: Re-architected all non-premium AI execution to the Client AI Resource Pool. Open signups cannot consume platform credentials.
- **Database & Auth Overhaul (Aug 14–15, 2026)**: `2026-08-14_account_system_repair.sql` dropped `authentic_id`, dropped `is_approved`, and automated profile creation with `account_status = 'active'`.
- **Local-First & Data Minimization Philosophy**: Removing bureaucratic approval gates empowers independent, freelance, and student researchers while eliminating the liability of collecting sensitive verification documents.

---

## 3. Authoritative Architecture

| Aspect | Authoritative Design |
|---|---|
| **Registration** | Self-service via Supabase Auth |
| **Account Activation** | Immediate upon email verification (`account_status = 'active'`) |
| **Institutional ID** | **None.** Affiliation is optional |
| **Password Reset** | Self-service via standard Supabase `resetPasswordForEmail()` |
| **Admin Role** | Reactive account moderation (`account_status: suspended`) and telemetry |
| **Platform AI Protection** | Independent server-side Premium entitlement checks (426) |

---

## 4. Consequences

**Positive:**
- Immediate, friction-free onboarding for researchers worldwide.
- Adherence to data minimization: server stores only basic account metadata.
- Zero server/database bottleneck from manual approval queues.
- Independent and unaffiliated scholars can use Scholar OS freely.

**Security & Governance:**
- Abuse is mitigated via express rate limits, email verification, and administrative suspension.
- Platform AI resources remain 100% isolated behind cryptographic entitlement verification.

---

## 5. Related Decisions

- `01` §1 — Web/PWA, client-first architecture.
- `25` §2 — Self-service onboarding directly to Project List.
- `30` — Dual-layer workflow taxonomy.
- `src/services/supabaseAuthService.ts` — Active authentication service.
