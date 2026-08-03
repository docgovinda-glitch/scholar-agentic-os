# Security Architecture

> **Doc ID:** 46 · **Status:** Design · **Depends on:** `40`, `44`, `45`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

Threat model, key custody, encryption, sandboxing, authentication, audit, and
deletion.

---

## 1. Security posture

**Revision 2 changes this posture materially and the change is stated plainly.**

Revision 1 excluded the operator by construction — content was encrypted with
client-held keys and we could not decrypt it. A web application cannot do that
while processing documents server-side.

Revision 2's posture: **the operator holds the keys, and access is constrained by
controls rather than by mathematics.** Encryption at rest via managed KMS, no
routine staff access path, break-glass only with two-person approval, and
mandatory notification of the affected user (`44` §4).

This is weaker than revision 1 and stronger than the category norm. `44` §11
records the trade-off.

| Property | How |
|---|---|
| Zero-knowledge for content | E2E encryption with client-held keys |
| Least privilege | Capability tokens for agents and plugins |
| Defence in depth | Process isolation, sandboxing, encryption, egress control |
| Fail closed | An undecidable security decision denies |
| Auditable | Local audit log the user can read |
| No security by obscurity | The design is documented here; its strength is the crypto and the architecture |

---

## 2. Threat model

### 2.1 Assets

| Asset | Sensitivity | Why |
|---|---|---|
| Unpublished manuscripts | **Critical** | Career-defining, embargoed, sometimes under ethics approval |
| Research data | **Critical** | May include participant data under IRB/GDPR |
| Vault contents | **Critical** | Years of accumulated work |
| API keys | High | Financial exposure |
| Provenance Ledger | High | Evidentiary value |
| Account credentials | High | Access to sync |
| Sync envelopes | Medium | Encrypted, but traffic-analysable |
| Aggregate telemetry | Low | No user identifiers |

### 2.2 Adversaries

| Adversary | Capability | Primary mitigation |
|---|---|---|
| **Opportunistic thief** | Stolen laptop | Full-disk + application encryption, sealed keys |
| **Network attacker** | Traffic interception | TLS everywhere, certificate validation |
| **Malicious plugin** | Runs code in-app | WASM sandbox, capability tokens, review |
| **Compromised AI provider** | Sees whatever we send | Warden minimises what is sent; local models send nothing |
| **Compromised operator infrastructure** | Full cloud access | E2E encryption; ciphertext only |
| **Malicious operator insider** | Full cloud access, code access | E2E encryption; two-plane isolation; signed releases |
| **Institutional overreach** | Admin-configured policy | Escrow is visible and per-workspace; policy cannot be silent |
| **Coerced disclosure (legal)** | Compels the operator | We cannot produce plaintext; we can produce ciphertext and account metadata |
| **Malicious source document** | Crafted PDF or web page | Sandboxed parsing, prompt-injection defences |
| **Another user** | Their own account | Row-level security, per-account key isolation |

### 2.3 Out of scope

Stated honestly, because a threat model that claims everything protects nothing:

| Not defended against | Why |
|---|---|
| Compromised OS or kernel-level malware | Nothing at application layer helps |
| Physical access to an unlocked, running machine | Keys are in memory by necessity |
| A user who chooses to paste their work into a chatbot | Their machine, their choice |
| A user fabricating their own Ledger | `32` §8.1 |
| Compromise of a user's chosen AI provider's own systems | We minimise what is sent; we cannot control their infrastructure |

---

## 3. Trust boundaries

Per `40` §3. Controls at each:

| Boundary | Control |
|---|---|
| B1 Renderer ↔ service tier | Typed IPC; input validation at the service tier; no key or store handles cross |
| B2 service tier ↔ plugin | WASM sandbox; capability tokens; resource limits; no ambient authority |
| B3 Device ↔ provider | Warden classification and policy; per-provider-per-class consent; TLS |
| B4 Device ↔ cloud | E2E encryption; the sync service is ciphertext-only; TLS |
| B5 User plane ↔ admin plane | Physical separation; no shared credentials, network path, or data view |

