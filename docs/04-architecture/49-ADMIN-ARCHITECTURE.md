# Admin Architecture — The Foundry and the Operator Console

> **Doc ID:** 49 · **Status:** Design · **Depends on:** `42`, `46`, `48`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

Operator tooling designed for a team of two to four people who are not platform
specialists — and the isolation that keeps administrative AI away from user
content.

---

## 1. Design constraint

**Sam is the whole operations team** (`10` §2.1, P7). Technical, but not an SRE.
No on-call rotation. No dedicated platform engineer.

Every capability in this document is measured against one question: *can two
people run this without it becoming their full-time job?* That constraint
produces specific design choices:

| Choice | Because |
|---|---|
| Agent behaviour is configuration, not code | Fixing a prompt cannot require a desktop release |
| Feature flags for everything risky | Rollback in seconds, without a deploy |
| Managed cloud services | No database administration |
| Diagnosis works without user content | Support cannot require access we do not have |
| Aggregate analytics only | No per-user investigation surface to build or secure |
| Golden-set evaluation | Quality assurance that runs unattended |

---

## 2. Capabilities

`REQ-ADM-1`. Thirteen areas.

| Area | What the operator can do |
|---|---|
| **User management** | Search accounts, view status, suspend, restore, delete, resend verification |
| **Authentication** | Reset MFA (with verification), revoke sessions, view device lists, investigate lockouts |
| **Subscriptions** | View, change tier, apply credits, handle refunds, view billing state |
| **Announcements** | Compose, target by tier or version, schedule, publish to the notification centre |
| **AI provider config** | Enable and disable providers, set defaults, configure managed-credit routing |
| **Model registry** | Add, update, deprecate models; set pricing, capabilities, and task suitability |
| **Feature flags** | Toggle per tier, per version, per cohort; instant rollback |
| **Plugin approvals** | Review submissions, approve, reject with reasons, revoke |
| **Diagnostics** | System health, error rates, provider status, performance percentiles |
| **Logs** | Cloud-plane logs, admin audit, security events |
| **Agent versions** | The Foundry (§5) |
| **Deployment** | Release channels, staged rollout, rollback |
| **Analytics** | Aggregate product metrics (§8) |

---

## 3. Two-plane isolation

`REQ-ADM-2`, `REQ-ADM-3`. The hardest boundary in the system.

```
╔══════════════ USER PLANE ══════════════╗   ╔═══════ ADMIN PLANE ═══════╗
║                                         ║   ║                            ║
║  User devices                           ║   ║  Operator console          ║
║   └── kernel, keys, content             ║   ║  Foundry                   ║
║                                         ║   ║  admin/gateway ────────────╫──▶ admin AI
║  Cloud: identity · licensing            ║   ║   (separate credentials)   ║      provider
║         relay (ciphertext) · registry   ║   ║                            ║
║                                         ║   ║  Aggregate telemetry       ║
╚═════════════════╤═══════════════════════╝   ╚═════════════╤══════════════╝
                  │                                          │
                  └──────── writes ─────▶ registry ◀─ publishes
                            (signed, one-way)
```

### 3.1 The isolation rules

| Rule | Enforcement |
|---|---|
| Admin AI uses a separate gateway with separate credentials | Different module (`admin/gateway`), different key store |
| Admin AI never receives user content | There is no code path; user content is not in the admin plane's reach |
| No shared runtime between planes | Separate deployments, separate networks |
| No admin credential decrypts user content | No such key exists (`REQ-SEC-11`) |
| Admin-plane code never imports user-plane code | Architectural test in CI (`13` §4) |
| The only channel is the signed registry | One-way: admin publishes, clients consume |

### 3.2 What this costs, and why it is worth it

The operator **cannot** look at a user's document to debug a problem. That is a
real operational cost, and it is the point: a support process that can read
dissertations is a support process that will eventually leak one.

The compensating mechanism is §7: users export a reviewed diagnostic bundle,
and problems are reproduced against golden sets rather than against user data.

---

## 4. Operator console

Deliberately plain. A dashboard, a search box, and thirteen sections.

```
┌──────────────────────────────────────────────────────────┐
│  Scholar OS Admin              Sam ▾    ● all systems ok │
├────────────┬─────────────────────────────────────────────┤
│ Overview   │  Today                                       │
│ Users      │   1,240 active · 89 new · 4.2k agent runs    │
│ Agents     │   error rate 0.3% · p95 latency 1.4s         │
│ Registry   │                                              │
│ Flags      │  Needs attention                             │
│ Plugins    │   ⚠ 3 plugin submissions awaiting review     │
│ Announce   │   ⚠ anthropic error rate 2.1% (up from 0.4%) │
│ Diagnostics│   ⚠ AG-14 acceptance down 6% since 2.4.0     │
│ Logs       │                                              │
│ Analytics  │  Recent admin actions                        │
│ Audit      │   14:02 Sam promoted AG-13 2.4.0 → stable    │
└────────────┴─────────────────────────────────────────────┘
```

