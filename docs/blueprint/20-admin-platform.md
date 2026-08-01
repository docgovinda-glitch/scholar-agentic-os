# 20 — Administrator Platform

Covers revision requirement #11. Operates under the data boundary in
[21](./21-data-and-security.md).

`[RECOMMENDATION]` **Founding constraint: the administrator can see that work
happened, never what the work was.** Manuscripts, sources, and provenance
ledgers are tier-1 data — they never leave the device. Every capability below is
designed within that limit, and where a conventional admin feature would breach
it, the limit wins.

`[INFERRED]` This is stricter than most platforms and is a deliberate
consequence of requirement #12. It rules out familiar tools — content
moderation, "log in as user", support access to documents — and those exclusions
are stated rather than left to be discovered.

---

## 1. User management

`[RECOMMENDATION]` Visible: account identity, degree level and discipline,
registration and approval state, entitlement tier, last-active date, device
count.

Actions: approve or reject registration `[OBSERVED]` (flow exists), suspend,
reset entitlement, initiate password reset, delete account.

`[RECOMMENDATION]` **Not available:** viewing a user's projects, sources, or
manuscripts; impersonation. `[INFERRED]` No mechanism exists — the data is not
on the server and is encrypted where it is.

`[RECOMMENDATION]` Account deletion removes server-side records only. Local
data is deleted by the user on their own device, and the UI must say so
plainly. `[INFERRED]` An admin who believes deletion removed everything would
be wrong in a way that matters for data-protection requests.

---

## 2. Authentication

`[OBSERVED]` Supabase-backed, with registration approval and password reset as
Edge Functions.

`[RECOMMENDATION]` Configurable: registration mode (open, approval-required,
domain-restricted, invite-only), session lifetime, MFA policy, SSO for
institutional deployments, password policy.

`[RECOMMENDATION]` The admin console must display a standing warning:
**resetting a password does not recover a user's local encryption passphrase.**
`[OBSERVED]` Vault keys under passphrase unlock are unrecoverable by design —
support staff who assume otherwise will give wrong answers.

---

## 3. AI provider configuration

`[OBSERVED]` 28 cloud providers and 11 local runners are already catalogue-driven.

`[RECOMMENDATION]` Admin controls: which providers are offered per deployment;
managed-mode key management; **per-user and per-tier quotas**; model
allow/deny lists; routing policy defaults; cost ceilings with automatic
cutoff.

`[INFERRED]` Quota is the most consequential control here. `[OBSERVED]` A
server-held `GEMINI_API_KEY` is in use and `src/ai/quota` exists but is not
wired into the live path — so managed-mode cost currently scales linearly with
users with no enforcement point (R-09).

`[RECOMMENDATION]` Institutional deployments can point managed mode at an
institution-controlled endpoint, keeping inference inside their boundary.

---

## 4. Usage monitoring

`[RECOMMENDATION]` Counters only. Every metric below is a number, never
content:

- Active users by period, degree level, discipline
- Output types created; completion and abandonment rates by stage
- **Gate hit rates** — which gates block most often, and where users abandon
- Agent invocations, success and failure rates by failure mode
- Inference volume and cost by provider, model, mode
- Client mix (desktop/web), version distribution
- Rule-pack usage and staleness

`[INFERRED]` Gate hit rates are the single most valuable metric the platform
can collect. They answer whether the compliance wedge is used and valued —
R-01, the highest-scoring risk in [08](./08-risk-register.md) — and there is
currently no way to know.

`[RECOMMENDATION]` Telemetry is **opt-in and locally inspectable**: a user can
see exactly what would be transmitted before enabling it. `[INFERRED]` A
privacy-positioned product cannot ship silent analytics without undermining its
own claim.

---

## 5. System configuration

`[RECOMMENDATION]` Feature flags per deployment and tier; output-type
catalogue enable/disable; default citation styles by discipline; storage and
sync policy (whether sync is offered at all); branding for institutional
deployments; support and escalation contacts.

---

## 6. Rule-pack lifecycle