---

## 4. Encryption

### 4.1 At rest

| Data | Cipher | Key |
|---|---|---|
| Blobs | AES-256-GCM | Per-object CEK |
| Store objects | AES-256-GCM | Per-object CEK |
| Indexes | AES-256-GCM | Index CEK |
| Event log | AES-256-GCM | Project CEK |
| Ledger | AES-256-GCM + hash chain | Project CEK |
| Settings | AES-256-GCM | Workspace CEK |
| API keys | Platform keystore (OS-native) | OS-managed |

### 4.2 In transit

TLS 1.3 minimum, certificate validation enforced, no downgrade. Certificate
pinning for the cloud plane; not for AI providers (their certificates rotate
under our release cadence, and pinning would break users).

### 4.3 In use

Decrypted only in service tier memory, for the minimum duration. Keys are
zeroed after use where the runtime permits. The index is decrypted in memory
during search, which is the documented trade-off in `43` §9.1.

---

## 5. Key management

### 5.1 Hierarchy

```
User passphrase
      │ Argon2id (memory-hard, tuned to ~1 s on baseline hardware)
      ▼
 Key Encryption Key ──┐
                      │ wraps
                      ▼
                 Master Key  ──── sealed to platform keystore where available
                      │             (Keychain / DPAPI / TPM)
                      │ wraps
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   Workspace CEK  Project CEK   Vault CEK
        │             │             │
        └──────► per-object CEKs ◄──┘
```

### 5.2 Properties

| Property | Statement |
|---|---|
| Derivation | Argon2id with per-user salt; parameters tuned to ~1 s on baseline hardware |
| Platform sealing | Master Key sealed to the OS keystore so the passphrase is not needed every launch |
| Rotation | Passphrase change re-wraps the Master Key; CEKs are untouched (fast) |
| Compromise | Full re-encryption available, with time stated |
| Multi-device | Each device derives independently; keys never transmitted |
| **Operator access** | **None.** No operator-held key can decrypt user content |

### 5.3 API key custody

`REQ-SEC-3`, and a direct correction of the current implementation.

| Rule | Statement |
|---|---|
| Stored in the OS keystore | Keychain, Credential Manager, Secret Service |
| Never in application config files | |
| Never transmitted to the operator | Not for validation, not for proxying, not for support |
| Never logged | Redacted at the logging layer, not by convention |
| Never in crash dumps or diagnostics | Explicitly excluded |
| Never in sync | Keys do not sync; each device is configured separately |
| Displayed masked | Last four characters only, with an explicit reveal |

**The current architecture proxies AI calls through the server, which requires
the server to hold or receive keys** (`src/services/apiVault.ts`,
`resolveApiKey`, `decryptServerKey`). That is retired. Clients call providers
directly.

---

## 6. Recovery

### 6.1 The Recovery Kit

Generated at Vault creation and at sync enablement:

| Component | Purpose |
|---|---|
| Recovery code | High-entropy, human-transcribable, wraps the Master Key independently of the passphrase |
| Optional printed key | For offline storage |
| Instructions | What this is and when it is needed |

### 6.2 What is and is not recoverable

| Lost | Recoverable? |
|---|---|
| Account password | Yes — email reset. Does **not** affect the Vault |
| Vault passphrase, Recovery Kit held | Yes |
| Vault passphrase, no Recovery Kit | **No. By anyone, including us** |
| Device, backup configured | Yes |
| Device, no backup | **No** |

### 6.3 The account/Vault distinction

Users conflate these constantly, and the consequence is data loss. The product
states the distinction at every relevant point:

| Where | Message |
|---|---|
| Password reset screen | "This resets your account password. It does not affect your Knowledge Vault passphrase, which we cannot reset." |
| Vault creation | "This passphrase is separate from your account password." |
| Recovery Kit | "If you forget your passphrase, this code is the only way in. We do not have a copy." |

---

## 7. The Warden

Specified in `41` §5. Its security properties:

| Property | Mechanism |
|---|---|
| Unbypassable | Architectural test: no HTTP client outside `gateway` and `relay-client`; both call the Warden |
| Fail closed | Unclassifiable content is denied |
| Conservative classification | Ambiguity resolves to the higher Egress Class |
| Auditable | Every decision recorded locally |
| Inspectable | The user can preview any payload before it is sent (`REQ-SEC-10`) |
| User-overridable | With explicit, recorded consent — but `restricted` requires an unambiguous per-provider decision |

---

## 8. Capability system

The enforcement mechanism for both agents and plugins.

### 8.1 Model

```
Manifest declares  →  User/system approves  →  service tier issues token
                                                      │
                          every guarded call verifies ─┘
```

| Property | Statement |
|---|---|
| Unforgeable | Issued and verified only by `services/capabilities` |
| Narrow | One capability per grant; no wildcards |
| Revocable | Immediately, at runtime |
| Non-transferable | An agent cannot pass its token to a plugin |
| Non-escalating | No capability grants the ability to obtain another |
| Enforced at the call boundary | Not by convention |

### 8.2 Sensitive capabilities

| Capability | Additional control |
|---|---|
| `read:vault` | Explicit user grant per plugin; four agents only |
| `net:outbound` | Still Warden-gated; grants the ability to request, not to send |
| `write:draft` | **Never granted to any agent or plugin** (`42` §4.2) |
| `read:ledger` | Read-only; the Ledger is append-only by construction |
| `write:artifact` | Sandboxed to the project's output directory |

---

## 9. Plugin sandboxing

Detail in `47`. Security summary:

| Control | Mechanism |
|---|---|
| Execution | WASM; no direct syscalls |
| Filesystem | None; all I/O through the capability-gated host API |
| Network | None unless `net:outbound`, then Warden-gated |
| Memory | Bounded; enforced by the runtime |
| CPU | Time-sliced; runaway plugins terminated |
| Crash | Contained; core unaffected |
| Distribution | Signed; signature verified before load |
| Review | Required for registry distribution |

---

## 10. Authentication

### 10.1 Local

The Desk requires no account (`25` §1.2). Where a Vault passphrase is set,
it is required at launch unless the Master Key is sealed to the platform keystore
and the OS session is authenticated.

### 10.2 Cloud

| Control | Specification |
|---|---|
| Password | Minimum 12 characters; breach-checked via k-anonymity (the password never leaves the device) |
| Hashing | Argon2id server-side |
| MFA | TOTP minimum; WebAuthn/passkeys preferred; recovery codes issued (`REQ-SEC-8`) |
| Sessions | Short-lived access tokens, rotating refresh tokens |
| Device binding | Refresh tokens bound to a device key |
| Revocation | Per session and per device, immediate |
| Rate limiting | Progressive backoff, not lockout — lockout is a DoS against the user |
| Enumeration | Identical responses for existing and non-existing accounts |

### 10.3 Institutional

SAML and OIDC SSO for institutional tiers, with SCIM provisioning. Institutional
policy may require MFA (`OQ-09`).

---

## 11. Audit

### 11.1 Local audit log

`REQ-SEC-5`. User-viewable, user-exportable, never auto-transmitted.

Records: authentication events, key operations (not key material), egress
decisions, capability grants and denials, plugin load and permission changes,
data export and deletion, sync events, settings changes, security-relevant
failures.

### 11.2 Cloud audit

Account events, session lifecycle, subscription changes, admin actions against
the account. Retained 12 months. **Never content.**

### 11.3 Admin audit

Every operator action affecting users is logged with actor, action, target, and
justification (`REQ-ADM-6`). Immutable, retained 24 months, and reviewable by
someone other than the actor.

---

## 12. Secure deletion

`REQ-SEC-6`, mechanics in `45` §9.

**Key destruction is the primary mechanism.** On media where secure erasure is
not achievable (SSDs with wear levelling, copy-on-write filesystems), destroying
the object's CEK renders residual ciphertext unrecoverable. This is more reliable
than overwriting, and it is what makes deletion meaningful.

---

## 13. Supply chain

