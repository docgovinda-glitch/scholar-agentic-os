# Data Residency & Privacy Architecture

> **Doc ID:** 44 · **Status:** Design · **Revision:** 2 (Web & Local-First)
> **Replaces:** 44-DATA-RESIDENCY-AND-PRIVACY.md

Scholar OS is designed to be **web-first and local-first**, strictly minimizing the data and secrets that ever leave the user's device. This document defines what data lives where, how keys are held, and how privacy boundaries are enforced.

---

## 1. Data & Execution Boundaries

| Category | Client-Side (User's Device) | Server-Side (Platform Cloud) |
|---|---|---|
| **Working Project State** | Working draft, research answers, UI state (IndexedDB / localStorage) | Authorized project record & sync envelope |
| **User BYOK API Keys** | Sealed in client Web Crypto vault (`window.crypto.subtle`); **never sent to server** | Zero user keys stored or accessible |
| **Platform AI Credentials** | Never accessible by client | Stored under server AES-256-GCM envelope encryption (`MASTER_KEY`) |
| **Local AI Inference** | Loopback to `localhost` (Ollama, LM Studio); **zero network egress** | Not involved in local AI operations |
| **Client-Side AI Inference** | Direct client-to-provider egress for BYOK models | Not involved in non-premium BYOK calls |
| **Identity & Access** | Session token in browser | Authentication state, user profile, entitlement status |

---

## 2. Privacy Guarantees

| Guarantee | Mechanism |
|---|---|
| **Zero User Keys on Server** | User BYOK keys are encrypted in browser Web Crypto storage and never leave the device (`46` §5.3) |
| **Local AI Zero-Egress** | Local models run on `localhost`; prompts and completions never touch the internet or Scholar servers |
| **Minimum Server Knowledge** | The server does not store or process private research prompts, intermediate AI results, or working state unless a cloud service is explicitly invoked |
| **Never Trained On** | Technical and contractual; user text is never used to train models (`41` §11) |
| **User-Controlled Egress** | Client routing decides which provider handles each task; failover is never silent |
| **Encrypted at Rest & Transit** | AES-256-GCM envelope encryption, TLS 1.3 |
| **Real Deletion** | Local storage clearance and server record deletion upon request |

---

## 3. Data Classes and Handling

| Class | Examples | Where Stored | Egress to Model Providers |
|---|---|---|---|
| `account` | Email, password hash, status | Server (Supabase Auth / Postgres) | Never |
| `user_byok_keys` | User Gemini, Cerebras, Groq keys | Client Web Crypto Vault only | Only sent directly from client to the user's chosen provider |
| `platform_keys` | Platform OpenRouter, Gemini keys | Server Envelope Vault only | Only sent from server for authorized platform requests |
| `user_content` | Drafts, notes, research answers | Client-first (IndexedDB), synced to project record | Only per user-initiated AI actions |
| `vault_items` | Private Knowledge Vault notes, extracts, citations | **Client IndexedDB only** (AES-GCM-256 encrypted); server stores only existence signal (`label`, `created_at`) | Only via Client AI Resource Pool per explicit user action; **never server-processed** |
| `vault_secrets` | Vault passphrase, recovery code | **Client RAM / device localStorage only**; never sent to server in any form | Never |
| `operational` | Logs, metrics, billing status | Server | Content-free by construction |

### 3.1 API Key Custody Rules

| Rule | Statement |
|---|---|
| **User BYOK Keys are Client-Held** | Stored strictly in browser Web Crypto storage (`window.crypto.subtle` AES-GCM / PBKDF2). Never transmitted to the operator, never in server logs. |
| **Platform Keys are Server-Sealed** | Envelope-encrypted via AES-256-GCM using server-held `MASTER_KEY`. |
| **Zero Mixed Custody** | The server never accepts, proxies, or stores user BYOK credentials. |
| **Masked Previews Only** | UI exposes only the last four characters with explicit reveal controls. |

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
> Your Knowledge Vault stays on your device, encrypted with your passphrase.
> We cannot read it. We do not have a copy of your passphrase.
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
