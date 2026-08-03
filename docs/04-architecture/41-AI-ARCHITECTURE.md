# AI Architecture — Gateway and Warden

> **Doc ID:** 41 · **Status:** Design · **Depends on:** `25`, `40`, `46`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

Multi-provider inference with minimised payloads, and the egress control that
makes the privacy promise enforceable.

---

## 1. Principles

| # | Principle |
|---|---|
| A1 | **Minimise what leaves.** The Warden sends the least payload that will do the job (`44` §5.1) |
| A2 | **Provider-agnostic.** No agent knows which provider serves it |
| A3 | **Egress is controlled.** Every outbound call passes the Warden. No exceptions, no bypass |
| A4 | **The user chooses.** Task-level model binding, visible and changeable |
| A5 | **Costs are visible.** Before an expensive action, and recorded after |
| A6 | **Failures degrade honestly.** Failover is disclosed; substitution is never silent |
| A7 | **Keys are write-only.** Encrypted via managed KMS, never returned to the client, never logged (`44` §3.1) |
| A8 | **No training on user content.** Not a setting. A property |

---

## 2. Structure

```
   Agents (app/mesh)
        │  "complete this, task class = drafting"
        ▼
┌───────────────────────────────────────────────┐
│  GATEWAY                                       │
│  ┌─────────────────────────────────────────┐  │
│  │ Binding resolution                       │  │
│  │  task class + user policy + availability │  │
│  │  + Egress Class + budget → provider+model│  │
│  └──────────────────┬──────────────────────┘  │
└─────────────────────┼─────────────────────────┘
                      ▼
┌───────────────────────────────────────────────┐
│  WARDEN            ← mandatory, unbypassable   │
│  1. classify content → Egress Class            │
│  2. evaluate policy for (provider, class)      │
│  3. redact where policy requires               │
│  4. consent check (first time per pair)        │
│  5. record the decision                        │
└──────┬────────────────────────────┬───────────┘
       │ allow                      │ deny
       ▼                            ▼
┌──────────────┐          reroute to a permitted
│  ADAPTERS    │          provider, or refuse with
│  ollama · lmstudio ·    the specific reason
│  openai · anthropic ·
│  google · openrouter ·
│  deepseek · qwen ·
│  mistral · azure ·
│  custom-openai-compatible
└──────────────┘
```

**The Warden sits between the Gateway's routing decision and the adapter call.**
Routing may select a provider that the Warden then refuses, in which case routing
runs again with that provider excluded. This ordering means privacy policy
overrides capability preference, always.

---

## 3. Providers

| Provider | Kind | Egress | Notable for |
|---|---|---|---|
| Ollama | Local | None | Default. Free, private, offline |
| LM Studio | Local | None | Local with GUI model management |
| llama.cpp / GGUF | Local | None | Direct execution, advanced users |
| OpenAI | Cloud | Yes | Broad capability |
| Anthropic | Cloud | Yes | Long context, careful instruction-following |
| Google Gemini | Cloud | Yes | Very large context |
| OpenRouter | Aggregator | Yes | Many models, one key |
| DeepSeek | Cloud | Yes | Strong reasoning, low cost |
| Qwen | Cloud + local | Conditional | Multilingual |
| Mistral | Cloud + local | Conditional | Efficient open weights, EU hosting |
| Azure OpenAI | Cloud | Yes | Institutional deployments |
| Custom OpenAI-compatible | Any | Configured | Institutional gateways, self-hosted |

### 3.1 Adapter contract

Every provider implements one interface (`REQ-AI-2`):

```
complete(request)      → Completion
stream(request)        → AsyncIterable<Chunk>
embed(texts)           → Vector[]
listModels()           → ModelDescriptor[]
validateCredentials()  → ValidationResult
capabilities()         → { streaming, tools, vision, contextWindow, … }
```

Adding a provider is one adapter file plus a registry entry. No agent, kernel, or
UI change.

### 3.2 Model registry

Delivered from the cloud registry, signed, cached locally, and updatable without
a client release (`40` §8.3).

```yaml
id: anthropic/claude-sonnet-5
provider: anthropic
context_window: 200000
capabilities: [streaming, tools, vision]
pricing: { input_per_mtok: …, output_per_mtok: … }
suited_for: [drafting, verification, rule_extraction, chat]
quality_tier: high
```

Local models additionally carry: parameter count, quantisation, disk size, RAM
requirement, and measured tokens/sec on reference hardware — which is what lets
the AI Setup Wizard refuse to recommend a model the device cannot run
(`REQ-ONB-5`).

