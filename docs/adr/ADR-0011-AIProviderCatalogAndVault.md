# ADR-0011: AI Provider Catalog, Encrypted Key Vault, and Classified Failover

## Status
Accepted (2026-07-31)

## Context

The AI configuration surface had accumulated three independent copies of the
same provider knowledge, and they had drifted apart:

1. `AI_PROVIDERS` in `src/services/aiGateway.ts` — UI metadata.
2. Nine hand-written adapters in the same file — request logic.
3. A chain of `if (aiProvider === "...")` blocks in `server.ts` — proxy logic,
   duplicated again between `/api/generate` and `/api/stream-generate`.

That drift produced real, user-visible failures rather than mere untidiness:

- **Qwen was completely unusable.** It had a client adapter and a streaming
  server branch, but nobody added the sixth near-identical block to
  `/api/generate`, so every non-streaming Qwen request returned
  `400 Unsupported provider: qwen` regardless of how valid the user's key was.
- **Bring-your-own-key Gemini was blocked in production.** Gemini is the one
  provider called directly from the browser, and its origin was missing from
  the CSP `connect-src` list — so supplying your own key broke it while
  leaving it blank worked, an inversion that made the cause very hard to see.
- **Cohere streaming ignored the server-stored-key fallback**, using the raw
  request body key where every other provider used `activeApiKey`.

Three further problems compounded these:

- **No error classification.** Every health check parsed the response body
  without ever checking `response.ok`, so a 401, a 429, and a 400 all surfaced
  as `"degraded — Unexpected response"` with the real message discarded.
- **Keys did not survive a reload.** The vault passphrase lived only in memory
  by design, so every page load relocked it and adapters then reported "no key
  configured" rather than "locked" — users experienced this as keys vanishing.
- **Fallback was undifferentiated.** A blanket `catch` retried an unusable key
  indefinitely and burned an attempt against every saved provider for requests
  that could not succeed anywhere.

## Decision

### One catalog, consumed by both client and server

`src/config/providerCatalog.ts` becomes the single source of truth for cloud
providers, and `src/config/localRunnerCatalog.ts` for local runners. Both are
pure data and pure functions with no browser globals and no Node built-ins, so
`server.ts` (bundled by esbuild) and the browser bundle import the same module.
Adding a provider is one entry in one file and requires no adapter and no
server change.

Since ~24 of 26 providers speak the OpenAI chat-completions dialect, one
generic adapter and one generic server branch serve nearly all of them.
Gemini, Anthropic and Cohere keep dedicated request mapping.

### Persistent encrypted vault with two honest unlock modes

`src/services/apiVault.ts` replaces per-provider ciphertext fields on the
project blob. There is a genuine tension between "never ask me again" and
"encrypted at rest" that no storage location resolves, so the choice is made
explicit:

- **Device mode (default)** — an AES-GCM-256 key generated with
  `extractable: false` and stored in IndexedDB. The vault opens with no
  prompt, and the raw key material cannot be read by any script, including an
  injected one. It does not protect against someone using that browser.
- **Passphrase mode** — key derived from a passphrase that is never stored.

Because a device key cannot be exported, an encrypted backup file (PBKDF2 →
AES-GCM under a separate recovery passphrase) is the recovery path, and the UI
prompts for one at the moment the first key is saved.

### Failover driven by error kind

`src/services/aiErrors.ts` classifies failures into actionable kinds carrying
`retryable` and `failoverWorthwhile` flags.
`src/services/providerFailover.ts` uses those flags: it retries the same
provider only when retrying can help, honours `Retry-After`, keeps a cooldown
so a rate-limited provider is skipped by the next task, and abandons the chain
immediately for request-shaped errors that would fail identically everywhere.

For streaming, text already emitted is preserved and handed to the replacement
provider as context with an instruction to continue from exactly that point.
Literal mid-stream continuation across providers is not possible — no provider
API accepts another model's half-finished sampling state — so this is the
achievable form of "no work lost", and it is described as such rather than
overclaimed.

## Consequences

**Positive**
- Provider count went from 12 to 26 cloud providers and 9 local runners while
  `aiGateway.ts` shrank by roughly 700 lines.
- The whole class of bug that broke Qwen is structurally impossible: both
  server endpoints and the client adapters derive from the same catalog.
- Users see "Invalid API key", "Rate limit exceeded" or "Blocked by the
  browser (CORS)" with a specific remedy instead of one generic message.
- Keys persist across reloads without ever being written in readable form.

**Negative / accepted trade-offs**
- Device mode trades protection-against-local-access for usability. This is
  stated on the screen where the choice is made, not buried in documentation.
- IndexedDB is a new persistence technology for this codebase; everything else
  uses `localStorage`. It is required because only IndexedDB can store a
  non-extractable `CryptoKey`.
- The catalog's model lists go stale as providers rotate model ids. Mitigated
  by treating them as suggestions, offering free-text model entry, and
  refreshing from the provider's own `/models` endpoint.
- A user-supplied base URL (needed for Cloudflare's account-scoped address)
  makes the proxy an SSRF surface. Mitigated by `isSafeOutboundBaseUrl`, which
  accepts only HTTPS URLs resolving to public hosts.

## Notes

`src/ai/` contains a parallel, more elaborate provider/router/local-AI
subsystem that is not reachable from the running app (it is imported only by
`src/research`, which nothing live imports). This ADR deliberately does not
wire it in: the live path is `aiModes.ts` + `aiGateway.ts`, and its
`HardwareProfiler` imports Node's `os` and `fs` and so cannot run in the
browser bundle as written. Its type shapes were used as a design reference.