`[INFERRED]` The most important admin function, because rule packs are the moat
([04](./04-market-position.md)) and stale packs are the second-highest risk
(R-13).

`[RECOMMENDATION]`

- **Authoring** — structured editor over the `VenueRulePack` schema; no code.
- **Review queue** — packs whose `reviewedAt` has aged past their cadence.
- **Staleness report** — ordered by usage × age, so the highest-traffic stale
  packs surface first.
- **Versioning** — `effectiveFrom` publication; historical versions retained so
  past submissions remain checkable.
- **Contribution** — institutions maintain their own packs, with review before
  publication.
- **Provenance** — `sourceUrl` and `reviewedAt` mandatory; a pack cannot be
  published without them.

---

## 7. Model deployment and pre-release evaluation

Requirement #11 asks for local evaluation of new agent capabilities before
release.

`[RECOMMENDATION]` An **evaluation sandbox**, isolated from production:

```
1  Candidate registered — new model, prompt version, agent version, rule pack
2  Run against a curated fixture set (synthetic + consented real cases)
3  Score: deterministic correctness, quality-check pass rate,
   gate-outcome parity, cost, latency
4  Compare against the incumbent
5  Explicit human approval to promote
6  Staged rollout — internal → cohort → fleet
7  One-step rollback
```

`[RECOMMENDATION]` **Gate-outcome parity is a hard requirement.** A candidate
that changes any gate outcome on the fixture set is rejected unless the change
is the explicit, reviewed purpose of the release. `[INFERRED]` This is the
control that makes the "adaptive behaviour" in
[19](./19-agent-architecture.md) §7 safe: adaptation cannot quietly loosen
compliance, because loosening shows up as a parity failure.

`[RECOMMENDATION]` Fixtures use synthetic or explicitly consented material.
`[INFERRED]` Harvesting user manuscripts for evaluation would breach the tier-1
boundary — the sandbox must not become a back door to the data the architecture
promises never to transmit.

---

## 8. Release management

`[RECOMMENDATION]` Web releases are server-controlled; **desktop releases are
not** — users may run old versions indefinitely.

Therefore:

- Version-compatibility policy for sync and rule packs, with a supported
  minimum
- Rule packs versioned independently of the application, so compliance updates
  reach users without a client upgrade
- Deprecation windows and in-client upgrade prompts
- Signed desktop builds per platform
- Rollback for both application and rule packs

`[INFERRED]` Rule packs shipping independently is essential: a publisher policy
change must reach users in days, and a desktop release cycle cannot guarantee
that.

---

## 9. Audit logging

`[RECOMMENDATION]` Two distinct logs, never merged:

**Administrative audit (server).** Every admin action: who, what, when, before
and after. Covers account changes, provider and quota configuration, rule-pack
publication, model promotion, feature flags. Append-only, retained per policy,
exportable for compliance review.

**User provenance ledger (local).** Every authoring action. `[RECOMMENDATION]`
**Never transmitted to administrators.** Belongs to the user; exportable *by
them* as the provenance report in [18](./18-finalisation-export.md).

`[INFERRED]` Keeping these separate is what makes both trustworthy. An admin
log that could reach into manuscripts would make the local-first promise
false; a provenance ledger the admin could edit would make the audit trail
worthless.

---

## 10. What the administrator cannot do

`[RECOMMENDATION]` Stated explicitly, because the absences are design
decisions:

| Cannot | Why |
|---|---|
| Read manuscripts, sources, ledgers | Tier 1 — never transmitted |
| Decrypt synced projects | Tier 2 — client-side encryption; server has no key |
| Impersonate a user | No mechanism; data is not server-side |
| Recover a lost passphrase | Cryptographically impossible by design |
| Retrieve data after device loss | `[INFERRED]` The stated cost of local-first (R-12) |
| Alter a user's provenance ledger | Would destroy the audit trail's value |
| Force a disclosure statement | User-controlled per requirement #8 |

`[RECOMMENDATION]` These limits belong in user-facing documentation as
guarantees, and in support documentation as escalation boundaries — support
staff will be asked for several of them and must be able to answer honestly.