---

## 4. Task classes and binding

| Task class | What it does | Sensitivity | Local viable |
|---|---|---|---|
| `drafting` | Generate prose | **High** — sees the manuscript | Yes |
| `refinement` | Language improvement | **High** | Yes |
| `chat` | Assistant conversation | High | Yes |
| `summarisation` | Summarise sources | Medium | Yes |
| `verification` | Check claims against evidence | Medium | Partially |
| `rule_extraction` | Read guidelines | Low — public documents | Partially |
| `discovery` | Build and refine queries | Low | Yes |
| `embedding` | Vectorise for search | **High** — embeds everything | Yes |
| `classification` | Route, categorise | Low | Yes |

### 4.1 Binding resolution

```
user's explicit binding for this task class
  → if none, the active preset
  → filtered by provider availability
  → filtered by Warden policy for the content's Egress Class
  → filtered by budget headroom
  → filtered by context-window fit
  → resolved model
```

If the resolved set is empty, the Gateway refuses with the reason — "your privacy
settings don't permit sending manuscript text to any configured cloud provider,
and no local model is running" — and offers the specific remedies.

### 4.2 Presets

| Preset | Bindings |
|---|---|
| **Maximum privacy** | Every class local. No cloud egress |
| **Balanced** *(default)* | Local: drafting, refinement, chat, embedding. Cloud: verification, rule_extraction, discovery, summarisation |
| **Maximum capability** | Cloud everywhere; local as failover |
| **Custom** | Per class |

**Balanced keeps the manuscript local and sends only bibliographic and derived
content to the cloud.** That is the design intent, and the privacy summary in the
Setup Wizard (`25` §5.7) states it in exactly those terms.

`embedding` is local in both privacy-preserving presets, which matters more than
it appears: embedding is the one task that necessarily processes *everything* the
user owns. A cloud embedding provider sees the entire corpus and Vault.

---

## 5. The Warden

### 5.1 Egress Classes

| Class | Contains | Example |
|---|---|---|
| `public` | Already-public information | A published abstract, a journal's guidelines |
| `bibliographic` | Citation metadata | Title, authors, DOI, venue |
| `derived` | Derived from user content but not the content | Query terms, a structural outline, statistics |
| `user_content` | The user's own writing and materials | Draft text, uploaded documents, notes |
| `restricted` | User-marked sensitive | Unpublished data, participant information, embargoed work |

### 5.2 Classification

Deterministic and conservative:

- Draft text, uploaded documents, and Vault content → `user_content`.
- Project or source metadata alone → `bibliographic`.
- Requirement source documents (published guidelines) → `public`.
- Generated queries and outlines → `derived`.
- Anything the user marks → `restricted`.
- **Anything ambiguous → the higher class.** Misclassifying downward is a privacy
  failure; misclassifying upward is an inconvenience.

Users may mark a project, section, or source as `restricted`, which pins it to
the strictest policy regardless of preset.

### 5.3 Policy

Policy is a matrix of (provider × Egress Class) → `allow` | `deny` | `redact` |
`ask`.

Default policy:

| Class | Local | Cloud |
|---|---|---|
| `public` | allow | allow |
| `bibliographic` | allow | allow |
| `derived` | allow | allow |
| `user_content` | allow | **ask** (first time per provider), then per the user's choice |
| `restricted` | allow | **deny** |

`restricted` content never reaches a cloud provider under default policy. The
user can override per provider, and the override is a deliberate, recorded
decision with an unambiguous warning.

### 5.4 Egress preview

At any point the user can see exactly what would be sent (`REQ-SEC-10`):

```
┌── Would be sent to Anthropic ─────────────────────────┐
│  Model: claude-sonnet-5      Class: user_content       │
├────────────────────────────────────────────────────────┤
│  System: You are assisting with an academic methods…   │
│                                                        │
│  Context: [3 evidence spans, 1,240 words]              │
│    • Chen et al. 2021, pp. 12–14                       │
│    • Okonkwo 2019, p. 88                               │
│                                                        │
│  Your text: [current section, 340 words]               │
│    "Analysis proceeded in two stages. First…"          │
│                                                        │
│  ~2,100 tokens · ~$0.007                               │
├────────────────────────────────────────────────────────┤
│  [Send]  [Don't send]  [Always allow this]  [Use local]│
└────────────────────────────────────────────────────────┘
```

Shown on first egress per (provider, class), and any time on request. **This
screen is the privacy claim made concrete** — it is the difference between a
policy the user is asked to believe and a mechanism they can inspect.

### 5.5 Egress audit

