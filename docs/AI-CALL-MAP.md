# AI Call Map

Where each model call enters the AI stack and where its credentials come from. Concepts are in [`AI-SYSTEM.md`](AI-SYSTEM.md). Re-derive this table with `grep` for `callOpenRouter`, `scholarBrain.`, `routedCompletion`, `routedText`, `runPremium` when you add a call site.

## 1. Layers

| Layer | File | Credentials | Behaviour |
| :--- | :--- | :--- | :--- |
| Router | `src/platform/router/` (`route`, adapters, model listers, curation) | The candidates passed in | Provider adapters, retry, key and provider fallback, circuit breaker. The only place a provider is called |
| Router bridge | `server/src/ai/routerBridge.ts` (`routedText`, `routedResult`, `routedCompletion`, `chainFor`, `requestKeyring`, `aiRouteDecorator`) | `x-ai-keyring` header, plus the user's account keys (`accountAi.ts`), then local model | One chain and one failover policy per request |
| Completer | `src/platform/completion.ts`; server `server/src/ai/browserHandoff.ts` (`requestCompleter`); browser `src/desk/ai/completer.ts` | Same as the bridge | What `src/app/*` modules receive; hands a local-model step to the browser (426 plus `browserResults`) |
| llm helpers | `server/utils/llm.ts` (`callOpenRouterJSON`, `callOpenRouterText`, `streamOpenRouterJSON`) | Router bridge | Signed LLM challenge for browser hand-off; only `scholarBrain` imports them |
| scholarBrain | `server/src/services/scholarBrain.ts` | Router bridge | Scholarly voice, guardrails, JSON repair; `browserFallback` |
| Browser runner | `src/desk/api/client.ts` `executeAgenticLLM`, `src/desk/ai/aiRun.ts` | The user's device-local keys or local model | Runs prompts the server returned, or that a stage builds itself |

A user's own key reaches the server only on AI routes (`routeUsesClientAi` in `src/desk/api/client.ts`).

## 2. Server call sites

| Route file | Layers used |
| :--- | :--- |
| `server/routes/aiRun.ts` | Router directly (`/api/ai/run`, `/api/ai/models`, `/api/ai/verify`) with `x-ai-keyring` |
| `server/routes/ai.ts` (Ask Scholar, search, deep research) | scholarBrain, `routedCompletion` |
| `server/routes/drafting.ts`, `server/routes/project/agentic/*`, `server/routes/project/assignment/*`, `thesis.ts`, `proposal.ts`, `presentation.ts` | scholarBrain wrappers and `scholarBrain.*`, `routedCompletion` (Coursework prompt text: `scholarBrain.courseworkPrompts`, `server/src/services/prompts/courseworkPrompts.ts`) |
| `server/routes/project/core/manuscriptAndGateRoutes.ts`, `server/routes/project.ts`, `server/routes/studio.ts` | `requestCompleter` (`browserHandoff.ts`) |
| `server/src/research/deepResearchEngine.ts`, `server/src/aiEngine/opportunityAgent.ts` | `routedCompletion` / router bridge |
| `server/services/briefScannerGraph.ts` | LangGraph workflow |

## 3. Browser call sites

| File | Layer |
| :--- | :--- |
| `src/desk/ProjectListScreen.tsx` (prompt bar), `src/desk/assignment/services/sourceEvidenceExtractionService.ts` | `executeAgenticLLM` |
| `src/desk/regions/StudioPanel.tsx` | `refine` with `browserCompleter` |
| `src/desk/api/studioGenerationApi.ts` (`postAi`) | Server routes, running 426 hand-off prompts in the browser |

## 4. Failure contract

- No credentials: `NoAiConnectedError` ("Add your own AI key or a local model in AI Access"), surfaced through `server/src/ai/aiRouteErrors.ts` (`NoClientAiProviderError`).
- Next candidate is a model on the user's device and the server cannot reach it: browser hand-off (HTTP 426 `requireFrontendLLM` with prompts and a signed challenge, or `BrowserAiRequiredError` for scholarBrain routes with `browserFallback`). The browser result is accepted only with a valid challenge (`readVerifiedBrowserResult`).
- A user-named base URL that is not https or not public: `AiEndpointBlockedError`, candidate skipped with a reason.
- All candidates fail: `RouterExhaustedError` (`exhausted`, `context_overflow`, `non_retryable`).
- Coursework drafting when every provider is out of credit: labelled offline scaffold ([`AI-SYSTEM.md`](AI-SYSTEM.md) §9).

## 5. Known limits

- BYOK and local calls are not metered.
- Prompts live inline in route and service files; there is no prompt registry.
