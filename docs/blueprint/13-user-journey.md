# 13 — First-Time User Journey and Workspace

Covers revision requirements #2 (onboarding) and #3 (output-first workspace).
Output type definitions are in [14](./14-output-catalog.md).

---

## 1. The mandated sequence

```
Registration / Login
        ↓
Password Reset ......... (when needed)
        ↓
AI Setup Wizard
        ↓
Knowledge Vault Setup .. (optional, skippable)
        ↓
Workshop / Workspace
```

`[OBSERVED]` The components exist today — `UserProfileGate.tsx`,
`AISetupWizard.tsx`, `KnowledgeVaultWizard.tsx`, all lazy-loaded by
`OnboardingWizard.tsx`. What changes is ordering, the optionality of the vault,
and what the workspace opens onto.

`[RECOMMENDATION]` One principle governs the whole sequence: **the user must be
able to reach useful work without completing anything they do not yet
understand.** Every step after login is skippable or has a sensible default.

---

## 2. Registration and login

`[OBSERVED]` Supabase-backed, with approval and password-reset flows already
implemented as Edge Functions.

`[RECOMMENDATION]` Two changes:

- **Collect degree level and discipline at signup.** Two fields. They drive
  output-type defaults, word-count guidance, and citation-style suggestions
  throughout. `[INFERRED]` Without them every downstream default is a guess,
  and the audience now spans undergraduate to PhD
  ([C-01](./11-requirements-conflicts.md#c-01--audience-narrow-segment-vs-all-degree-levels)).
- **State the storage model at signup, not later.** Work is stored on this
  device by default; the user is responsible for backups. `[INFERRED]` R-12
  (data loss from cleared browser storage) is catastrophic and currently
  undisclosed. Disclosure at signup costs one sentence; discovery after loss
  costs the user their work.

### Password reset

`[OBSERVED]` Implemented (`request-password-reset`, `approve-password-reset`).

`[RECOMMENDATION]` Must carry an explicit warning: **resetting the account
password does not recover the local encryption passphrase.** `[OBSERVED]`
`apiVault.ts` supports passphrase unlock; if that passphrase is lost, stored
provider keys are unrecoverable by design. A user who assumes password reset
restores everything will be wrong in a way that looks like a bug.

---

## 3. AI Setup Wizard

`[RECOMMENDATION]` This is the highest-risk step for a beginner — it is the
first thing that asks for something they may not have. It must be answerable by
someone who does not know what an API key is.

### Structure

**Step 1 — "How do you want to use AI?"** Plain-language modes, no provider
names:

| Option | Plain description | Maps to |
|---|---|---|
| *Just get started* | Free trial allowance, nothing to set up | Managed, capped |
| *Use my own AI account* | Bring a key; you control cost | BYOK cloud |
| *Run AI on this computer* | Private and free; needs a capable machine | Local runner (desktop) |
| *My institution provides it* | Enter the endpoint your university gave you | Custom endpoint |

`[OBSERVED]` These correspond to the four modes already in `aiModes.ts`.

**Step 2 — guided configuration for the chosen mode only.** Never show all 28
providers `[OBSERVED]`; show two or three recommended for the user's mode and
discipline, each with a direct link to obtain a key and an honest note on free
tier limits.

**Step 3 — verify.** Run a real health check and report the actual result.
`[OBSERVED]` `healthCheckProvider` exists and is already used this way.

### Rules

`[RECOMMENDATION]`

- **Skippable.** A user who skips gets the capped managed allowance and can
  configure later. Blocking the workspace on AI setup blocks the product.
- **No jargon before it is earned.** "API key" appears only after the user has
  chosen a mode that requires one, with one sentence explaining what it is.
- **Honest about cost.** Free tiers have limits; local models need hardware.
  `[INFERRED]` The audience is cost-constrained; a surprise bill is worse than
  a slower onramp.
- **Desktop offers local first**, web does not offer it at all
  ([12](./12-client-strategy.md)).
- **Anything requiring a download is handled by the system, not the user.**
  `[RECOMMENDATION]` Where a local model or runtime would improve output, the
  wizard detects what the machine can run, explains the benefit in plain terms,
  installs what it can, and verifies with a real generation — never "go install
  X". Full flow in [22](./22-local-setup.md).

---

## 4. Knowledge Vault — optional

`[RECOMMENDATION]` Explicitly optional and explicitly explained. The failure
mode is a user who cannot tell whether skipping it breaks something.

### What it is

`[RECOMMENDATION]` **The user's long-term academic library, spanning projects.**
Papers, notes, datasets, and prior drafts accumulated across a degree, reusable
in every future output.

The distinction that must be clear:

| | Knowledge Vault | Project sources |
|---|---|---|
| Scope | All work, all projects, years | One output |
| Lifetime | The user's academic career | The project |
| Purpose | Build once, reuse everywhere | Support this submission |

`[INFERRED]` This distinction is the vault's entire justification. Without it a
user cannot tell why they would add something here rather than to the project
they are working on.

### Onboarding treatment

`[RECOMMENDATION]` One screen, three outcomes:

- **Set it up now** — add a folder or a few files.
- **Skip** — proceed to the workspace immediately. *Nothing is lost; the vault
  can be started at any time and sources added to a project can be promoted
  into it later.*
- **Import** — from Zotero, Mendeley, or BibTeX
  ([C-02](./11-requirements-conflicts.md#c-02--positioning-submission-integrity-vs-full-authoring-assistant):
  import-first).

`[OBSERVED]` The vault currently has three overlapping components
(`ThesisReader` aliased as `KnowledgeVaultManager`, a separate real
`KnowledgeVaultManager`, and `KnowledgeVaultEngineV2` —
[09](./09-technical-debt-register.md) TD-14). `[RECOMMENDATION]` Consolidate to
one before adding to it.

### Approval carries over

`[RECOMMENDATION]` Vault items retain approval state per project. A source
approved for one output is **not** automatically approved for another — the
author must vouch for its relevance to *this* argument. `[INFERRED]` This
preserves the gate that [03](./03-product-definition.md) identifies as the
product's core; a vault that auto-approves would silently defeat it.

---

## 5. Workspace — output-first

`[RECOMMENDATION]` The workspace opens on **"What do you need to submit?"** —
not on a project shell, and not on a phase list.

### Why this replaces the phase model

`[OBSERVED]` Today the mental model is the lettered A–I sequence, with
`WORKFLOW_PHASES` and `phaseGating.ts` driving navigation.

`[INFERRED]` Two problems. It assumes every output follows the same path — a
poster and a PhD thesis do not. And it names stages in the system's terms
("Grounding") rather than the user's ("I need to write a literature review by
Friday").

`[RECOMMENDATION]` Phases become **navigation within an output type**, derived
from that type's definition, not a global constant. The primary axis is the
output.

### Creation flow

```
1  What are you producing?        → output type ([14](./14-output-catalog.md))
2  Where is it going?             → venue: journal, university, conference, funder
3  What do you already have?      → upload; or start empty ([15](./15-evidence-pipeline.md))
4  Confirm the requirements       → system proposes; user edits ([17](./17-compliance-engine.md))
5  Workspace opens with a plan
```

`[RECOMMENDATION]` Step 4 is the pivotal one and the requirement most often
skipped by comparable tools: **the system determines the requirements so the
user does not have to already know them.** A first-year undergraduate does not
know their department's word count; the system proposes it from the rule pack
and lets them correct it.

`[RECOMMENDATION]` Steps 2–4 are all skippable with defaults inferred from
degree level and discipline. A user in a hurry gets a sensible generic
structure and can attach a venue later; gates then re-evaluate.

### Steady state

`[RECOMMENDATION]` The workspace shows, at all times:

1. **Readiness for the target** — what blocks submission, why, and the single
   action that clears each. Replaces phase position as the primary signal.
2. **The structure** — sections from the output type, with per-section word
   budgets and completion state.
3. **The evidence** — sources, approval state, and which are actually cited.
4. **The manuscript** — the editing surface ([16](./16-authoring-lifecycle.md)).

`[INFERRED]` This is the "output-first" requirement made concrete: every
element answers *"how close am I to submitting this specific thing?"* rather
than *"where am I in a generic process?"*

---

## 6. Time to first value

`[RECOMMENDATION]` A measurable onboarding target: **a new user reaches a
workspace with a real structure and a real requirement set in under five
minutes, without configuring AI, without a Knowledge Vault, and without knowing
what an API key is.**

`[INFERRED]` If that is not achievable the onboarding has failed for the
undergraduate segment, which is the least patient and now in scope
([C-01](./11-requirements-conflicts.md#c-01--audience-narrow-segment-vs-all-degree-levels)).

`[OBSERVED]` There is currently no telemetry in the live path
([09](./09-technical-debt-register.md) TD-19), so this cannot be measured
today. Instrumenting the onboarding funnel is a prerequisite for knowing
whether any of this works.
