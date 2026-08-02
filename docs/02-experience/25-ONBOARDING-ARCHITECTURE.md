# Onboarding Architecture

> **Doc ID:** 25 · **Status:** Design · **Depends on:** `10`, `12`, `21`

The nine-stage path from stranger to first project, with the AI Setup Wizard and
the Workshop specified in full.

---

## 1. The flow

```
  Account Creation
        ↓
  Email Verification
        ↓
       Login  ←──────────── Password Reset (conditional)
        ↓
  AI Setup Wizard                    ← the privacy decision happens here
        ↓
  Knowledge Vault Setup  (optional, skippable)
        ↓
  Workshop / Guided Tutorial
        ↓
  Workspace Creation
        ↓
  Start Project
```

### 1.1 Design constraints

| Constraint | Consequence |
|---|---|
| Under 12 minutes for a defaults-accepting user (`REQ-ONB-11`) | Every stage has a fast path |
| Resumable across sessions and devices (`REQ-ONB-10`) | State persists server-side (account) and locally (config) |
| Local-only use requires no account | Stages 1–3 are skippable entirely for offline users |
| Every stage after login is skippable | Skips are recorded, re-offered contextually, never nagged |
| Teaches without patronising | Progressive disclosure (`21` §4) |

### 1.2 The local-only path

A user who downloads the Workbench and wants nothing to do with our servers:

```
  Launch → AI Setup Wizard (local models) → Vault (optional)
         → Workshop → Workspace → Project
```

No account, no email, no network. This path must be **visible on first launch**,
not hidden — it is the strongest possible demonstration of `P3` and `P4`. The
first screen offers "Sign in or create an account" and "Use without an account"
as peers, with a one-line explanation of what an account adds (sync, the Console,
managed model credits).

---

## 2. Stage 1 — Account creation

| Field | Rules |
|---|---|
| Email | Validated format; used for verification and recovery |
| Password | Minimum 12 characters; strength meter; checked against known-breached lists locally via k-anonymity |
| Name | Optional; used only for document metadata defaults |
| Role | Optional: undergraduate / master's / doctoral / postdoc / faculty / other. Tunes guidance density and catalog ordering |
| Institution | Optional; enables institution profile lookup |

**Rules**

- No email marketing checkbox pre-ticked. Ever.
- Terms and privacy policy linked, not modal-blocking, with a plain-language
  summary alongside the legal text.
- Third-party sign-in (Google, ORCID, institutional SSO) MAY be offered. ORCID is
  the interesting one for researchers and is prioritised over social logins.
- Account creation does not create a Workspace. That is stage 8, deliberately.

---

## 3. Stage 2 — Email verification

- Verification link plus a 6-digit code (the code matters for users checking mail
  on a different device).
- Link valid 24 hours; resend rate-limited.
- Verification is required before cloud features (sync, Console, credits) and
  **not** required for local Workbench use (`REQ-ONB-2`).
- Unverified users may proceed through the rest of onboarding; a persistent,
  non-modal banner offers resend.

---

## 4. Stage 3 — Login

Standard, with:

- Remember-device with an explicit trust decision, not a silent checkbox.
- MFA prompt if enabled (`REQ-SEC-8`).
- Failed-attempt rate limiting with progressive backoff, not lockout — lockout is
  a denial-of-service vector against the user.
- Active session list available from Account (`23` §5.9).

### 4.1 Password reset (conditional)

Triggered from login, not a linear stage. Email link → new password → all other
sessions invalidated with a notification listing what was signed out.

**The important detail:** if the user has an encrypted Vault, the reset screen
states plainly that the account password is **not** the Vault passphrase, and
that resetting one does not affect the other. Conflating them is a support
disaster and a data-loss risk (`46` §6.3).

---

## 5. Stage 4 — AI Setup Wizard

The highest-leverage screen in the product. This is where the user's privacy
posture and cost exposure are set, and where most users form their model of what
the product is.

### 5.1 Flow

```
Step 1  Hardware detection        what your machine can do
Step 2  Provider landscape        the honest comparison
Step 3  Provider configuration    per provider the user chooses
Step 4  Task bindings             which model does what
Step 5  Privacy summary           what this means, in plain language
```

### 5.2 Step 1 — Hardware detection

Detects RAM, CPU cores, GPU and VRAM, disk space, and existing Ollama or LM
Studio installations. Presents a plain-language verdict:

> **Your machine: 16 GB RAM, 8 cores, no dedicated GPU**
>
> You can run small and medium local models comfortably (up to about 8B
> parameters). Larger models will work but slowly — roughly 3–5 words per second.
>
> Local models are free, private, and work offline. Cloud models are faster and
> more capable, but your text leaves your device.

**Rules**

- Detection failure falls back to conservative recommendations and says detection
  failed (`12` F-ONB-1).
- No model is recommended that the device cannot run (`REQ-ONB-5`).
- Models above the device's capability are shown as unavailable with the specific
  reason, not hidden — the user should understand the landscape.

### 5.3 Step 2 — The provider landscape

Providers listed with local first (`P3`). Each expands to the nine-field
information card (`12` §2.1).

| Provider | Kind | Positioning line |
|---|---|---|
| **Ollama** | Local | Free, private, offline. The default recommendation |
| **LM Studio** | Local | Free, private, offline, with a GUI for model management |
| **llama.cpp / GGUF** | Local | Direct model execution for advanced users |
| **OpenAI** | Cloud | Strong general capability; broad model range |
| **Anthropic (Claude)** | Cloud | Strong long-context reasoning and careful instruction-following |
| **Google (Gemini)** | Cloud | Very large context; competitive pricing |
| **OpenRouter** | Aggregator | One key, many models; useful for comparison |
| **DeepSeek** | Cloud | Strong reasoning at low cost |
| **Qwen** | Cloud + local | Strong multilingual; available locally |
| **Mistral** | Cloud + local | Efficient open-weight models, EU-hosted option |
| **Azure OpenAI** | Cloud | For users with institutional Azure access |
| **Custom endpoint** | Any | OpenAI-compatible endpoint for institutional gateways |

### 5.4 The information card, worked example

Every provider supplies all nine fields (`REQ-ONB-3`). What "honest" looks like:

> ### Ollama — runs on your computer
>
> **Purpose.** Runs open-weight models locally. Nothing leaves your device.
>
> **Strengths.** Completely private — suitable for unpublished work and sensitive
> data. Free after download. Works offline. No usage limits.
>
> **Weaknesses.** Slower than cloud models. Smaller models are noticeably weaker at
> long-form reasoning and following complex instructions. Uses significant RAM
> while running. First response after startup takes ~30 seconds.
>
> **Pricing.** Free. Costs you electricity and disk space (3–40 GB per model).
>
> **Privacy.** Nothing is transmitted. No account, no logging, no retention, no
> training on your data. This is the most private option available.
>
> **Recommended for.** Sensitive documents, offline work, summarising, drafting
> when you will review carefully, and anything you would not paste into a website.
>
> **Setup.** Install Ollama from ollama.com, then we will detect it. Or use the
> button below and we will guide you.
>
> **Recommended models for your machine (16 GB, no GPU):**
> | Model | Size | Good for | Speed |
> |---|---|---|---|
> | llama3.1:8b | 4.7 GB | General drafting, summarising | ~8 words/sec |
> | qwen2.5:7b | 4.4 GB | Multilingual work | ~9 words/sec |
> | mistral:7b | 4.1 GB | Fast general use | ~10 words/sec |

And for a cloud provider, the privacy field must be equally direct:

> **Privacy.** Your text is sent to [provider]'s servers in [jurisdiction]. Their
> current policy is [retention policy] and [training policy]. We link to their
> policy — it can change, and we cannot guarantee it. For unpublished research or
> data under ethics approval, consider a local model instead.

**Rule:** where a provider's training or retention policy is unclear, the card
says "unclear" and links to the source. It never says "your data is safe" on a
provider's behalf.

### 5.5 Step 3 — Configuration

**Cloud providers:** key entry → format validation → live validation with a
minimal-cost call → specific error on failure (`REQ-ONB-4`). Keys are written to
the platform keystore immediately and never held in application memory beyond the
call (`46` §5).

**Local providers:** detect installation → offer to install if absent → list
runnable models → download with progress → verify with a test generation.

### 5.6 Step 4 — Task bindings

The user assigns models to task classes. Presets first, manual configuration
available.

| Preset | Binding |
|---|---|
| **Maximum privacy** | Everything local. No cloud egress at all |
| **Balanced** *(default)* | Local for drafting and refinement; cloud for verification, discovery, and rule extraction |
| **Maximum capability** | Cloud for everything; local as failover |
| **Custom** | Per-task selection |

Task classes: drafting · refinement · verification · summarisation · discovery ·
rule extraction · embedding · chat.

**Why "Balanced" is the default and not "Maximum privacy":** verification and
rule extraction genuinely benefit from stronger models, and both operate on
*bibliographic* and *derived* content rather than the user's manuscript. The
default is explained in exactly those terms, and the privacy summary (step 5)
shows precisely what it implies.

