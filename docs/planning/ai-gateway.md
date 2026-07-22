# AI Gateway — 5-Tier User Choice Model

**Status: PENDING ARCHITECTURE DECISION — NOT APPROVED, NOT IMPLEMENTED.** Depends on `hosting-and-topology.md` being confirmed first — every tier below assumes the client-side-only topology described there. See that document's §7 for the proposed (not decided) sequencing of these tiers relative to everything else.

> **Amended (2026-07-22)**: "client-side-only" above should be read as "client-side by default, with one accepted exception" — a thin, stateless fetch/search proxy, scoped narrowly per `.claude/HANDOVER.md`'s Standing Boundary Rule. That exception was accepted for retrieval (scholarly/data/search — see `target-workflow.md` §5/§7), not for AI-provider traffic. Whether OpenAI's CORS gap (line below) ever gets routed through that same proxy remains a separate, undecided question — see the note at that line.

Full implementation of all five tiers is the eventual target, but see §6 for why they shouldn't all be built at once, and `hosting-and-topology.md` §7 for the proposed order.

---

## Resource Cost at a Glance

| Tier | User cost | Our cost | Where it runs | Resource footprint |
|---|---|---|---|---|
| 1. Local router, no key | Free (one-time local install) | Free | User's device, separate local process | Low browser-side; router process itself has its own footprint |
| 2. Free-tier BYOK | Free (signup only) | Free | Browser → provider, direct | Low — network calls only |
| 3. Heavy BYOK | User pays their provider | Free | Browser → provider, direct | Low — network calls only |
| 4. Affiliate subscription | User pays the subscription | Free (affiliate revenue, if any) | N/A — a signup flow, not a calling mechanism | None (this isn't a technical tier, see §4) |
| 5. Heavy local compute | Free (hardware already owned) | Free | User's device | High — significant local CPU/GPU/RAM/battery |

Tiers 1, 2, 3, and 5 all reuse the same underlying provider-adapter architecture already in `src/services/aiGateway.ts` and `src/ai/providers/` (Anthropic, Gemini, LM Studio, Ollama, OpenAI adapters already exist) — the tiers differ in *whose endpoint gets called and with what credential*, not in needing five separate implementations.

---

## Tier 1: Local Router, No Subscription, No API Key

**Who it's for**: users who want zero cost and zero signup, willing to run one local install.

**Mechanism**: an "omni router"-style local service (e.g., Ollama, LM Studio, or a dedicated local router tool) running on the user's own machine, which the browser calls directly at `http://localhost:<port>`.

**Setup flow (high level)**: since this is a browser app, it cannot install anything on the user's machine automatically. The in-app flow is necessarily a guided manual process:
1. In-app instructions link out to the router tool's download page.
2. User installs and starts the local service.
3. **Critical, easy-to-miss step**: the local service must be configured to allow requests from our hosted domain — Ollama, for example, restricts allowed origins via an `OLLAMA_ORIGINS` environment variable by default, and will silently reject (CORS-block) requests from a browser page unless the hosted site's origin is explicitly allowlisted. Setup instructions must include this step explicitly, not assume it "just works" once the router is running.
4. User enters the local endpoint (e.g., `http://localhost:11434`) in-app; the existing `src/ai/providers/ollama.ts` / `lmstudio.ts` adapters already support pointing at an arbitrary local endpoint and already call it directly from the browser (confirmed in the current `aiGateway.ts` — this part of the mechanism is not new).

**Technical note on HTTPS → localhost**: a static site served over HTTPS calling `http://localhost:<port>` is **not** blocked as mixed content by modern browsers — `localhost`/`127.0.0.1` are treated as a "potentially trustworthy origin" specifically to support this exact local-dev/local-service pattern. The real obstacle is CORS configuration on the local service (step 3 above), not the browser's mixed-content policy.

**Resource cost**: low on the browser/tab side (it's just network calls); the router process itself has whatever footprint the user's chosen local model requires — that's the same footprint discussed under Tier 5.

---

## Tier 2: Free-Tier BYOK

**Who it's for**: users willing to sign up for a free-tier provider account but not pay.

**Mechanism**: direct browser → provider calls using a user-supplied API key from a provider with a usable free tier — OpenRouter is the most likely candidate (it aggregates many models behind one API and free-tier keys, and explicitly supports direct client-side/browser usage as one of its intended use cases).

**Setup flow (high level)**:
1. In-app link to the provider's signup page (OpenRouter or equivalent).
2. In-app instructions for generating a free-tier API key.
3. User pastes the key into the app's existing AI settings UI (`AIControlCenter.tsx`/`AISetupWizard.tsx` already have this pattern for other providers).
4. Key is stored client-side (reusing the already-built `src/utils/crypto.ts` AES-GCM + PBKDF2 encryption, not the server-side AES-256-CBC scheme that goes away per `hosting-and-topology.md` §4) — optionally synced via the BaaS if cross-device persistence is wanted (open question, not decided here).

**Technical note**: OpenRouter is reasonably confident to support this directly; confirm against current docs before finalizing.

**Resource cost**: negligible — network calls only, no local compute.

---

## Tier 3: Heavy BYOK

**Who it's for**: users who want full-capability access via their own paid provider account, for heavier/more capable models than free tiers typically offer.

**Mechanism**: identical to Tier 2 mechanically — direct browser → provider calls with a user-supplied key — just pointed at a paid-tier provider (OpenAI, Anthropic, Google, etc.) instead of a free-tier one.

**Setup flow**: same shape as Tier 2 — in-app link to the provider, instructions for generating a key, paste into settings.

**Per-provider CORS status (needs verification, not assumed)** — this is the same open question raised in `hosting-and-topology.md` §4, restated here because it's most consequential for this tier:
- **OpenAI**: least certain. Historically the most restrictive provider about direct browser CORS access to its API. This should be the first thing verified once building starts — if it doesn't support direct calls, either a thin serverless proxy is needed specifically for OpenAI (still consistent with "no self-managed server" — see the stateless-function distinction in `hosting-and-topology.md` §4), or OpenAI support is deprioritized for this tier. **Not resolved by the 2026-07-22 fetch/search proxy decision**: that decision accepted a proxy for retrieval sources specifically; reusing it for OpenAI traffic too would be a natural-seeming extension once it exists, but it's exactly the kind of scope-creep the Standing Boundary Rule (`.claude/HANDOVER.md`) exists to catch — it needs its own explicit go-ahead, not silent inclusion.
- **Anthropic**: historically requires the caller to send an explicit `anthropic-dangerous-direct-browser-access` header to permit direct browser calls — the header's existence itself confirms it's supported, just opt-in (Anthropic's way of making the "your key is now exposed client-side" tradeoff explicit).
- **Google Gemini**: reasonably confident this works direct-from-browser (a commonly used pattern for this API); confirm against current docs.

**Resource cost**: negligible on our side; cost is entirely the user's own provider bill.

---

## Tier 4: Affiliate-Linked AI Subscription

**Who it's for**: users who want a capable AI experience without configuring their own key or provider account.

**Important reframing**: this is **not a technical AI-calling tier** — it's a monetization/onboarding flow. The mechanism is: surface a curated, affiliate-linked signup offer for a third-party AI subscription (business/legal setup for the affiliate relationship itself is explicitly out of scope for this pass). Once the user signs up and obtains credentials from that subscription, they come back into Tier 2 or 3's actual calling mechanism using those credentials — there is no separate "Tier 4 API client" to build.

**What does need building now**: the placement itself. This shares one mechanism with the other sponsored placements (academic conferences, admissions programs, book publishers) — see `sponsored-placements.md` for the unified design. There is deliberately no separate "tier 4 system" distinct from the sponsored-placement admin config.

**Resource cost**: none on our side beyond rendering a placement slot; the user bears the subscription's cost.

---

## Tier 5: Heavy Local Compute

**Who it's for**: users with capable hardware who want to run larger local models than Tier 1's typical footprint, with no cloud dependency at all.

Two genuinely different sub-approaches exist here, and they should not be conflated:

### 5a. Local router with heavier models (recommended primary approach)
Mechanically identical to Tier 1 — the same local-router mechanism (Ollama/LM Studio, same CORS/setup instructions), just pointed at larger, more capable local models than a typical Tier-1 setup would run. This is the mature, low-technical-risk option: Ollama/LM Studio already handle model download, quantization choices, and GPU acceleration on the user's behalf. Recommended as the primary Tier-5 experience.

**Setup flow addition over Tier 1**: recommended-model guidance (e.g., pointing at appropriately-sized models for the user's stated hardware) and explicit hardware-requirement warnings before the user downloads a multi-gigabyte model — VRAM/RAM requirements scale steeply with model size and quantization level, and a clear warning here prevents a user on modest hardware from downloading something that will thrash their machine.

### 5b. True in-browser inference via WebGPU/WASM (experimental, lower priority)
Running a model's inference directly inside the browser tab itself (e.g., via WebLLM or Transformers.js), with no separate local process at all. **Honest technical assessment**: this is meaningfully less mature than 5a —
- **WebGPU** browser support is inconsistent: solid in current Chrome/Edge, improving but historically behind in Firefox and Safari, and materially weaker on mobile browsers.
- **Model size ceiling**: even on capable desktop hardware, in-browser inference is currently practical mainly for smaller quantized models (roughly up to the 7–8B parameter range at low-bit quantization); this is a real ceiling, not a temporary rough edge.
- **Memory limits**: browser tabs have their own memory ceilings independent of system RAM, and a multi-gigabyte model plus its runtime overhead can hit those ceilings even on a machine that could easily run the same model via a native local router.
- **No clear advantage over 5a today**: given 5a already achieves "fully local, no cloud dependency" with more mature tooling, 5b's main selling point (no separate install) doesn't currently outweigh its technical immaturity. Recommend treating 5b as a future exploration, not part of the initial Tier-5 build.

### Mobile gating (explicit, per the resource constraint)
**Tier 5 (both 5a and 5b) should be gated as desktop-browser-only, or at minimum clearly warned as high-end-hardware-only, and not offered as a serious option on mobile.** Mobile devices generally lack the sustained CPU/GPU headroom, RAM, and battery budget for either a local router process or in-browser inference of any meaningfully-sized model. This should be an explicit UI-level gate (detect mobile / warn prominently), not just documentation.

**Resource cost**: high — this is the one tier where "optimize for typical devices, don't assume unlimited local compute" applies most directly. Per-tier cost note: Tier 5 is the only tier with a meaningful device resource cost at all; Tiers 1–4 are all either free-tier-service network calls or (for Tier 1's *router process itself*, as opposed to the browser tab) a cost borne by a separate, already-optimized-for-this native application, not our browser code.

---

## Cross-Tier Implementation Notes

- All of Tiers 1, 2, 3, and 5a route through the same existing provider-adapter pattern in `src/ai/providers/` and `src/services/aiGateway.ts` — the work is extending/correcting that existing code (per `hosting-and-topology.md` §4's finding that several providers currently proxy through `/api/generate` rather than calling directly), not building parallel implementations per tier.
- Tier 4 is not a calling mechanism at all — it's fully covered by `sponsored-placements.md`.
- The CORS feasibility questions raised for Tiers 1, 2, 3, and 5a in this document and in `hosting-and-topology.md` §4 are the same open questions, not independently-scoped work — resolve them once, early (see `hosting-and-topology.md` §7's proposed Phase 1).