**"Needs attention" is the console's whole design.** A two-person team does not
browse dashboards; they need to be told what changed and what is wrong. Empty
when nothing is wrong.

---

## 5. The Foundry

Where agents are authored, evaluated, and released (`REQ-ADM-4`).

### 5.1 Workflow

```
  Author ──▶ Evaluate ──▶ dev ──▶ beta ──▶ stable
     ▲          │                   │
     └── iterate┘         monitor ──┘        rollback at any point
```

### 5.2 Authoring

An agent version is configuration (`42` §9):

| Editable | |
|---|---|
| Prompts | Per model family, with variants for small local models |
| Model preference | Task class and quality tier |
| Output schema | What the agent must produce |
| QA checkpoints | Declared runtime guards |
| Thresholds | Confidence cut-offs, limits |
| Tool grants | Within what the code already permits |

**Not editable from the Foundry:** the capability set beyond what the code
implements and gates. Configuration changes behaviour inside a fixed security
envelope (`42` §9).

### 5.3 Evaluation

```
Golden set (versioned, no user content)
        │
        ├─▶ run current stable      → baseline
        ├─▶ run candidate           → results
        │
        ├─▶ per-case diff
        ├─▶ metric comparison
        └─▶ regression check across ALL affected golden sets
```

Golden sets are built from public documents, synthetic cases, and
operator-authored examples. **They never contain user content** — which is both
a privacy property and a practical one: golden sets must be shareable within the
team and stable across years.

### 5.4 Promotion gates

| To | Requires |
|---|---|
| `dev` | Evaluation completed (any result) |
| `beta` | No regression on any affected golden set; target metric improved |
| `stable` | 48h minimum in beta · error rate within tolerance · acceptance rate not degraded · **passing evaluation** (`REQ-ADM-5`) |

A permission change on an agent requires explicit user re-consent and cannot be
shipped as a silent update (`42` §7.1).

### 5.5 Rollback

One action, effective on next client registry fetch (minutes). Users pinned to
the rolled-back version are notified and migrated with a stated reason.

---

## 6. Feature flags

| Property | Behaviour |
|---|---|
| Targeting | Tier, app version, channel, cohort, percentage |
| Evaluation | Client-side, from the signed registry; cached; works offline with the last-known value |
| Kill switches | Every risky feature has one |
| Defaults | A flag that fails to resolve uses its safe default, not its enabled state |
| Audit | Every change logged with actor and reason |

Flags are how a two-person team ships confidently: a feature can be dark-launched,
enabled for 5%, and killed in seconds without a release.

---

## 7. Diagnostics without user content

`REQ-ADM-3` means support cannot read a user's project. The compensating design:

### 7.1 User-exported diagnostic bundle

```
┌── Send diagnostics ──────────────────────────────┐
│  This bundle contains:                            │
│    ✓ App version, OS, hardware summary            │
│    ✓ Error log (last 24 hours)                    │
│    ✓ Agent run metadata — no inputs or outputs    │
│    ✓ Performance measurements                     │
│    ✓ Settings (API keys excluded)                 │
│                                                   │
│  It does NOT contain:                             │
│    ✗ Your documents or any text you wrote         │
│    ✗ Your sources or Vault contents               │
│    ✗ API keys or passphrases                      │
│    ✗ Prompts or model responses                   │
│                                                   │
│  [Review full contents]  [Send]  [Cancel]         │
└───────────────────────────────────────────────────┘
```

The user can inspect the exact bundle before sending. Nothing is transmitted
automatically.

### 7.2 Reproduction

Problems are reproduced against golden sets and synthetic projects, never against
user data. When a user reports a bad agent output, the operator's path is: get
the aggregate signal, construct or find the equivalent golden-set case, reproduce
there, fix, evaluate, promote.

This is slower than reading the user's document, and it is the trade the
architecture makes deliberately.

---

## 8. Analytics

`REQ-ADM-8`. Aggregate and privacy-preserving.

| Collected | Not collected |
|---|---|
| Feature usage counts | What any individual did |
| Funnel counts per onboarding stage | Per-user paths |
| Gate transition counts and durations | Project content or titles |
| Agent run counts, error rates, latencies | Inputs or outputs |
| Provider usage distribution | Which user used which provider |
| Aggregate authorship-ratio distribution | Any user's ratio |
| Crash rates by version and platform | Stack traces containing content |
| Performance percentiles | — |

### 8.1 Method

Counts are aggregated on-device and submitted as periodic, unlinkable batches
with no account identifier. Users may opt out entirely (`46` §14).

