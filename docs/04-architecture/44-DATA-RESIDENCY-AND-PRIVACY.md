# Data Residency & Privacy Architecture

> **Doc ID:** 44 · **Status:** Design · **Revision:** 2
> **Replaces:** 44-DATA-RESIDENCY-AND-PRIVACY.md

Revision 1 kept user content on the user's device. A web application cannot. This
document states plainly what changed, what we do about it, and what we tell
users — because the honest version of this is a feature and the evasive version
is a liability.

---

## 1. What changed, stated directly

| | Revision 1 (desktop) | Revision 2 (web) |
|---|---|---|
| Document storage | User's device | Our servers, encrypted at rest |
| Processing | User's device | Our servers |
| Encryption keys | Held by the user | Held by us, in a managed KMS |
| Can the operator technically read content? | **No** | **Yes, with deliberate effort and audit trail** |
| Offline | Full authoring | Cached reading and buffered editing |
| Local AI models | First-class | Not possible in a browser |

**We do not pretend otherwise.** A web product claiming zero-knowledge
architecture while running server-side inference on user documents is lying, and
users who understand the technology will notice.

---

## 2. What we promise instead

Weaker than revision 1's guarantee, and still stronger than the category norm.

| Promise | Mechanism |
|---|---|
| Encrypted at rest and in transit | AES-256-GCM per-project CEK; TLS 1.3 |
| Never trained on | Contractual and technical; no pipeline exists (`41` §11) |
| Never read by staff without cause | Access requires break-glass with justification, alerting, and an immutable audit entry (§4) |
| Never sold or shared | No data brokerage, no advertising, no third-party analytics on content |
| Minimum provider exposure | The Warden sends the least that will do the job (§5) |
| User-controlled provider policy | Per provider, per content class |
| Real deletion | Content, derivatives, embeddings, caches, and backups within a stated window (§7) |
| Full export, any time, any tier | `P9` |
| Short retention | Defaults in §6 |

---

## 3. Data classes and handling

| Class | Examples | At rest | To providers |
|---|---|---|---|
| `account` | Email, password hash, MFA | Encrypted | Never |
| `credentials` | User API keys | KMS-encrypted, write-only from the client | Only to the provider they belong to |
| `user_content` | Drafts, uploads, notes, Vault | Encrypted, per-project CEK | Only per user policy, minimised |
| `derived` | Embeddings, indexes, summaries | Encrypted | Only per policy |
| `bibliographic` | Citation metadata | Encrypted | Yes — required for verification |
| `operational` | Logs, metrics, job records | Content-free by construction | Never |

### 3.1 API key handling

| Rule | Statement |
|---|---|
| Encrypted with a KMS-held key, never a hardcoded secret | |
| Write-only from the client — once submitted, never returned, displayed masked | |
| Never logged, never in error messages, never in diagnostics | |
| Decrypted only in memory, for the duration of the call | |
| Deletable, immediately and completely | |

The current repository's `ENCRYPTION_KEY`-based server-side decryption is
replaced by managed KMS. `46` §5 specifies it.

---

## 4. Staff access

The honest part. Because we hold the keys, staff access is technically possible;
the controls make it rare, deliberate, and visible.

| Control | Statement |
|---|---|
| No routine access | No dashboard, tool, or admin screen displays user content (`49` §3) |
| Break-glass only | Access requires an explicit request with a stated reason |
| Two-person | A second person approves |
| Time-boxed | Access expires automatically |
| Audited immutably | Actor, reason, scope, duration — retained 24 months |
| **User notified** | The affected user is told their content was accessed, and why, within 72 hours |
| Never for product improvement | Only for a specific support request the user raised, or a legal obligation |

The user notification is the control that makes the rest real. An access regime
nobody is told about is an access regime that expands quietly.

---

## 5. Provider egress

The Warden (`41` §5) is where users have genuine, granular control.

### 5.1 Minimisation

For any model call the Warden sends the least that will do the job:

| Task | Sent | Not sent |
|---|---|---|
| Refinement | The selected passage, register constraints, voice statistics | The rest of the document |
| Verification | The claim and candidate evidence spans | The full sources |
| Rule extraction | The requirement document (usually public) | Any user content |
| Discovery | Generated query terms | The draft |
| Chat | The question and the retrieved context | The whole project |

### 5.2 User control

