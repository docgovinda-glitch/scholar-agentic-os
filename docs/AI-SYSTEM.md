# AI System

How AI requests are authored, routed, paid for and kept safe. Entry layers and call sites are in [`AI-CALL-MAP.md`](AI-CALL-MAP.md).

## 1. One brain

`server/src/services/scholarBrain.ts` is the only AI brain for every workspace. Only it imports `server/utils/llm.ts`. Routes and services call the logged wrappers it exports (`callOpenRouterJSON`, `callOpenRouterText`, `streamOpenRouterJSON`) or methods on the `scholarBrain` object. New AI capability means a new method there. The rules and the permanently banned artefacts (Quantum literature catalog, Zappos/Schein outline, keyword-to-framework tables) are in `CLAUDE.md` and are enforced by `src/__tests__/singleBrainGuardian.test.ts`.

`scholarBrain` provides:

| Method | Purpose |
| :--- | :--- |
| `complete`, `stream` | Routed completion with scholarly voice prompt, guardrails and JSON repair; `browserFallback: true` makes it answer with a browser hand-off when the user's only AI is local |
| `callJSON`, `callText`, `streamJSON` | Wrappers over the llm helpers |
| `getCandidates`, `resolveRequestAiConfig`, `buildAuthorizedPolicy`, `getPremiumAiPolicy` | Candidate resolution and egress policy |
| `signLlmChallenge`, `computePromptHash`, `readVerifiedBrowserResult` | Signed challenge for prompts that the browser runs and returns |
| `generateGeminiEmbedding` | Embeddings for semantic RAG |
| `retrieveEvidence` | Live scholarly discovery (OpenAlex, Crossref, EuropePMC/PubMed, arXiv) plus Vault and uploaded datasets |
| `scrubAndFormatCitations` | Citation-lock scrub: removes unverified author-year strings and formats verified `[CITE:id]` tokens in the requested style (`apa7`, `harvard`, `ieee`, `chicago`, `mla9`, `vancouver`, `oscola`) |
| `enforceScholarlyVoice` | British orthography, cliché suppression, burstiness check |
| `allocateWordsByMarks`, `parseQuestionMarks` | Marks-weighted word allocation |
| `formatCitationLedger`, `validatePreflightMesh` | Citation ledger and agent-mesh preflight |

Supporting modules: `server/src/services/semanticRagEngine.ts` (chunk and rerank evidence), `server/src/utils/citationLockScrubber.ts`, `scholarlyVoiceGuard.ts`, `wordBudgetAllocator.ts`, `sectionBudget.ts`, `sectionScaffold.ts`, `src/shared/scholarGuardrails.ts`, `src/shared/llmJsonParser.ts`.

## 2. Request chain

Every server-side model call is resolved by the router bridge (`server/src/ai/routerBridge.ts`) over the router in `src/platform/router/router.ts`. Per request the chain is:

1. **Premium** resources, when the user is entitled and within quota;
2. the user's own keys, in the order they sent them (`x-ai-keyring` header, or the single-provider `x-ai-provider` / `x-ai-model` / `x-ai-api-key` / `x-ai-base-url` headers);
3. the user's local model.

Candidates carry a lane (`premium`, `byok`, `local`) and a `runsIn` site (`server` or `browser`). A provider failure moves to the next candidate with a visible event; the request is handed to the browser (HTTP 426 with the prompts, or the `aiRoute` events) only when the next candidate really is a local model. A deployed server cannot reach a model on the user's machine; only a development server, or one with `ALLOW_SERVER_LOCAL_AI=true`, can (`serverCanReachLocalModels`).

Router behaviour (`src/platform/router/`): per-candidate circuit breaker (closed, open, half-open with doubling cooldown), bounded retry with backoff (`maxAttempts: 2` by default), first-token timeout 25 s and idle timeout 20 s, token-budget preflight, and a trace of attempts. Router provider ids: `openai`, `anthropic`, `google`, `groq`, `deepseek`, `mistral`, `ollama`, `lmstudio`, `webllm`, `custom`.

### 2.0 Every catalog provider, live models, failover

