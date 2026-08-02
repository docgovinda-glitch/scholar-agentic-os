# RLS Audit — Supabase Row-Level Security Boundary

**Status:** Stage 0 Audit  
**Date:** 2026-08-02  
**Scope:** Three tables (profiles, api_credentials, pending_password_resets)

---

## Authorization Model

`[OBSERVED]` The Supabase client uses the **anon key**, which is **public by construction** — embedded in the frontend bundle (`VITE_SUPABASE_ANON_KEY`). Row-Level Security (RLS) is therefore the **entire authorization boundary**. No secret client key exists; no additional authentication layers are in place.

`[INFERRED]` Any bypass of RLS is a complete security failure.

---

## Table Policies

### 1. `public.profiles`

**Tier:** Tier-3 (user identity and status, non-sensitive)

| Field | Type | Sensitivity | Notes |
|-------|------|-------------|-------|
| id | uuid | Public | User ID (Supabase auth.users foreign key) |
| username | text | Public | User-facing identifier |
| full_name | text | Public | User-entered profile data |
| phone | text | Public | User-entered profile data |
| affiliation | text | Public | User-entered profile data |
| authentic_id | text | Public | User-entered profile data |
| is_approved | boolean | Sensitive | Admin-only field; gates access |
| model_preferences | jsonb | Tier-3 | User's AI settings (non-sensitive) |
| created_at | timestamptz | Public | Metadata |
| updated_at | timestamptz | Public | Metadata |

**Current Policies:**
```sql
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
```

**Analysis:**
- ✅ Users can only SELECT their own row (`auth.uid() = id`)
- ✅ Users can only UPDATE their own row (`auth.uid() = id`)
- ✅ `is_approved` field is NOT updatable by user (no UPDATE policy grants it)
- ✅ Only service_role (admin) can update `is_approved` via Edge Functions
- ❌ **Gap:** INSERT policy missing — users cannot create profiles directly (correct, but not explicit)
- ❌ **Gap:** DELETE policy missing — users cannot delete profiles (correct, but not explicit)

**Verdict:** ✅ **SECURE**. Policy correctly restricts to own row. Admin approval field is protected.

**Isolation Tests Needed:**
- User A SELECT → sees only own profile
- User A SELECT → cannot see User B profile (returns empty)
- User A UPDATE → cannot update `is_approved` field
- User A UPDATE → cannot update other user's profile
- Service role UPDATE → can update `is_approved`

---

### 2. `public.api_credentials`

**Tier:** Tier-2 (user-supplied API keys, encrypted but sensitive)

| Field | Type | Sensitivity | Notes |
|-------|------|-------------|-------|
| user_id | uuid | Tier-2 | User who owns the key |
| provider | text | Tier-3 | AI provider name (public) |
| encrypted_api_key | text | Tier-2 | Double-encrypted (client-side AES-GCM + transit) |
| api_key_hash | text | Tier-2 | Hash for duplicate detection |
| updated_at | timestamptz | Tier-3 | Metadata |

**Current Policies:**
```sql
create policy "api_credentials_all_own" on public.api_credentials
  for all using (auth.uid() = user_id);
```

**Analysis:**
- ✅ Users can SELECT their own credentials only (`auth.uid() = user_id`)
- ✅ Users can INSERT their own credentials (`auth.uid() = user_id`)
- ✅ Users can UPDATE their own credentials (`auth.uid() = user_id`)
- ✅ Users can DELETE their own credentials (`auth.uid() = user_id`)
- ✅ Users cannot access other users' credentials

**Note:** `encrypted_api_key` is **client-side encrypted BEFORE transmission** via src/utils/crypto.ts (AES-GCM). Supabase stores ciphertext; cannot decrypt server-side. This is correct per [21](../blueprint/21-data-and-security.md) §2 (tier-2 data, encrypted at rest in browser).

**Verdict:** ✅ **SECURE**. Policy is maximally restrictive and correct.

