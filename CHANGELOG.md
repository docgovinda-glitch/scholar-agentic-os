# CHANGELOG - Scholar Agentic Operating System

## Unreleased — AI Configuration redesign (2026-07-31)

### Fixed — connection failures

- **Qwen was unusable.** `/api/generate` had no `qwen` branch, so every
  non-streaming Qwen request returned `400 Unsupported provider: qwen`
  regardless of key validity, while `/api/stream-generate` handled it fine.
  Verified fixed against the live DashScope API (now returns a real 401 for a
  bad key instead of never leaving the server).
- **Bring-your-own-key Gemini was CSP-blocked in production.** Gemini is the
  only provider called directly from the browser, and
  `generativelanguage.googleapis.com` was missing from `connect-src` — so
  supplying your own key failed while leaving it blank worked.
- **Cohere streaming ignored the server-stored-key fallback**, using the raw
  request-body key instead of `activeApiKey` like every other provider.
- **Health checks never inspected `response.ok`**, flattening 401/429/400 into
  a single `"degraded — Unexpected response"` with the real message discarded.

### Added

- **26 cloud providers** (was 12) in the new `src/config/providerCatalog.ts`,
  a single source of truth shared by the browser bundle and `server.ts`. Adding
  a provider is now one entry and needs no adapter or server change.
  GitHub Models was researched and deliberately excluded — a live probe found
  it returning HTTP 410 `github_models_retirement_brownout`.
- **9 local runners** (`src/config/localRunnerCatalog.ts`): Ollama, LM Studio,
  Jan.ai, LocalAI, llama.cpp server, KoboldCPP, vLLM, Text Generation WebUI,
  OmniRoute — each with real install steps and runner-specific CORS guidance,
  which is the usual reason local AI appears not to connect.
- **Persistent encrypted API vault** (`src/services/apiVault.ts`) with two
  unlock modes: device (a non-extractable AES-GCM key in IndexedDB — opens
  with no prompt, unreadable by any script) or passphrase (never stored).
  Includes encrypted backup export/import for recovery.
- **Classified errors** (`src/services/aiErrors.ts`) reporting "Invalid API
  key", "Rate limit exceeded", "Quota exhausted" or "Blocked by the browser
  (CORS)" with a specific remedy. A `no-cors` probe definitively distinguishes
  a CORS refusal from an unreachable server.
- **Automatic failover** (`src/services/providerFailover.ts`) driven by error
  kind, honouring `Retry-After`, with per-provider cooldowns. Streaming keeps
  already-emitted text and asks the replacement provider to continue from it.
- **Hardware pre-check** (`src/services/hardwareProfile.ts` +
  `src/config/localModelCatalog.ts`) recommending local models against real
  memory limits, and stating plainly what a browser cannot detect
  (`navigator.deviceMemory` caps at 8 GB; video memory is undetectable).
- **Live "Test connection"** (`src/services/connectionTester.ts`) performing a
  real generation, then reporting a precise diagnosis and the models the key
  can actually use.

### Changed

- The five AI-mode cards became an accordion (`AIModeAccordion.tsx`). They
  previously collapsed to a single column of full-height cards below `md`, so
  a phone user scrolled five tall cards before reaching anything else.
- Smart Gateway and Local AI are no longer rendered below desktop — they
  require running a server program locally, which a phone cannot do. Mobile
  gets an honest on-device-AI explanation instead of a control that cannot work.
- The API Keys tab manages every catalogued provider. It previously listed six
  hardcoded providers, so Groq/Together/OpenRouter keys chosen during
  onboarding could never afterwards be viewed, retested or corrected.
- `aiGateway.ts` lost ~700 lines of duplicated adapters in favour of two
  factories driven by the catalogs. Legacy `AISettings.<provider>ApiKey`
  ciphertext still resolves, so no user migration is required.

### Security

- `isSafeOutboundBaseUrl` in `server.ts` restricts the user-supplied base URL
  (needed for Cloudflare's account-scoped address) to HTTPS public hosts,
  closing the SSRF surface that a free-form proxy target would otherwise open.

See `docs/adr/ADR-0011-AIProviderCatalogAndVault.md` for the full rationale.


## v1.0.0 - LTS Release

### Operating Systems

#### AI Operating System
- Multi-provider AI abstraction layer
- Provider support: OpenAI, Anthropic, Gemini, Ollama, LM Studio
- AIRouter with fallback, caching, telemetry
- ModelRegistry, TaskRouter, PolicyEngine

#### Knowledge Operating System
- KnowledgeKernel with storage interfaces
- KnowledgeRegistry for object management
- KnowledgeGraph for relationship management
- SemanticMemory for vector search
- KQL (Knowledge Query Language)
- ReasoningEngine with deductive/inductive/abductive reasoning

#### Writing Operating System
- WritingKernel for manuscript generation
- Outline generation with templates
- Section planning support

#### Publication Operating System
- PublicationKernel for journal management
- Journal metadata and recommendations
- Impact factor-based ranking

#### Workspace Operating System
- WorkspaceKernel for project management
- Multi-project support
- Lifecycle management

#### Collaboration Operating System
- CollaborationKernel for team management
- Team creation and membership
- User role management

### Architecture
- Clean Architecture compliant
- Kernel-based design
- Dependency Injection
- Event-driven ready

### Testing
- 330 automated tests passing (18 test files)
- Unit tests for all kernels
- Integration tests for OS modules

### Note
- Only the AI kernel (`src/ai`) is currently consumed outside its own module (by `src/research`); the other OS kernels, the orchestrator, and the agents are implemented and tested but not yet wired into `server.ts` or the React app. See `.claude/HANDOVER.md` §0.

### Documentation
- 5 Architecture Documents
- 10 Architecture Decision Records
- Developer Handbook
- API Reference Documentation