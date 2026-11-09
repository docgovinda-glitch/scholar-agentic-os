# AI Call Map

Where each model call enters the AI stack and where its credentials come from. Concepts are in [`AI-SYSTEM.md`](AI-SYSTEM.md). Re-derive this table with `grep` for `callOpenRouter`, `scholarBrain.`, `routedCompletion`, `routedText`, `completeWithFailover` and `runPremium` when you add a call site.

## 1. Layers

| Layer | File | Credentials | Behaviour |
| :--- | :--- | :--- | :--- |
| Gateway | `src/platform/gateway/gateway.ts` (`complete`, `stream`, `completeWithFailover`, `streamWithFailover`) | The `candidates` passed in | Provider adapters, failover, Warden egress check. The only sanctioned completion entry point |
| Router bridge | `server/src/ai/routerBridge.ts` (`routedText`, `routedCompletion`, `chainFor`, `aiAvailability`, `aiRouteDecorator`) | Premium resources, then `x-ai-keyring` / `x-ai-*` headers, then local model | One chain and one failover policy per request; emits routing events; `RouterHandoffError` for a browser hand-off; `NoAiConnectedError` when nothing is configured |
| llm helpers | `server/utils/llm.ts` (`callOpenRouterJSON`, `callOpenRouterText`, `streamOpenRouterJSON`) | `resolveClientAiConfig` (`server/src/ai/clientAiConfig.ts`): request headers only | Entitlement check, Warden consent, signed LLM challenge; routes through the router bridge; answers 426 with prompts when the browser must run them. Imported only by `scholarBrain.ts` |
| scholarBrain | `server/src/services/scholarBrain.ts` (wrappers `callOpenRouterJSON/Text`, `streamOpenRouterJSON`; `scholarBrain.complete/stream`) | Same headers, via `extractTransientClientAiConfig` | Scholarly voice, guardrails, JSON repair; `browserFallback: true` turns "no server-reachable AI" into a signed browser hand-off |
| Premium | `server/src/ai/premium.ts` `runPremium`, `server/src/aiEngine/*` | Platform credentials in `platform_provider_credentials` (`MASTER_KEY` envelope) | Entitlement, quota, credit deduction, failover, usage ledger |
| Browser runner | `src/desk/api/client.ts` `executeAgenticLLM` and the 426 handling in `authedStreamFetch` | The user's device-local keys or local model | Runs prompts the server returned, or that a stage builds itself |

A user's own key reaches the server only on AI routes (`routeUsesClientAi` in `src/desk/api/client.ts`).

## 2. Server call sites

| Route file | Layers used |
| :--- | :--- |
| `server/routes/aiRun.ts` | Router directly (`/api/ai/run`) with `x-ai-keyring` and optional Premium port |
| `server/routes/ai.ts` (Ask Scholar, search, deep research) | scholarBrain, `routedCompletion` |
| `server/routes/drafting.ts` | scholarBrain wrapper `callOpenRouterText` |
| `server/routes/project/agentic/evidenceRoutes.ts` | scholarBrain wrappers (JSON streams) |
| `server/routes/project/agentic/reviewRoutes.ts` | scholarBrain wrappers, `routedCompletion` |
| `server/routes/project/agentic/draftingRoutes.ts` | scholarBrain wrappers and `scholarBrain.*`, `routedCompletion` |
| `server/routes/project/agentic/blueprintRoutes.ts`, `citationSupportRoutes.ts`, `journalProfileRoutes.ts` | `routedCompletion` |
| `server/routes/project/assignment/*Routes.ts` and `helpers.ts` | scholarBrain wrappers, `scholarBrain.*`, gateway failover (`completeWithFailover`), `routedCompletion` |
| `server/routes/project/thesis.ts`, `proposal.ts`, `presentation.ts` | `scholarBrain.*` (thesis and proposal use `browserFallback: true`) |
| `server/routes/project/core/manuscriptAndGateRoutes.ts`, `core/projectHelpers.ts`, `server/routes/project.ts` | Premium (`runPremium*` wrappers over `runPremium`) or the user's connections via `server/src/ai/studioAi.ts` (`runWithUserAi`: live model, failover across connections; manuscript sections, coherence, peer review, cover letter, anonymization, journal requirements) |
| `server/routes/studio.ts` | Premium (`/api/studio/refine`) |
| `server/src/research/deepResearchEngine.ts`, `server/src/aiEngine/opportunityAgent.ts` | `routedCompletion` / router bridge |
| `server/services/briefScannerGraph.ts` | LangGraph workflow |

## 3. Browser call sites

| File | Layer |
| :--- | :--- |
| `src/desk/ProjectListScreen.tsx` (prompt bar) | `executeAgenticLLM` |
| `src/desk/assignment/services/sourceEvidenceExtractionService.ts` | `executeAgenticLLM` |
| `src/desk/regions/localStudioExecution.ts` | Gateway with a `local` tier request |
| `src/services/aiDiagnostics.ts` | Gateway directly |
| `src/app/**` (`manuscript/generate.ts`, `review/peerReview.ts`, `coherence/checkCoherence.ts`, `coverLetter/generateCoverLetter.ts`, `anonymization/proposeAnonymization.ts`, `journal/extract.ts`, `studio/studio.ts`) | Gateway (these engines are shared by the server's Premium and gate pipeline) |

## 4. Failure contract

- No credentials and no Premium: `NoAiConnectedError` ("Add your own AI key or a local model in AI Access"), surfaced through `server/src/ai/aiRouteErrors.ts` (`NoClientAiProviderError`).
- Next candidate is a model on the user's device and the server cannot reach it: browser hand-off (HTTP 426 `requireFrontendLLM` with prompts and a signed challenge, or `BrowserAiRequiredError` for scholarBrain routes with `browserFallback`). The browser result is accepted only with a valid challenge (`readVerifiedBrowserResult`).
- A user-named base URL that is not https or not public: `AiEndpointBlockedError`, candidate skipped with a reason.
- All candidates fail: `RouterExhaustedError` (`exhausted`, `context_overflow`, `non_retryable`).
- Coursework drafting when every provider is out of credit: labelled offline scaffold ([`AI-SYSTEM.md`](AI-SYSTEM.md) §9).

## 5. Known limits

- BYOK and local calls are not metered; only Premium writes `ai_usage_ledger` and credits.
- Prompts live inline in route and service files; there is no prompt registry.
- Premium covers the manuscript/gate pipeline and Studio refine, not every workspace.