**The integrity metrics matter most** (`10` §8.2) and are the clearest example
of what aggregate analytics can and cannot tell us: we can see that the median
authorship ratio is 71% and that the export-override rate rose to 11% after a
release. We cannot see, and do not want to see, whose.

---

## 9. Institutional administration

For institutional tiers, a scoped sub-console for the institution's own admin.

| Can | Cannot |
|---|---|
| Manage members and seats | Read any member's content |
| Set workspace defaults (citation style, institution profile) | Access documents, drafts, or Vaults |
| Configure AI policy for institutional workspaces | Receive authorship reports automatically |
| Set an institution profile (`14` §11) | Disable a user's ability to see the policy |
| Configure managed backup destinations | Silently enable key escrow (`44` §10) |
| View aggregate, anonymised usage | View per-user activity |

**The boundary restated:** institutions configure policy; they do not receive
student work (`32` §11). A feature request to surface individual students'
authorship reports to their department is refused, and the refusal is recorded
here so the answer is stable.

---

## 10. Deployment operations

| Operation | Approach |
|---|---|
| Desktop release | Signed, staged rollout (5% → 25% → 100%) with automatic halt on a crash-rate spike |
| Cloud deploy | Managed services; blue-green where supported |
| Registry publish | Signed, versioned, CDN-cached; effective within minutes |
| Rollback: desktop | Users offered the prior version; auto-update paused |
| Rollback: cloud | Redeploy prior |
| Rollback: registry | Republish prior version |
| Migration | Client-side, with a snapshot first (`45` §8) |

Registry publishing is the fast path and covers most operational needs: model
availability, agent versions, venue profiles, and feature flags all change
without a desktop release.

---

## 11. Runbooks

Written for someone with no context at 2am.

| Runbook | Covers |
|---|---|
| Provider outage | Detect, verify, adjust default routing, announce |
| Agent regression | Identify, evaluate, roll back, communicate |
| Auth incident | Revoke, force reset, notify |
| sync service unavailable | Confirm clients degrade correctly, communicate, restore |
| Bad release | Halt rollout, roll back, post-mortem |
| Plugin incident | Revoke signature, disable remotely, notify affected users |
| Billing failure | Identify affected accounts, apply grace, communicate |
| Data-migration failure | Halt, verify snapshot restore path, hotfix |

Each is a checklist with the exact console actions, not prose.

---

## 12. Admin audit

`REQ-ADM-6`. Every operator action affecting users is recorded:

```yaml
at: ts
actor: sam@…
action: agent.promote
target: AG-13 2.4.0 → stable
justification: "Fixes Chicago notes formatting; eval 96%→99%"
```

Immutable, retained 24 months, reviewable by someone other than the actor.
Justification is required for anything affecting users — the field exists to make
the operator articulate the reason at the moment they act.

---

## 13. Current state

`server/routes/admin.ts` and an admin approval UI at `/admin/approve-scholar`
exist, on the same server as user-facing routes. A later pass (docs
50-AI-ACCESS-ENGINE-IMPLEMENTATION.md §13) added a dedicated `/admin` entry
point with its own login, per-admin permission scopes, and real user
search/suspend/restore/delete — a practical middle ground given this
product's actual two-person operational scale (§1), not the fully separate
admin plane this doc describes as the target.

| Current | Target |
|---|---|
| Admin routes on the same server as user-facing routes, but a dedicated `/admin` client entry point with no user-facing link, its own login, and code-split out of every ordinary user's bundle (doc 50 §13) | Physically separate admin plane — different deployment, different network |
| No plane isolation | Enforced two-plane isolation with CI verification |
| Flat admin_users boolean, now with six named permission scopes an admin can be granted a subset of, plus a hardcoded, unrevokable root admin (doc 50 §13) — still not the thirteen capability areas below | Thirteen capability areas |
| User management: search (username/full name/email), suspend/restore, permanent delete now real (doc 50 §13) — resend verification, MFA reset, session revocation, and device lists still don't exist | Full "Authentication" row (reset MFA, revoke sessions, view devices) |
| No agent versioning | The Foundry with evaluation-gated promotion |
| No feature flags | Flags with targeting and kill switches |
| No golden sets | Per-agent evaluation suites |
| Admin audit exists (`admin_audit_log`, doc 50 §12/§13) but without a required-justification field | Immutable audit with required justification |
| No aggregate analytics | Privacy-preserving aggregate telemetry |
| Shared AI credentials | Separate `admin/gateway` with separate credentials |

The existing approval workflow, extended by doc 50 §13's user management, is
a reasonable seed for the "User management" capability row; the isolation
boundary is still new construction and is a Phase 1 concern, because
retrofitting plane separation is far harder than building it.