| Control | Practice |
|---|---|
| Dependencies | Locked; audited; automated vulnerability alerts |
| Builds | Reproducible where achievable; built in CI, not on developer machines |
| Signing | All releases signed; macOS notarised |
| Updates | Signature verified before application; rollback available |
| Registry content | Model registry, venue profiles, and agent configs are signed; clients verify |
| Plugins | Signed; verified before load |
| SBOM | Published per release |

Registry signing matters more than it first appears: agent configuration is
delivered from the cloud and changes agent behaviour (`42` §9). An unsigned
registry would let a compromised CDN change what agents do on every user's
machine.

---

## 14. Privacy controls

| Control | User can |
|---|---|
| Egress policy | Set per provider per Egress Class |
| Egress preview | See any payload before it is sent |
| Egress audit | Review every outbound call |
| Restricted marking | Mark a project, section, or source as never-cloud |
| Telemetry | Opt out entirely |
| Feedback | Opt in per submission, reviewing the payload first |
| Sync scope | Choose per workspace and per project |
| Data export | Everything, any time, every tier |
| Deletion | Anything, with an impact preview |

---

## 15. Incident response

Written for a team of two to four (`REQ-ADM-7`).

| Stage | Action |
|---|---|
| Detect | Automated alerts on auth anomalies, error spikes, integrity failures |
| Assess | Severity, scope, whether user content could be affected (usually not, by construction) |
| Contain | Revoke sessions, disable features via flags, roll back agent versions |
| Notify | Affected users within 72 hours; a public post-mortem for anything material |
| Remediate | Fix, verify, document |
| Review | Blameless; update this document |

### 15.1 The scenario that shapes the architecture

**"The sync service is breached."** An attacker obtains every sync envelope.

They get ciphertext and opaque object IDs. No titles, no content, no project
names. The impact is a traffic-analysis disclosure — that a user has *N* objects
and syncs at certain times — and nothing more.

This is a serious incident that is not a confidentiality catastrophe, and that
distinction is the entire return on the E2E encryption design.

---

## 16. Compliance

| Regime | Position |
|---|---|
| GDPR | Minimal processing; user content is not held; data subject rights are trivially satisfiable because we hold almost nothing |
| FERPA | No student records held |
| Research ethics / IRB | Local-first is compatible with data-handling requirements that forbid cloud transmission — a genuine differentiator for clinical and human-subjects research |
| Accessibility | WCAG 2.2 AA (`21` §6) |
| Export controls | Local models are user-obtained; we distribute none |

---

## 17. Security testing

Per `52` §6:

| Kind | Cadence |
|---|---|
| Dependency scanning | Every build |
| SAST | Every PR |
| Secret scanning | Every commit |
| Capability enforcement tests | Every build |
| Egress-path architectural tests | Every build |
| Crypto correctness tests | Every build |
| Plugin sandbox escape tests | Every release |
| Penetration test | Annually and before major releases |
| Two-plane isolation verification | Every release |

The architectural tests — asserting no HTTP client exists outside the sanctioned
modules, and no admin-plane import reaches user-plane code — are cheap and
prevent the two failures that would quietly invalidate the whole model.

---

## 18. Current state

| Current | Target |
|---|---|
| Server holds and decrypts user API keys | Keys in the OS keystore; never transmitted |
| Server-side user data | Local, encrypted, operator-inaccessible |
| No E2E encryption | E2E for all synced content |
| No capability system | service tier-enforced capability tokens |
| No plugin sandbox | WASM sandbox |
| No egress control | The Warden |
| Supabase RLS in place | **Carries forward** — correct approach for the cloud plane |
| `helmet` and rate limiting in place | Carries forward for the cloud plane |
| MFA absent | TOTP minimum, WebAuthn preferred |
| No audit log | Local and cloud audit logs |
| No secure deletion | Key destruction plus derivative removal |

The existing `ENCRYPTION_KEY` server-side key-decryption path
(`resolveApiKey` / `decryptServerKey`) is the single clearest violation of the
target posture and is retired in Phase 1 (`51`).