- **All 37 catalog providers work.** `src/platform/router/providerMap.ts` (`resolveRouterTarget`) maps a catalog id to the wire protocol: Gemini, Claude, OpenAI, Groq, DeepSeek and Mistral are native; every other OpenAI-compatible catalog entry (and Cohere, via its compatibility endpoint) runs as `custom` on the catalog's `baseUrl`. A keyring entry carries `via` (the catalog id) so two `custom` providers never share a breaker, cache entry or candidate id. Cloudflare needs the user's own address and is left out until it has one. The catalog hosts are allowed by `aiEndpointGuard`; any other address is screened as before.
- **No model name is assumed anywhere on the server.** A keyring entry's `model` is an id or `"auto"` (also what the legacy `x-ai-*` headers mean when `x-ai-model` is absent). `server/src/ai/liveModels.ts` fetches the provider's own model list (`listModelsFor`, cached 6 h; failures cached 2 min), keeps the saved model only while the provider still lists it, replaces a missing/`auto`/retired one with the live recommendation (`recommendModels`, `src/platform/router/modelRecommendation.ts`: newest balanced-tier model, plus the most capable and the fastest, each with a reason), and adds up to two live alternates from the same connection. A model the provider reports gone (404/410 or "model not found") is quarantined for 30 minutes. Providers that publish no list (Qwen, Zhipu, AI21, Perplexity, Cloudflare) skip an `auto` entry with a message asking for a model; a named model is trusted. Output limits come from the provider's list when it reports one, otherwise 8,192 tokens.
- **Failover strategy** (retry, then fall back; honour `Retry-After`; per-candidate circuit breaker; fall back only on failures another model can fix; ordered fallbacks with separate quota pools; a total time budget):
  - a failed model moves to the **next model of the same connection** first for per-model failures (`rate_limit`, `server`, `overloaded`, `timeout_*`, `model_unavailable`, `empty_output`, `context_overflow`), because providers meter and fail per model;
  - an **account-wide** failure (`quota`, `auth`, `network`) skips the rest of that connection and goes to the next provider;
  - a stream that ends **without text** is a failure (`empty_output`; e.g. a reasoning model that spent its whole output limit thinking), never an answer, in the router and in the browser gateway (`assertAnswered`);
  - bad requests and content-filter blocks do not fall back; the chain stops after `maxTotalMs` (150 s) of trying; every switch is a visible `fallback` event.
- **Same connections on every device.** The browser attaches this device's keys to each AI request, and the server adds the signed-in person's own account connections they do not cover (`server/src/ai/accountAi.ts`: their saved keys from `user_provider_keys`, decrypted under `MASTER_KEY` for that request only, plus their default provider and chosen models from `user_ai_settings`; held in memory for 60 s, cleared when keys change, never logged or returned). So a new browser or phone works on its first request after sign-in, before its own key sync runs. Browser and server build the keyring with the same pure function (`src/platform/router/keyringAssemble.ts`).
- **All workspaces share this chain.** Ask Scholar, Coursework, Proposal, Thesis and Presentation call `scholarBrain` → `routedText`. The Journal Writer's older pipeline (manuscript sections, coherence check, peer review, cover letter, anonymisation, journal requirements: `src/app/*` over the gateway) runs through `server/src/ai/studioAi.ts` (`runWithUserAi`): the connection the screen chose first, then the person's other connections, each with its live model, falling through on failure (a `GatewayDenied` privacy verdict never falls through; a key or credit failure skips the rest of that connection). The client attaches keys to those routes via `AI_ROUTE_PATTERNS`. Presentation copilot is deterministic and calls no AI.
- **Token allowance.** With no limit stated by the caller, the output allowance is per task (`DEFAULT_OUTPUT_BY_TASK`: 32,768 for drafting, reasoning, coding and long context; 4,096 for quick tasks), bounded by the model's own reported limit (8,192 when the provider reports none) and by what is left of its context window after the prompt. Providers bill what is generated, so a roomy limit costs nothing for a short answer and lets long drafts and reasoning models finish. An answer cut off at the limit is continued up to twice (not when the caller asked for a short answer). Long Anthropic system prompts (about 1,000 tokens or more) are marked cacheable so repeated workspace calls cost a fraction of the input price; OpenAI-compatible and Gemini providers cache prefixes automatically.
- **User-supplied addresses.** `normalizeBaseUrl` (`src/platform/router/baseUrl.ts`) cleans what people paste (a full `/chat/completions` endpoint is cut back to its base, host lower-cased, slashes trimmed) and refuses http, credentials in the address, query strings and fragments, with a plain reason; AI Access shows "Your key will be sent only to <host>" before connecting. The server still screens every non-catalog address (`aiEndpointGuard`: https, public addresses only, connection pinned to the checked address, no redirects), including the model-list proxy `POST /api/ai-access/models`, which now lists through the guarded client (it used to fetch the typed address directly). Model lists larger than 4 MB are refused.
- **`POST /api/ai/verify`** (key in `x-ai-api-key`, never the body; 10 per minute per user) is what AI Access calls on connect: it lists the live models, sends a one-line test request through the same adapters Ask Scholar uses (trying the next best live model if one fails), and returns `{ ok, tested, options[], needsModel }`. A rejected key, an account with no credit and a provider with no model list each get their own message. If the server cannot be reached AI Access falls back to the browser's list-only check and says so.