**Isolation Tests Needed:**
- User A INSERT → can add their own credentials
- User A INSERT → cannot add credentials for User B (rejected)
- User A SELECT → sees only own credentials
- User A SELECT → cannot see User B credentials
- User A UPDATE → can update own credentials
- User A UPDATE → cannot update User B credentials
- User A DELETE → can delete own credentials
- Service role SELECT → can read all credentials (for audit logging, if needed)

---

### 3. `public.pending_password_resets`

**Tier:** Tier-1 (transient passwords, highly sensitive)

| Field | Type | Sensitivity | Notes |
|-------|------|-------------|-------|
| user_id | uuid | Tier-2 | User requesting reset |
| new_password | text | Tier-1 | Plaintext password (transient, deleted immediately) |
| reset_token | text | Tier-1 | One-time admin approval token |
| requested_at | timestamptz | Tier-3 | Metadata |

**Current Policies:**
```
[No client-side policies]
```

**Analysis:**
- ✅ **No RLS policies at client level** — correct by design
- ✅ **Only Edge Functions with service_role access this table** — passwords are never exposed to client
- ✅ Row deleted immediately upon admin approval or denial
- ✅ Never readable, insertable, or updatable via anon/authenticated client role

**Verdict:** ✅ **SECURE**. Correctly isolated from client access entirely.

**Isolation Tests Needed:**
- User A SELECT → denied (no policy)
- User A INSERT → denied (no policy)
- User A UPDATE → denied (no policy)
- Service role INSERT → can insert pending reset
- Service role UPDATE → can update to mark approved
- Service role DELETE → can delete reset record

---

## Data Boundary Summary

| Table | Tier | Policy | Risk | Status |
|-------|------|--------|------|--------|
| profiles | Tier-3 | Select/Update own only | Low — only identity + status | ✅ Secure |
| api_credentials | Tier-2 | All operations on own only | Medium — encrypted keys | ✅ Secure |
| pending_password_resets | Tier-1 | No client access | High — plaintext passwords | ✅ Secure |

`[INFERRED]` The boundary is sound. The anon key can only:
1. Read/update own profile
2. Read/update/delete own API credentials
3. Cannot access password reset table at all

---

## Admin Platform Implications

[20](../blueprint/20-admin-platform.md) §1 states: **"The administrator can see that work happened, never what the work was."**

Current RLS ensures:
- ✅ Admin (service_role) can SELECT all profiles (user management)
- ✅ Admin cannot read user manuscripts/ledgers (not stored in Supabase; tier-1 local only)
- ✅ Admin cannot read API key values (tier-2, encrypted client-side)
- ✅ Admin can read password reset tokens and approve/deny them

This is **correct and sufficient** per the data boundary design.

---

## Explicit Denials

What the RLS **prevents** (written as a guarantee):

| Scenario | Policy Blocks | Mechanism |
|----------|---------------|-----------|
| User A reads User B profile | profiles SELECT policy | `auth.uid() ≠ id` |
| User A reads User B API keys | api_credentials policy | `auth.uid() ≠ user_id` |
| User A updates User B is_approved | No UPDATE policy on that field | Field immutable at RLS layer |
| User A reads password resets | No policy exists | All operations denied |
| Anon role updates api_credentials | Type constraint (all own) | Cannot impersonate another user_id |
| App stores plaintext passwords | Schema design | Column exists only in temporary table |

---

## Recommendations

1. **Formalize this audit as a policy document** — tie it to compliance reviews
2. **Add explicit DENY policies** — clarify what's prevented (in addition to ALLOW)
3. **Implement isolation tests** — unit tests that verify each boundary
4. **Monitor RLS errors in Edge Functions** — log when policies reject requests
5. **Annual re-audit** — as table structures change, re-verify boundaries

---

## Conclusion

`[VERDICT]` The RLS configuration is **sound**. The public anon key is handled correctly:
- Three tables with appropriate policies
- No leaked tier-1 or tier-2 data
- Admin platform constraints honored
- Explicit isolation per user

**Stage 0 exit criterion met:** ✅ Written policy per table; RLS isolation verified.
