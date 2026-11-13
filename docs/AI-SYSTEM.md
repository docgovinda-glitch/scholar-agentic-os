# AI System

How AI requests are authored, routed, paid for and kept safe. Entry layers and call sites are in [`AI-CALL-MAP.md`](AI-CALL-MAP.md).

## 1. One brain

`server/src/services/scholarBrain.ts` is the only AI brain for every workspace. Only it imports `server/utils/llm.ts`. Routes and services call the logged wrappers it exports (`callOpenRouterJSON`, `callOpenRouterText`, `streamOpenRouterJSON`) or methods on the `scholarBrain` object. New AI capability means a new method there. The rules and the permanently banned artefacts (Quantum literature catalog, Zappos/Schein outline, keyword-to-framework tables) are in `CLAUDE.md` and are enforced by `src/__tests__/singleBrainGuardian.test.ts`.

`scholarBrain` provides:

| Method | Purpose |
| :--- | :--- |
| `complete`, `stream` | Routed completion with scholarly voice prompt, guardrails and JSON repair; `browserFallback: true` makes it answer with a browser hand-off when the user's only AI is local |
| `callJSON`, `callText`, `streamJSON` | Wrappers over the llm helpers |
| `readVerifiedBrowserResult` | Verifies a result the browser produced for a hand-off prompt |
| `signLlmChallenge`, `computePromptHash` | Signed challenge for prompts that the browser runs and returns |
| `generateGeminiEmbedding` | Embeddings for semantic RAG |
| `retrieveEvidence` | Live scholarly discovery (OpenAlex, Crossref, EuropePMC/PubMed, arXiv) plus Vault and uploaded datasets |
| `scrubAndFormatCitations` | Citation-lock scrub: removes unverified author-year strings and formats verified `[CITE:id]` tokens in the requested style (`apa7`, `harvard`, `ieee`, `chicago`, `mla9`, `vancouver`, `oscola`) |
| `enforceScholarlyVoice` | British orthography, cliché suppression, burstiness check |
| `allocateWordsByMarks`, `parseQuestionMarks` | Marks-weighted word allocation |
| `formatCitationLedger`, `validatePreflightMesh` | Citation ledger and agent-mesh preflight |

Supporting modules: `server/src/services/semanticRagEngine.ts` (chunk and rerank evidence), `server/src/utils/citationLockScrubber.ts`, `scholarlyVoiceGuard.ts`, `wordBudgetAllocator.ts`, `sectionBudget.ts`, `sectionScaffold.ts`, `src/shared/scholarGuardrails.ts`, `src/shared/llmJsonParser.ts`.

## 2. Request chain

Every server-side model call is resolved by the router bridge (`server/src/ai/routerBridge.ts`) over the router in `src/platform/router/router.ts`. Per request the chain is:

1. the user's own keys, in the order they sent them (`x-ai-keyring` header) plus any saved to their account that the request did not send; a provider can hold a main key and up to two backup keys, each its own candidate (`slot`, see `src/config/keySlots.ts`), so a spent key hands over to the next;
2. the user's local model.

Candidates carry a lane (`byok`, `local`) and a `runsIn` site (`server` or `browser`). A provider failure moves to the next candidate with a visible event; the request is handed to the browser (HTTP 426 with the prompts, or the `aiRoute` events) only when the next candidate really is a local model. A deployed server cannot reach a model on the user's machine; only a development server, or one with `ALLOW_SERVER_LOCAL_AI=true`, calls local runners itself.

Router behaviour (`src/platform/router/`): per-candidate circuit breaker (closed, open, half-open with doubling cooldown), bounded retry with backoff (`maxAttempts: 2` by default), first-token timeout 25 s and idle timeout 20 s, token-budget preflight, and a trace of attempts. Router provider ids: `openai`, `anthropic`, `google`, `groq`, `deepseek`, `mistral`, `ollama`, `lmstudio`, `webllm`, `custom`.

### 2.0 Every catalog provider, live models, failover

