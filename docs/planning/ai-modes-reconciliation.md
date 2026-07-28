# AI Modes Reconciliation — Step 0 Pre-flight Verification (2026-07-28)

**Status: STEP 0 COMPLETE.** No UI code has been touched yet — this is the
blocking verification pass required before any component work begins, per
this session's instructions. Findings below are from real, live checks
(browser-equivalent `curl` requests with actual response headers/bodies,
and direct inspection of a downloaded npm package's actual shipped source),
not assumptions.

---

## 1. Option 1 ("Smart AI") candidate verification

**Candidate: Pollinations (`https://text.pollinations.ai/openai`) — VERIFIED WORKING.**

Live-tested directly (not read from marketing copy):

- **Real completion, no API key sent**: `POST https://text.pollinations.ai/openai`
  with `{"messages":[{"role":"user","content":"Say OK"}],"model":"openai"}`
  and no `Authorization`/key header returned a genuine chat-completion
  response: `{"content":"OK.", ...}`, model `gpt-oss-20b`, real token usage
  counts. Not a stub, not a 401.
- **CORS preflight passes**: `OPTIONS` request with
  `Origin: https://example.com` returned `204` with
  `access-control-allow-origin: *`, `access-control-allow-methods` including
  `POST`, and `access-control-allow-headers` including `Content-Type`. A
  real browser fetch from any origin, including this app's hosted domain,
  will not be CORS-blocked.
- **GET endpoint also confirmed CORS-open** (`access-control-allow-origin: *`
  on the plain `GET /openai` response too).

**Honest limitations, to be stated plainly in the UI, not buried** (per
public Pollinations documentation/issue tracker, not this app's own claim):
- **Anonymous rate limit: ~1 request per 15 seconds.** This is a real,
  binding constraint — not a soft suggestion. A user drafting multiple
  sections back-to-back will hit it.
- Pollinations' own guidance states anonymous/keyless traffic is "the first
  to get squeezed" under load and is not intended for high-volume or
  production-critical use — appropriate framing for this app: "good for
  trying the assistant immediately, not a durable primary mode for serious
  drafting work."
- Model quality/selection is Pollinations' choice, not the user's — model
  returned in testing was `gpt-oss-20b`, not a top-tier reasoning model.
  Copy must not claim a specific model tier.
- No uptime SLA; Pollinations is a community/free service, not enterprise
  infrastructure.

**Verdict: Option 1 ships as a real, working mode** (not a coming-soon
placeholder) — but its copy must lead with "free, no account, no setup" AND
state the 15-second rate limit and "not for heavy use" framing in the same
breath, not in fine print. The recommendation banner (Step 2) should NOT
unconditionally point new users at Smart AI as "the" recommended mode for
serious work — it's the recommended *first thing to try*, with Local AI or
Cloud AI Providers (free-tier) as the recommended path for anyone doing
real drafting volume. Exact banner copy is a Step 2 decision, but the
constraint is recorded here so Step 2 doesn't over-promise.

No second candidate was tested; Pollinations alone is sufficient to make
Option 1 real. Additional keyless providers can be added to the config
later (`src/config/aiModes.ts`, Step 1) without a UI change.

---

## 2. OmniRoute local-backend feasibility — VERIFIED FEASIBLE, no user CORS configuration needed

Real package (`npm view omniroute` → `omniroute@3.8.48`, MIT, published 2
weeks ago, 287 published versions, maintainer `diegosouza.pw`) — not
installed/run in this dev sandbox (739MB unpacked, bundles a full Next.js
app + Electron desktop build; installing and running a end-user-local-only
tool in a shared cloud dev container to test response headers is
disproportionate). Instead, downloaded the published tarball (`npm pack`)
and inspected its actual shipped TypeScript source directly — this is
stronger evidence than documentation, since it's the real code that ships.

**Finding, from `package/src/server/cors/origins.ts` (verbatim from the
shipped package, not paraphrased):**

> `relaxForTokenAuth` opts the response into a permissive origin fallback
> for the token-authenticated API surface (OpenAI/Anthropic-compatible
> `/v1/*` and `/v1beta/*`, plus read-only public endpoints). Those routes
> authenticate via `Authorization` / `x-api-key` headers that browsers
> NEVER auto-attach, so a permissive `Access-Control-Allow-Origin` there
> carries none of the credentialed-session / CSRF risk that the
> fail-closed default protects... When the explicit allowlist
> (`CORS_ALLOW_ALL` / `CORS_ALLOWED_ORIGINS` / runtime settings) does not
> match, the caller's `Origin` is echoed back (with `Vary: Origin`)... or
> `*` is returned when there is no `Origin` header.

In plain terms: OmniRoute's dashboard/management routes are CORS-locked by
default (correct — those are cookie-authenticated), but the exact
OpenAI-compatible `/v1/...` surface this app would call (with a
per-request API key/token, never a cookie) gets a permissive
`Access-Control-Allow-Origin` **by default, with zero configuration**.
This is a materially better story than Ollama, which requires the user to
manually set `OLLAMA_ORIGINS` (already documented in `ai-gateway.md` §Tier
1) — OmniRoute needs no equivalent step.

**What the user must still do** (unavoidable, since this is a local
install, not something the browser app can do for them):
1. `npm install -g omniroute` (or the documented Docker/Electron path).
2. Run it — starts the dashboard at `http://localhost:20128` and the
   OpenAI-compatible API at `http://localhost:20128/v1`.
3. Enter `http://localhost:20128/v1` as the endpoint in-app, plus
   whichever per-provider token OmniRoute itself is configured to route
   (OmniRoute's own job is proxying to 200+ providers — this app treats it
   as one more OpenAI-compatible local endpoint, same shape as the
   existing `custom` adapter).

**Verdict: OmniRoute is a real, first-class Local AI backend** (per the
already-resolved architecture decision), requires no CORS workaround
instructions in our setup copy (unlike Ollama, which still needs its
`OLLAMA_ORIGINS` step documented), and needs no new adapter code — see §3.

---

## 3. Mapping the 5 user-facing modes to the existing 5 BYOK tiers (`ai-gateway.md`)

**These are the same underlying concept, differently framed for two
different audiences** (`ai-gateway.md` is the internal/engineering framing;
the 5 modes are the user-facing framing) — not two competing taxonomies.
Reconciled 1:1 below; no tier is left unmapped, and one new concept
(Smart AI) is added that `ai-gateway.md` never covered.

| User-facing mode | `ai-gateway.md` tier | Notes |
|---|---|---|
| **Smart AI** | *(new — not in `ai-gateway.md`)* | Keyless hosted endpoints (Pollinations, §1 above). `ai-gateway.md` never considered a keyless-hosted-third-party option; it assumed every cloud path was BYOK. This is a genuinely new 6th concept, not a renaming. `ai-gateway.md` should be updated to add this as a new tier in a follow-up doc pass (not blocking this UI work). |
| **Cloud AI Providers** | Tier 2 (Free-tier BYOK) | OpenRouter, Google Gemini, Groq, DeepSeek, Together AI — providers chosen for this mode share Tier 2's defining trait: a usable free tier exists. (Groq and Together AI are new to this app's provider list — see Step 1 config note below.) |
| **Local AI** | Tier 1 (Local router, no key) **+** Tier 5a (heavy local compute, same mechanism) | `ai-gateway.md` itself says Tier 5a is "mechanically identical to Tier 1... just pointed at larger models" — already documented as the same code path. The 5-mode UI correctly presents these as one mode ("Local AI") with a backend choice (Ollama / LM Studio / OmniRoute / custom) and model-size guidance within it, rather than two separate top-level modes. Tier 5b (in-browser WebGPU/WASM) is `ai-gateway.md`'s own "experimental, lower priority, not part of the initial build" — correctly absent from the 5-mode UI; this is not a gap. |
| **Bring Your Own AI (BYOK)** | Tier 3 (Heavy BYOK) | OpenAI, Anthropic Claude, Cohere, Qwen, DeepSeek's paid tier — providers where the defining trait is "user already has (or is willing to pay for) a paid-tier account," matching Tier 3 exactly. |
| **Partner Subscription** | Tier 4 (Affiliate-linked subscription) | Exact match — `ai-gateway.md` already frames this as "not a technical AI-calling tier... a monetization/onboarding flow," identical to this task's "honest coming-soon, do not name partners that don't exist" instruction. No partner is currently under contract — ships as coming-soon, consistent with both docs. |

**No code duplication risk**: `src/services/aiGateway.ts`'s existing
`AIProviderAdapter` interface and `AI_PROVIDERS` registry (6 cloud
adapters + `ollama` + `custom`) already implement the Tier 1/2/3/5a
mechanism — confirmed by reading the file directly (`aiGateway.ts:71-168`
for the registry, concrete adapters below it). The 5-mode config
(`src/config/aiModes.ts`, Step 1) is a **UI-level grouping/framing layer
on top of this existing registry**, not a parallel implementation:
- Local AI's "Ollama / LM Studio / OmniRoute / custom" choice all resolve
  to the existing `ollama` adapter or the existing generic `custom`
  adapter (LM Studio and OmniRoute are both just OpenAI-compatible local
  servers at a different default port — `custom`'s existing mechanism
  already handles "any OpenAI-compatible local server," confirmed at
  `aiGateway.ts:156-167`). This needs a UI preset (default endpoint +
  label per backend choice) and possibly renaming the registry entry's
  label from "Custom Server (vLLM/LM Studio)" to something that also
  covers OmniRoute — not new adapter code.
- Cloud AI Providers / BYOK both resolve to existing cloud adapters
  (`gemini`, `openai`, `claude`, `deepseek`, `qwen`, `cohere`). Groq and
  Together AI are genuinely new — Step 1 needs two new adapters following
  the existing pattern (both are OpenAI-compatible REST APIs, low
  implementation risk).
- Smart AI (Pollinations) needs one new adapter, `pollinations` — keyless,
  `requiresApiKey: false`, `type: 'cloud'`, no vault interaction at all
  (§4 below).

---

## 4. Vault-gate preservation — confirmed as the one existing gate, to stay the single gate

Confirmed via direct grep: **only two files in the entire codebase touch
`isVaultUnlocked()` / `getVaultPassphrase()` / `setVaultPassphrase()`** —
`AIControlCenter.tsx` and `AISetupWizard.tsx` (`src/services/vaultPassphrase.ts`
is the shared module both import from). This is exactly the surface this
redesign touches, so there is no *other* hidden key-entry path to find —
but the redesign must not introduce a new one:

- **Smart AI**: never touches the vault — no key exists to protect. Its
  setup flow must not call `isVaultUnlocked()` at all, and must not gate
  on it (gating a keyless mode behind a vault would be a UX regression,
  not a security improvement).
- **Cloud AI Providers / BYOK**: both are key-entry paths. Every step that
  renders an API-key `<input>` must check `isVaultUnlocked()` first and
  render the existing unlock prompt otherwise — same pattern as today's
  `AIControlCenter.tsx:283` (`activeSubTab === "credentials" && !vaultUnlocked`)
  and `AISetupWizard.tsx`'s `renderStep2`'s `needsVault` check.
- **Local AI**: Ollama/LM Studio/custom typically need no key
  (`requiresApiKey: false`), so no vault gate needed for those. **OmniRoute
  is the one Local AI backend that may need a token** (it authenticates
  provider traffic on the user's behalf) — if the in-app flow ever asks
  the user to paste an OmniRoute-issued token, that specific field must
  sit behind the vault gate too, unlike Ollama's plain endpoint URL.
- **Partner Subscription**: no key entry in this app at all (user
  transacts with the partner directly, then re-enters via Cloud AI
  Providers/BYOK with their own credentials — already documented as the
  correct flow in `ai-gateway.md` Tier 4).

**Regression test requirement (Step 3/8)**: a test asserting that for every
mode/provider combination where `requiresApiKey === true`, the rendered
component shows the vault-unlock prompt (not a key `<input>`) when
`isVaultUnlocked()` is false — parametrized over the config from Step 1,
so a future provider added to config automatically gets covered without a
new test being hand-written per provider.

---

## 5. Visual language confirmation

`docs/planning/sci-fi-redesign-scoping.md` and
`docs/planning/sci-fi-redesign-progress.md` confirm `AIControlCenter.tsx` /
`AISetupWizard.tsx` are already-redesigned (Step 4 of that sequence,
commit `2779683`): cyan (`--color-cyan-accent` / `--color-cyan-accent-dim`)
for AI/system-state signals (active sub-tab, connection status, selected
provider), gold reserved for citations/scholarship, both components kept
on their existing light card surface (not dark) after an earlier attempt
at full dark conversion was reverted for breaking text legibility. **This
IA/UX redesign builds on top of that existing token system** — new
components (`AIModeCard`, mode-selection grids, sub-nav) use
`--color-cyan-accent`/`--color-cyan-accent-dim` for selection/active/status
states, the existing gold for nothing (no citation content lives in these
two components), `:focus-visible` (already global, `src/index.css`) for
keyboard focus, and respect `prefers-reduced-motion` (already global CSS
rule, plus `useReducedMotion` from `motion` for any JS-driven animation,
per the CommandPalette precedent). No new tokens are needed for this work.

---

## Net effect on the mode lineup

**Nothing in the planned 5-mode lineup changes.** All five ship as
originally planned:

1. **Smart AI** — ships as a real, working mode (not coming-soon),
   Pollinations-backed, with the 15-second rate limit and "not for heavy
   use" framing stated plainly per §1.
2. **Cloud AI Providers** — ships as planned; two new adapters
   (Groq, Together AI) needed alongside existing Gemini/OpenRouter-class
   providers.
3. **Local AI** — ships as planned; OmniRoute confirmed as a first-class
   backend needing no CORS workaround copy (better story than Ollama, which
   still needs its existing `OLLAMA_ORIGINS` instructions preserved).
4. **Bring Your Own AI (BYOK)** — ships as planned on existing adapters.
5. **Partner Subscription** — ships as honest coming-soon, no invented
   partners, per instructions.

No hard-stop condition was triggered. Proceeding to Step 1.

## Step 1 notes

- `src/config/aiModes.ts`: the 5-mode config, `AIMode`/`AIModeProviderOption` types, `getAIMode()`. Copy follows the honest-limitations rule throughout (Smart AI states its real 15s rate limit; Partner Subscription's `comingSoonNote` explicitly says no partner is confirmed). A jargon test (`aiModes.test.ts`) fails the build if "Tier N", "backend", "endpoint", "router", or "inference" ever leaks into user-facing fields — "free tier"/"paid tier" are allowed since that's the providers' own honest terminology, not our internal framing.
- Three new adapters added to `src/services/aiGateway.ts` (Pollinations, Groq, Together AI) plus matching `server.ts` `/api/generate` (and its streaming counterpart) blocks for Groq/Together — same pattern as every existing BYOK cloud provider. Pollinations calls `text.pollinations.ai` directly from the browser (no server proxy, no key), per its Step 0-verified keyless/CORS-open status. `AISettings.provider` union and 4 new key fields (`groqApiKey`/`groqModel`/`togetherApiKey`/`togetherModel`) added to `src/types.ts`.
- `src/components/ai/AIModeCard.tsx`: the one shared card, consumed by nothing yet — **no live-browser verification was possible for this step alone**, since it has no page to render on in the running app. This is deferred to Step 2, where the card gets wired into the real onboarding screen and live-verified there. Recorded here explicitly rather than silently skipped, per the standing live-verify rule.
- 27 new tests total (7 config, 14 card, 6 adapter), all passing; `tsc --noEmit` clean; full suite 824/826 (same 2 pre-existing unrelated failures).

## Progress log

| Step | Description | Status |
|---|---|---|
| 0 | Pre-flight verification (this document) | 🟢 done |
| 1 | Central config + shared `AIModeCard` | 🟢 done (foundation only — no live consumer yet, see note) |
| 2 | Onboarding screen | 🔲 not started |
| 3 | Per-mode setup flows | 🔲 not started |
| 4 | Settings mirroring onboarding | 🔲 not started |
| 5 | Settings sub-navigation & management surfaces | 🔲 not started |
| 6 | Smart AI status & diagnostics | 🔲 not started |
| 7 | Accessibility, responsive, motion | 🔲 not started |
| 8 | Final verification | 🔲 not started |