Every decision is recorded locally: timestamp, provider, model, class, decision,
payload size, token count, cost, and a content hash (not the content). Viewable
and exportable in Settings → Privacy.

---

## 6. Failover

Classified errors determine behaviour:

| Error class | Retryable | Failover worthwhile |
|---|---|---|
| `network_unreachable` | Yes | Yes |
| `provider_down` | Yes | Yes |
| `rate_limited` | Yes, after backoff | Yes |
| `auth_failed` | No | Yes |
| `quota_exhausted` | No | Yes |
| `context_too_long` | No | No — chunk instead |
| `content_filtered` | No | No — a different provider will likely refuse too |
| `model_unavailable` | No | Yes |
| `invalid_request` | No | No — a bug |

Failover walks the chain from the bound model, respecting Warden policy at each
step. A failover to a provider the Warden denies is skipped, not asked about
mid-run.

**Every substitution is disclosed** (`REQ-AI-9`): the run record shows which
model actually served the request, and if the substitute is a lower quality tier
the user is told.

### 6.1 The current implementation carries forward

`src/services/providerFailover.ts` and `aiErrors.ts` already implement classified
errors with a `failoverWorthwhile` flag. That design is correct and generalises
directly — it needs the provider set widened and the Warden interposed.

---

## 7. Cost and budgets

| Level | Control |
|---|---|
| Request | Estimated before an expensive call; actual recorded after |
| Run | Ceiling per agent run; pause and ask on exceed |
| Project | Budget with warning thresholds |
| Workspace | Aggregate budget |

Local model use is recorded but costs nothing, which makes the local/cloud
trade-off legible: the budget indicator shows what a user has saved by keeping
work local.

---

## 8. Context management

| Concern | Approach |
|---|---|
| Long documents | Section-scoped operations; whole-document only where necessary |
| Large corpora | Retrieval, not stuffing — relevant spans only |
| Window overflow | Chunk with a stated strategy; **disclose that the model did not see everything at once** |
| Window differences | Binding respects each model's window; a 4k local model gets a different retrieval budget than a 200k cloud model |

The disclosure requirement matters: a user should know when a "review this
chapter" run actually reviewed it in six pieces, because that changes what the
output means.

---

## 9. Prompts

| Property | Approach |
|---|---|
| Storage | Versioned templates in agent configuration, not inline in code |
| Composition | System (agent role) + task + context + constraints |
| Model adaptation | Per-family variants; a 7B local model needs different instruction shape than a frontier model |
| Injection resistance | Untrusted content (source text, web pages) is delimited and the model instructed to treat it as data |
| Privacy | Prompts are never transmitted to the operator; only a hash is recorded in the Ledger |

### 9.1 Prompt injection

Real, given that the system feeds untrusted PDFs and web pages to models. Layered
mitigations:

1. Untrusted content is clearly delimited and marked as data, never instruction.
2. Agents have narrow output contracts; a response that does not conform is
   rejected before it reaches the document.
3. Citations must resolve to approved corpus entries — injected instructions
   cannot introduce a source (`30` §6.1, invariant 2).
4. Agents cannot exceed their capability grants regardless of what a model
   returns (`REQ-AI-5`).
5. Egress is Warden-controlled, so an injection cannot exfiltrate.

The structural guarantees do more work than the prompt engineering here, which is
the correct balance.

---

## 10. Local models

### 10.1 Integration

Ollama and LM Studio over their local HTTP APIs. Direct GGUF execution is a later
option (`55`).

| Concern | Approach |
|---|---|
| Detection | Probe known ports at startup and on demand |
| Model management | List, pull with progress, and delete through the app |
| Loading | First inference loads the model; ~20–30 s cold. Surfaced honestly (`21` §8) |
| Memory | One model resident at a time; VRAM/RAM checked before load |
| Speed | Measured and displayed in tokens/sec |
| Failure | Runtime not running → offer to start it, with instructions |

### 10.2 Quality expectations, stated honestly

A 7B local model is meaningfully weaker than a frontier model at long-form
academic reasoning. The product says so rather than letting users discover it:

> Local models are private and free, but weaker at long, complex reasoning. For
> drafting a section you'll review carefully, they work well. For verifying
> claims across many sources, a cloud model will do better.

Per-task guidance appears in the binding UI, so the recommendation arrives where
the decision is made.

---

## 11. Improvement loop

How agents get better over time (`REQ-AI-8`), within privacy constraints.