- **All 37 catalog providers work.** `src/platform/router/providerMap.ts` (`resolveRouterTarget`) maps a catalog id to the wire protocol: Gemini, Claude, OpenAI, Groq, DeepSeek and Mistral are native; every other OpenAI-compatible catalog entry (and Cohere, via its compatibility endpoint) runs as `custom` on the catalog's `baseUrl`. A keyring entry carries `via` (the catalog id) so two `custom` providers never share a breaker, cache entry or candidate id. Cloudflare needs the user's own address and is left out until it has one. The catalog hosts are allowed by `aiEndpointGuard`; any other address is screened as before.
- **No model name is assumed anywhere on the server.** A keyring entry's `model` is an id or `"auto"` (`"auto"` is what a connection with no chosen model means). `server/src/ai/liveModels.ts` fetches the provider's own model list (`listModelsFor`, cached 6 h; failures cached 2 min), keeps the saved model only while the provider still lists it, replaces a missing/`auto`/retired one with the live recommendation (`recommendModels`, `src/platform/router/modelRecommendation.ts`: newest balanced-tier model, plus the most capable and the fastest, each with a reason), and adds up to two live alternates from the same connection. A model the provider reports gone (404/410 or "model not found") is quarantined for 30 minutes. Providers that publish no list (Qwen, Zhipu, AI21, Perplexity, Cloudflare) skip an `auto` entry with a message asking for a model; a named model is trusted. Output limits come from the provider's list when it reports one, otherwise 8,192 tokens.
- **Failover strategy** (retry, then fall back; honour `Retry-After`; per-candidate circuit breaker; fall back only on failures another model can fix; ordered fallbacks with separate quota pools; a total time budget):
  - a failed model moves to the **next model of the same connection** first for per-model failures (`rate_limit`, `server`, `overloaded`, `timeout_*`, `model_unavailable`, `empty_output`, `context_overflow`), because providers meter and fail per model;
  - an **account-wide** failure (`quota`, `auth`, `network`) skips the rest of that connection and goes to the next provider;
  - a stream that ends **without text** is a failure (`empty_output`; e.g. a reasoning model that spent its whole output limit thinking), never an answer, in the router;
  - bad requests and content-filter blocks do not fall back; the chain stops after `maxTotalMs` (150 s) of trying; every switch is a visible `fallback` event.
- **Same connections on every device.** The browser attaches this device's keys to each AI request, and the server adds the signed-in person's own account connections they do not cover (`server/src/ai/accountAi.ts`: their saved keys from `user_provider_keys`, decrypted under `MASTER_KEY` for that request only, plus their default provider and chosen models from `user_ai_settings`; held in memory for 60 s, cleared when keys change, never logged or returned). So a new browser or phone works on its first request after sign-in, before its own key sync runs. Browser and server build the keyring with the same pure function (`src/platform/router/keyringAssemble.ts`).
- **All workspaces share this chain.** Ask Scholar, Coursework, Proposal, Thesis and Presentation call `scholarBrain` → `routedText`. The Journal Writer (manuscript sections, coherence check, peer review, cover letter, anonymisation, journal requirements: `src/app/*`) and Studio refine take a `Completer` (`src/platform/completion.ts`): the server builds it in `server/src/ai/browserHandoff.ts` over the same chain, the browser in `src/desk/ai/completer.ts`. When the user's next model is local, the route answers 426 with the exact prompt and a signed challenge, the browser runs it and re-sends the request with `browserResults`; a feature with several model calls takes one round trip per call.
- **Token allowance.** With no limit stated by the caller, the output allowance is per task (`DEFAULT_OUTPUT_BY_TASK`: 32,768 for drafting, reasoning, coding and long context; 4,096 for quick tasks), bounded by the model's own reported limit (8,192 when the provider reports none) and by what is left of its context window after the prompt. Providers bill what is generated, so a roomy limit costs nothing for a short answer and lets long drafts and reasoning models finish. An answer cut off at the limit is continued up to twice (not when the caller asked for a short answer). Long Anthropic system prompts (about 1,000 tokens or more) are marked cacheable so repeated workspace calls cost a fraction of the input price; OpenAI-compatible and Gemini providers cache prefixes automatically.
- **User-supplied addresses.** `normalizeBaseUrl` (`src/platform/router/baseUrl.ts`) cleans what people paste (a full `/chat/completions` endpoint is cut back to its base, host lower-cased, slashes trimmed) and refuses http, credentials in the address, query strings and fragments, with a plain reason; AI Access shows "Your key will be sent only to <host>" before connecting. The server still screens every non-catalog address (`aiEndpointGuard`: https, public addresses only, connection pinned to the checked address, no redirects), including the model-list proxy `POST /api/ai-access/models`, which now lists through the guarded client (it used to fetch the typed address directly). Model lists larger than 4 MB are refused.
- **`POST /api/ai/verify`** (key in `x-ai-api-key`, never the body; 10 per minute per user) is what AI Access calls on connect: it lists the live models, sends a one-line test request through the same adapters Ask Scholar uses (trying the next best live model if one fails), and returns `{ ok, tested, options[], needsModel }`. A rejected key, an account with no credit and a provider with no model list each get their own message. If the server cannot be reached AI Access falls back to the browser's list-only check and says so.

`aiRouteDecorator` (in `routerBridge.ts`, mounted in `server.ts` on `/api/ai`, `/api/drafting`, `/api/projects/:id/{agent,agentic,assignment,thesis,proposal,presentation}` and `/api/presentations`) attaches an `aiRoute` summary (who answered, fallback/retry/limit notices, usage) to JSON responses; streaming callers forward the events live.