### 5.7 Step 5 — Privacy summary

Plain-language statement of what the configuration means:

> **With these settings:**
>
> ✓ Your drafts and documents stay on your computer — drafting and refinement use
>   the local model.
> ⤴ Search queries and source titles go to OpenAI when verifying claims and
>   reading journal guidelines.
> ✗ Your manuscript text is never sent to a cloud provider.
>
> You can change this any time in Settings → Privacy, and you can see exactly
> what would be sent before it is sent.
>
> `[Looks right]`  `[Adjust]`

This screen is the product's honesty made concrete. It is generated from the
actual Warden policy the configuration produces, not from static copy — if the
two ever diverge, the summary is wrong and that is a P0 defect.

---

## 6. Stage 5 — Knowledge Vault setup (optional)

### 6.1 The offer

Three peer options (`12` F-ONB-2), presented without a default:

| Option | Leads to |
|---|---|
| Create a Vault | Location → passphrase → Recovery Kit → optional first import |
| Import an existing library | Zotero, Mendeley, EndNote XML, BibTeX, or a folder |
| Not now | Proceeds; re-offered contextually later |

### 6.2 The explanation

Concrete, using the examples from `REQ-VLT-2`:

> **A Knowledge Vault is your long-term library.**
>
> Lecture notes. Books. Papers you have read. Your previous essays and theses.
> PDFs, handwritten notes you photograph, interview transcripts, datasets, lab
> notebooks.
>
> Over time it becomes the foundation your work is built on — when you write
> something new, Scholar OS can draw on everything you have already read, and you
> can search four years of reading in one place.
>
> It stays on your computer, encrypted. It is entirely optional, and everything
> works without it.

### 6.3 Encryption and the Recovery Kit

If the user creates a Vault, encryption is on. The Recovery Kit step is not
skippable, and the wording is deliberately unsoftened:

> **Save your recovery code**
>
> `SCHL-4K9M-2XQP-7WNZ-HB3R`
>
> If you forget your passphrase, this code is the only way to open your Vault
> again. We do not have a copy. We cannot reset it. If you lose both, the Vault
> cannot be recovered by anyone, including us.
>
> `[Copy]`  `[Download]`  `[Print]`
>
> ☐ I have saved this somewhere safe
>
> `[Continue]` *(disabled until checked)*

---

## 7. Stage 6 — The Workshop

Seven interactive modules (`12` F-ONB-3). Total under 10 minutes.

| # | Module | The interaction | What it teaches |
|---|---|---|---|
| 1 | Responsible AI use | Sort four scenarios into "fine" and "not fine", with feedback on each | Where the line is, concretely |
| 2 | Academic integrity | Read a sample authorship report; identify which section is a risk | What the Ledger is for, from the user's side |
| 3 | Privacy and local processing | Open a Warden egress preview and see the exact payload | That the privacy claim is inspectable |
| 4 | **Citation verification** | Given a plausible-looking fabricated citation, try to verify it — and fail | Why approval gates exist. The single highest-value 90 seconds in the product |
| 5 | Workflow overview | Step a completed sample project through all eight gates | The shape of the work ahead |
| 6 | The editor | Accept one AI suggestion and watch the Ledger entry appear | That provenance is automatic, not a chore |
| 7 | Best practice | Assemble a personal checklist, saved to the workspace | Ownership of their own standards |

### 7.1 Rules

- Module 4 is shown even to users who skip the Workshop. It is offered once, as a
  single screen, before first project creation. Skipping *that* is permitted.
- Tone is instructive, never accusatory (`UX8`). The framing throughout is "here
  is how this works and how to protect yourself", not "here is what you must not
  do".
- Re-runnable from Help with a fresh sample project.
- Completion recorded; skipped modules re-offered contextually at most once.

### 7.2 Module 4 in detail

Because it matters most:

> **Can you trust this citation?**
>
> Zhang, W., & Petrova, I. (2019). Longitudinal effects of microplastic exposure
> on freshwater invertebrate populations. *Journal of Aquatic Toxicology*,
> 47(3), 211–229. https://doi.org/10.1016/j.jaqtox.2019.03.014
>
> It looks right. The journal exists. The authors are plausible. The DOI has the
> correct shape.
>
> `[Check it]`
>
> *(on click)*
>
> **The DOI does not resolve. The article does not exist.**
>
> This citation was generated by a language model. Everything about it is
> plausible and none of it is real. Models do this routinely, and the results are
> convincing enough that people submit them.
>
> This is why Scholar OS will not let you cite a source you have not approved.
> Every source goes through a queue where we check the identifier, the publisher,
> and the retraction status — and you decide.
>
> It is not bureaucracy. It is the thing that stops this from happening to you.