| Signal | Collected | How |
|---|---|---|
| Suggestion accept/reject | Aggregate counts by agent version | No content |
| Explicit feedback | Opt-in, user-reviewed before sending | User sees exactly what is sent |
| Error rates | Aggregate | Automatic |
| Golden-set results | In the Foundry | Curated data only |

**Hard constraints:**

- User content is **never** used for training (`01` §5). Not opt-in, not paid,
  not anonymised-and-used. Not a setting.
- Explicit feedback is opt-in per submission, and the user sees the exact payload
  before it is sent.
- Improvement happens through operator-authored configuration changes evaluated
  against golden sets (`49` §5), not through learning from user data.

"Improvement" here means Sam edits a prompt, evaluates it, and promotes it
(`26` Journey 9) — not a model that quietly learns from what people write.

---

## 12. Current state

**The Warden and a new server-side Gateway are implemented and tested**,
alongside the pre-existing client-side gateway this section used to describe
exclusively.

### 12.1 New (this revision)

| Module | Path | Covers |
|---|---|---|
| Warden | `src/platform/warden/` | §5 in full: classification (`classify.ts`), policy (`policy.ts`), `evaluate()`/consent/restricted-scope/audit (`warden.ts`). 23 tests |
| Gateway | `src/platform/gateway/` | §2–§3: `complete()`/`stream()` as the sole sanctioned entry points, plus `completeWithFailover()`. OpenAI-compatible, Anthropic, Gemini, and Cohere adapters built on the existing `providerCatalog.ts`. 19 tests |
| Architectural enforcement | `src/platform/__tests__/architecture.test.ts` | The "no bypass" rule: no `fetch()` to a provider outside `gateway/adapters.ts`, and no `src/app/*` file reaching a provider except through `platform/gateway` |
| First consumer | `src/app/studio/`, `server/routes/studio.ts` | The Studio's model-backed levels (2–5) are the first real traffic through this path, end-to-end tested including a live server boot |

### 12.2 Scope note — the legacy path is not yet migrated, by design

`src/services/aiGateway.ts` (browser, posts to `/api/generate`) and
`server/routes/ai.ts` (the pre-existing Express proxy with 30+ providers
already wired) **continue to run exactly as before**. They are not routed
through the Warden. Migrating them is a phased, in-progress effort
(`13` §8.1), not a silent gap. Phase 1 — closing the new Gateway's provider
and capability gap so migrating the endpoints in later phases doesn't also
mean losing functionality — is done:

| Current (legacy path, unchanged) | Target (new path) |
|---|---|
| 30+ providers via `providerCatalog.ts` | 4 provider calling conventions (OpenAI-compatible, Anthropic, Gemini, Cohere) via `platform/gateway/adapters.ts` — the same catalog. Any further OpenAI-compatible provider needs zero new adapter code, only a catalog entry; a genuinely new calling convention still needs one |
| No egress control | The Warden, mandatory, architecturally enforced |
| No task-level classification | Nine task classes, each with default Egress Class behaviour |
| Client-side encrypted key vault (`apiVault.ts`) | Keys passed per-request to the server Gateway (BYOK, matching the existing model); a managed-KMS custody path per `44` §3.1 is not yet built |
| Classified errors with failover (`providerFailover.ts`, `aiErrors.ts`) | Reused directly: `completeWithFailover()` calls `executeWithFailover()` and classifies adapter HTTP failures with `classifyHttpError()` — not a reimplementation. Each candidate provider still passes through the Warden individually, since per-provider consent (an `ask` decision) genuinely differs by provider while a hard `deny` does not — see `completeWithFailover()`'s doc comment in `gateway.ts` |
| SSE streaming | `stream()` is Warden-gated identically to `complete()`. Native SSE parsing for OpenAI-compatible, Anthropic, and Gemini; Cohere has no verified streaming wire format available to this codebase, so its adapter deliberately omits `stream()` and `gateway.stream()` falls back to `complete()` plus a single synthetic chunk rather than ship a guessed parser |
| — | Local model support (Ollama/LM Studio) is withdrawn in revision 2 (`01` §12.2); not applicable to either path, and not implemented by the new Gateway either |

**Practical effect today:** existing AI features (drafting, chat, etc. built
on the legacy path) are unaffected and keep working — nothing in
`server/routes/ai.ts` calls `platform/gateway` yet. New features — starting
with the Studio — are built exclusively on the Warden-gated path. The
remaining migration phases (endpoint-by-endpoint cutover behind a flag, then
the general `/api/generate` proxy, then retiring `ai.ts`) are tracked
separately and have not been attempted yet, since each touches live traffic
and is deliberately scoped as its own reviewed unit of work.