`aiRouteDecorator` (in `routerBridge.ts`, mounted in `server.ts` on `/api/ai`, `/api/drafting`, `/api/projects/:id/{agent,agentic,assignment,thesis,proposal,presentation}` and `/api/presentations`) attaches an `aiRoute` summary (who answered, fallback/retry/limit notices, usage) to JSON responses; streaming callers forward the events live.

### 2.1 The unified endpoint

`POST /api/ai/run` (SSE) accepts `task` (`reasoning`, `drafting`, `coding`, `fast`, `vision`, `long-context`), `messages`, optional `tools`, token limits, temperature and `preferLane` (`auto`, `byok`, `premium`), and streams router events. `GET /api/ai/models` returns the curated live model list for the keys in the request. Keys arrive in `x-ai-keyring` (base64url JSON, at most 8 entries); a user-named base URL is screened by `server/src/ai/aiEndpointGuard.ts` (https, public addresses only, connection pinned).

### 2.2 Gateway and Warden

`src/platform/gateway/gateway.ts` is the single completion entry point (`complete`, `stream`, `completeWithFailover`, `streamWithFailover`); provider adapters live in `gateway/adapters.ts`. Before any request leaves, the Warden (`src/platform/warden/`) classifies content (`public`, `bibliographic`, `derived`, `user_content`, `restricted`) and applies the policy: public, bibliographic and derived are allowed, `user_content` asks once per provider and remembers consent, `restricted` is denied. Local requests are answered without a consent prompt. `src/platform/__tests__/architecture.test.ts` guards this boundary.

## 3. Two routers, two owners

| Router | File | Sees | Owner |
| :--- | :--- | :--- | :--- |
| User router | `server/src/aiEngine/userRouter.ts` | Only what the user configured: local runners, free-tier accounts, own keys (`user_ai_connections`), plus one opaque `premium` candidate when entitled | The user |
| Admin router | `server/src/aiEngine/adminRouter.ts` | The platform's resource pool (`ai_resources`: provider + model pairings with access type, cost, capabilities) and plan grants (`plan_resources`) | Administrators |

Both rank candidates with the pure function in `omniRouter.ts` (`selectProvider`; tiers `local`, `free`, `byok`, `premium`; task types `simple`, `multimodal`, `reasoning`, `coding`, `long-context`; a `no-cloud` privacy preference removes every non-local candidate). Premium is provider-agnostic: a plan grants a resource whose label is what the subscriber sees, so an admin can re-point it to another provider without any user change. The user-facing Premium catalogue returns labels and capabilities only.

Premium accounting (`server/src/ai/premium.ts`, `runPremium`): entitlement check, quota (`quotaEngine.ts`: plan defaults overlaid by `user_quota_overrides`; monthly, weekly, daily, per-task and concurrency limits), credit estimate (`creditPolicy.ts`: one credit is about 750 weighted tokens, output weighted 3x, minimum 1), atomic deduction in Postgres (`creditEngine.ts`, `deduct_credits` / `grant_credits`), provider failover, and a row in `ai_usage_ledger`. The client's `useEngine: "premium"` flag is a request, never a grant. Provider health is passive (`providerHealth.ts`, updated from real outcomes; an in-process failure counter resets on restart). `opportunityAgent.ts` is an admin-triggered research assistant that writes `ai_opportunities` rows for review.

Premium covers the manuscript and gate pipeline (`runPremium*` wrappers in `server/routes/project/core/projectHelpers.ts`, journal requirements in `server/routes/project.ts`) and Studio refine (`server/routes/studio.ts`). Other workspace routes use the request chain in section 2.

## 4. Providers and models

| Catalog | File | Contents |
| :--- | :--- | :--- |
| Cloud providers | `src/config/providerCatalog.ts` | 37 entries (`gemini`, `groq`, `cerebras`, `openrouter`, `mistral`, `zhipu`, `huggingface`, `cloudflare`, `together`, `fireworks`, `deepinfra`, `novita`, `hyperbolic`, `nebius`, `sambanova`, `chutes`, `ai21`, `moonshot`, `xai`, `deepseek`, `qwen`, `openai`, `claude`, `cohere`, `perplexity`, `nvidia`, `scaleway`, `nscale`, `inferencenet`, `arliai`, `upstage`, `stepfun`, `hunyuan`, `baseten`, `vercelgateway`, `minimax`, `featherless`) with API style, base URL, free-tier kind (`free`, `freemium`, `trial-credits`, `paid`) and direct-browser-call origins |
| Models | `src/config/modelCatalog.ts` | `MODEL_CATALOG` with capabilities, access mode (`free`, `premium`, `byok`, `local`), quality tier and status |
| Local runners | `src/config/localRunnerCatalog.ts` | `ollama`, `lmstudio`, `jan`, `localai`, `llamacpp`, `koboldcpp`, `vllm`, `textgenwebui`, `omniroute` |