| Control | Behaviour |
|---|---|
| Provider choice | Which providers may be used, per task class |
| Class policy | `user_content` to cloud providers: allow, ask, or deny |
| Restricted marking | Mark a project or section as never leaving for model processing |
| Bring-your-own-key | Content goes to *their* provider account under *their* terms |
| Egress preview | See the exact payload before it is sent |
| Egress log | Every outbound call, reviewable |

### 5.3 The restricted path

A user with embargoed data or ethics-approved participant material can mark a
project `restricted`. Model-backed features are then disabled for it, and the
deterministic ones — compliance, citation formatting, structure checks, Studio
levels 1–2, export — continue to work.

**This is the honest answer for the most sensitive work:** a meaningful subset of
the product with no third-party exposure, rather than a promise we cannot keep.

---

## 6. Retention

| Data | Default retention |
|---|---|
| Active project content | Until the user deletes it |
| Deleted content | 30-day soft delete, then hard deletion |
| Snapshots | Per policy: gate snapshots permanent, hourly 7 days, daily 90 days |
| Model request payloads | **Not retained.** Only metadata: model, tokens, cost, duration |
| Egress log | 12 months |
| Operational logs | 30 days |
| Audit log | 24 months |
| Aggregate analytics | Indefinite, content-free |
| Account after closure | 30 days, then purged |

---

## 7. Deletion

| Deleted | Also removed |
|---|---|
| A source | File, parsed content, embeddings, index entries, evidence spans; dependent claims surfaced first |
| A project | Content, snapshots, embeddings, index, exports, history |
| A Vault document | File, parsed content, annotations, embeddings, index |
| An account | Everything, including backups, within 35 days |

Deletion is confirmed with a report of what was removed. Backup propagation
completes within the stated window, and the window is stated rather than
implied.

---

## 8. Offline

Bounded, and described accurately.

| Capability | Offline |
|---|---|
| Edit an open document | Yes — IndexedDB buffer |
| Read cached sections and sources | Yes |
| Outline navigation | Yes |
| Comments | Yes, queued |
| Citation insertion from cached corpus | Yes |
| Compliance, Studio, agents, discovery, export | No |

The user sees a persistent offline indicator, a list of queued changes, and
reasons on unavailable features. On reconnect the queue flushes and conflicts
surface for resolution.

---

## 9. Compliance posture

| Regime | Position |
|---|---|
| GDPR | Data controller. Lawful basis: contract. DSAR, portability, erasure, and rectification supported. DPA available |
| Data residency | EU and UK regions at launch; US and others as demand requires |
| FERPA | No student records held beyond what the user creates |
| Research ethics / IRB | The `restricted` path (§5.3) is the answer for participant data. Documented for ethics submissions |
| Sub-processors | Published list, with notice before changes |

### 9.1 Research ethics

Researchers with ethics-approved participant data are often forbidden from
sending it to third-party services. §5.3 gives them a real answer, and we
document exactly which features operate without egress so they can put it in an
ethics application.

---

## 10. What we tell users, and when

| Moment | Message |
|---|---|
| Sign-up | One-screen plain-language summary: where content lives, who can see it, what leaves for AI processing |
| First provider configuration | What leaves the device and to whom, per the chosen policy |
| First upload | Encryption at rest; retention |
| Marking restricted | Which features stop working, precisely |
| Any staff access | Notification within 72 hours (§4) |
| Deletion | What was removed and when backups purge |

### 10.1 The sign-up summary

> **Where your work lives**
>
> Your documents are stored on our servers, encrypted. We need them there to
> check your formatting, search your sources, and help with your writing.
>
> We don't train on your work. We don't sell it. Our staff can't browse it —
> access needs a specific reason, two-person approval, and you get told it
> happened.
>
> When you use AI features, the relevant part of your text goes to the AI
> provider you chose. You can see exactly what before it's sent, and you can turn
> that off for sensitive work.
>
> `[How this works in detail]` `[Continue]`

---

## 11. Trade-off, recorded

Revision 1's local-first architecture gave a stronger privacy guarantee. It also
required a desktop application, a local kernel, device-side indexing, encrypted
sync, and roughly a year before anyone could use the product.

Revision 2 trades that guarantee for reach, installability, one codebase, and a
first release in months (`01` §8.1). The trade is defensible, and it is only
defensible if we are straightforward about it — which is what this document is
for.

`55` §5 records the conditions under which a local processing option would come
back.