---

## 8. Stage 7 — Workspace creation

| Field | Rules |
|---|---|
| Name | Required. Suggested from role ("Doctorate", "Coursework") |
| Location | Where project data lives. Defaults to the OS documents directory. Warned if removable or network-mounted |
| Vault binding | Link the Vault from stage 5, or none |
| Defaults | Citation style, language variant, institution — pre-filled from account, editable |

Users may create more workspaces later. Most users have exactly one, and the
screen does not imply they should have more.

### 8.1 The backup conversation

Workspace creation is where the local-first bargain is stated, because it is the
moment the user chooses where their work will live (`REQ-LOC-5`, `REQ-LOC-7`):

> **Your work lives here: `~/Documents/Scholar OS/Doctorate`**
>
> Everything stays on this computer. That is what keeps it private — but it also
> means it is yours to look after.
>
> **If this computer is lost, stolen, or fails, we cannot recover your work.** We
> do not have a copy. That is not a policy we could change; it is what
> "we cannot read your documents" actually means.
>
> Set up a backup now — it takes about a minute.
>
> `[Set up backup]`  `[I'll use my own backup]`  `[Later]`

Choosing "Later" is permitted and recorded. The prompt returns at the first gate
transition, and then at defined milestones (`44` §7).

---

## 9. Stage 8 — First project

The user lands in project creation (`12` F-PRJ-1) with the output-type question.
Onboarding ends here; the product begins.

For a first project, guidance density is maximal and panels are introduced
contextually as they become relevant (`22` §11).

---

## 10. State, resumption, and skips

### 10.1 Onboarding state

```yaml
account:      { created, verified, mfa_enrolled }
ai_setup:     { completed, providers[], bindings, preset, privacy_ack }
vault:        { status: created | imported | skipped, skipped_at }
workshop:     { modules_completed[], skipped_at, citation_module_seen }
workspace:    { created, backup: configured | declined | deferred }
first_project:{ started, output_type }
```

Stored locally (Workbench config) and, for account-scoped fields, server-side so
a second device resumes correctly (`REQ-ONB-10`).

### 10.2 Re-offering skipped stages

| Skipped | Re-offered when | Frequency cap |
|---|---|---|
| Vault | User uploads a 5th source, or starts a 2nd project | Once per 30 days |
| Workshop modules | Contextually, at the moment the concept first matters | Once per module |
| Backup | At gate transitions, and at 10k words | Escalating: notice → notice → modal at `G4` |
| MFA | After 7 days of active use | Once per 90 days |
| Verification | Persistent non-modal banner | Continuous, non-modal |

**Backup is the only escalating prompt.** It escalates because it is the only
skipped stage whose consequence is unrecoverable, and because the data on
`RISK-04` says users reliably underestimate it.

---

## 11. Failure handling

| Failure | Response |
|---|---|
| Email never arrives | Resend; alternate address; check-spam guidance; support path that does not require email |
| All key validations fail | Offer local-only; explain that the product is fully usable that way |
| No local runtime and no keys | Permit completion; product works read-only for AI features; explain clearly |
| Hardware detection fails | Conservative defaults; state that detection failed |
| Vault creation fails (space, permissions) | Specific reason; retry; skip remains available |
| Onboarding abandoned mid-way | State preserved; resume from the same point; no restart |
| User closes during Vault ingestion | Ingestion resumes in the background on next launch |

---

## 12. Measurement

| Metric | Target | What a miss means |
|---|---|---|
| Completion rate | ≥ 70% | Investigate the stage with the largest drop |
| Median duration | ≤ 12 min | A stage is too heavy |
| AI Wizard completion | ≥ 85% | The provider landscape is overwhelming |
| Local provider configured | ≥ 40% | Local-first framing is not landing |
| Vault created | ≥ 30% at onboarding | The explanation is not concrete enough |
| Workshop completion | ≥ 60% | Too long, or perceived as filler |
| Citation module seen | ≥ 95% | The unskippable path is broken |
| Backup configured | ≥ 50% at workspace creation | The bargain is not being communicated |
| Time to first project | ≤ 15 min | Cumulative friction |

Per-stage drop-off is instrumented as aggregate counts only — no content, no
per-user paths (`REQ-ADM-8`).