`server.ts` also hosts a catalog-driven generic proxy for OpenAI-compatible providers; a client-supplied base URL is accepted only when it is https and resolves to a public host (needed for Cloudflare Workers AI, whose URL embeds an account id).

Database mirrors for the admin panel: `ai_providers`, `ai_models`, seeded by `npm run seed:ai-registry`.

## 5. AI Access (user surface)

`/ai-access` (`src/desk/aiAccess/AiAccessPage.tsx`) has four sections: Overview, Providers, Subscription, Preferences (legacy section ids `local`, `free`, `byok`, `premium`, `models`, `settings` are normalised to these). Server routes (`server/routes/aiAccess.ts`, mounted at `/api/ai-access`, all `requireAuth` and scoped to the caller's own rows): `GET /status`; connections (`POST /connections`, `DELETE /connections/:providerId`); `POST /models` (model discovery for a provider); saved keys (`GET /keys`, `GET /keys/sync`, `PUT /keys/:providerId`, `DELETE /keys/:providerId`, rate-limited and `no-store`); `POST /route` (the user router's decision); Premium (`GET /premium-catalog`, `GET /premium-plans`, and `GET`/`POST`/`DELETE /premium-request` for a subscription request). Hardware profiling (`hardware_profiles`) and local runner probing live in `src/services/hardwareProfiler.ts` and `localRunnerProbe.ts`.

## 6. Credentials

| Credential | Where it lives | Protection |
| :--- | :--- | :--- |
| User key for one request | Request headers only | In memory for the request; redacted in logs; rejected in request bodies |
| User key saved for device sync | `user_provider_keys` | Envelope encryption (per-key content key wrapped under `MASTER_KEY`, `userKeyVault.ts`); returned only to its owner, `no-store` |
| Legacy per-provider key store | `api_credentials` | `encrypted_api_key` plus hash |
| Platform (Premium) provider keys | `platform_provider_credentials` | Envelope encryption, `credentialVault.ts`; admin routes see metadata and masked previews only |
| Browser-run prompts | Challenge token | HMAC (`LLM_CHALLENGE_SECRET`, required in production) over user, route and prompt hash with expiry |

## 7. Search and research

- `POST /api/ai/search` (web search, `server/src/research/webSearchEngine.ts`), `POST /api/ai/deep-research` (`deepResearchEngine.ts`) and `POST /api/ai/agent` (Ask Scholar: grounded answer with retrieval, citation validation and lock) use `scholarBrain` through the router chain.
- Scholarly retrieval: `server/src/research/scholarlyRetrievalPipeline.ts`, `server/src/discovery/` (`liveSearch.ts`, `discovery.ts`, `blueprintScout.ts`), and the client-side `src/services/liveSearchService.ts`. Coursework source discovery runs in the browser through `src/desk/assignment/services/realScholarlyDiscoveryService.ts` (OpenAlex, Crossref, Semantic Scholar, DOAJ, DataCite, arXiv with `Promise.allSettled` and timeouts).
- Optional keys: `TAVILY_API_KEY`, `SERPER_API_KEY`, `BRAVE_SEARCH_API_KEY`, `OPENALEX_API_KEY`, `OPENALEX_MAILTO`. The `search-proxy` Edge Function restricts Tavily to basic and advanced search.

## 8. Multi-agent mesh and LangGraph

- `src/app/mesh/` is the agent registry and executor (`registry.ts`, `executor.ts`); four agents are registered by `registerBuiltinAgents()`: `ag14CitationManager`, `ag18ReadabilityAnalyst`, `ag25PrivacyGuard`, `ag26WorkflowCoordinator`. `GET /api/projects/:id/mesh/agents` lists them and `POST .../mesh/run` runs one.
- `server/services/briefScannerGraph.ts` is a LangGraph workflow for brief scanning.
- Journal peer review simulates referee lenses (`src/app/review/peerReview.ts`, `server/routes/project/agentic/reviewRoutes.ts`).

## 9. Offline scaffold

When every AI provider is out of credit, the coursework `/stream-section` route sends a labelled offline scaffold built only from the section prompt, key points and approved sources (`server/src/utils/sectionScaffold.ts`), and failed revisions never overwrite existing text.