### 2.1 The unified endpoint

`POST /api/ai/run` (SSE) accepts `task` (`reasoning`, `drafting`, `coding`, `fast`, `vision`, `long-context`), `messages`, optional `tools`, token limits and temperature, and streams router events. `GET /api/ai/models` returns the curated live model list for the keys in the request. Keys arrive in `x-ai-keyring` (base64url JSON, at most 8 entries); a user-named base URL is screened by `server/src/ai/aiEndpointGuard.ts` (https, public addresses only, connection pinned).

### 2.2 Completer and browser hand-off

`src/platform/completion.ts` defines `Completer`, the one way application modules ask a model for text; they never name a provider or hold a key. There is no consent prompt: connecting a key or local model is the user's choice to send their text there. `CompletionInterrupted` (no AI connected, browser hand-off) ends a multi-call operation instead of counting as one failed pass.

## 3. Premium

Premium (a platform-managed AI service) is not available: AI Access supports **Local** and **BYOK** only, and the UI shows Premium as "Coming soon". There is no Premium code, table or route; it will be designed again if it returns.

## 4. Providers and models

| Catalog | File | Contents |
| :--- | :--- | :--- |
| Cloud providers | `src/config/providerCatalog.ts` | 37 entries (`gemini`, `groq`, `cerebras`, `openrouter`, `mistral`, `zhipu`, `huggingface`, `cloudflare`, `together`, `fireworks`, `deepinfra`, `novita`, `hyperbolic`, `nebius`, `sambanova`, `chutes`, `ai21`, `moonshot`, `xai`, `deepseek`, `qwen`, `openai`, `claude`, `cohere`, `perplexity`, `nvidia`, `scaleway`, `nscale`, `inferencenet`, `arliai`, `upstage`, `stepfun`, `hunyuan`, `baseten`, `vercelgateway`, `minimax`, `featherless`) with API style, base URL, free-tier kind (`free`, `freemium`, `trial-credits`, `paid`) and direct-browser-call origins |
| Local runners | `src/config/localRunnerCatalog.ts` | `ollama`, `lmstudio`, `jan`, `localai`, `llamacpp`, `koboldcpp`, `vllm`, `textgenwebui`, `omniroute` |

Model names are never listed in code: they come live from the provider (`GET /api/ai/models`, curated by `src/platform/router/modelCuration.ts`; `AiModelSwitcher` in every workspace header recommends per workspace from provider-reported tier and context size).

## 5. AI Access (user surface)

`/ai-access` (`src/desk/aiAccess/AiAccessPage.tsx`) has four sections: Overview, Providers, Premium ("Coming soon") and Preferences (legacy section ids are normalised). Connecting a provider needs only a key: the server lists the live models, tests one and recommends what answered (`POST /api/ai/verify`); a provider page also holds up to two backup keys. Server routes (`server/routes/aiAccess.ts`, `/api/ai-access`, `requireAuth`, caller's own rows only): `GET /status`; `POST /connections` (tier `local` or `byok`), `DELETE /connections/:providerId`; saved keys `GET /keys`, `GET /keys/sync`, `PUT`/`DELETE /keys/:keyId` (a key id is a provider id, or `provider#2` / `#3` for a backup). The model switcher shows which model answered the last step and flags a backup answer.

## 6. Credentials

| Credential | Where it lives | Protection |
| :--- | :--- | :--- |
| User key for one request | Request headers only | In memory for the request; redacted in logs; rejected in request bodies |
| User key saved for device sync | `user_provider_keys` | Envelope encryption (per-key content key wrapped under `MASTER_KEY`, `userKeyVault.ts`); returned only to its owner, `no-store` |
| Legacy per-provider key store | `api_credentials` | `encrypted_api_key` plus hash |
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

Coursework drafting never writes `[Unverified Claim]` tags: the citation scrubber removes unmatched citations silently. When every AI provider is out of credit, the coursework `/stream-section` route sends a labelled offline scaffold built only from the section prompt, key points and approved sources (`server/src/utils/sectionScaffold.ts`), and failed revisions never overwrite existing text.

Provider errors: a numeric error code (Google sends `{"code": 429, "status": "RESOURCE_EXHAUSTED"}`) is kept as its string status and never crashes `classify`. A 429 that names a per-minute/per-day/free-tier window or a retry delay is a per-model `rate_limit` (the router tries the same key's next model; "Please retry in 41.9s" sets `retryAfterMs`), even when the provider words it "You exceeded your current quota"; only real credit signals (`insufficient_quota`, credit balance, payment required) are connection-wide `quota`.

