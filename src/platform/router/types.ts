/** Shared types for the AI router. Both execution sites (server, browser) speak this protocol. */

export type ProviderId =
  | "openai" | "anthropic" | "google" | "groq" | "deepseek" | "mistral"
  | "ollama" | "lmstudio" | "webllm"
  /** Any OpenAI-compatible endpoint the user names (base URL required). */
  | "custom";

/** Who pays and where the call runs. */
export type Lane = "byok" | "local";

export interface Candidate {
  /** Stable id for the breaker and the trace, e.g. "byok:anthropic:claude-x". */
  id: string;
  /**
   * The connection this candidate belongs to (catalog provider id, e.g.
   * "openrouter"). Candidates of one group share a key, a quota and an outage,
   * so a provider-wide failure skips the rest of the group.
   */
  group?: string;
  lane: Lane;
  provider: ProviderId;
  model: string;
  /** Display name shown in the UI ("Claude … via your key"). */
  label: string;
  contextWindow: number;
  maxOutputTokens: number;
  /** Local candidates run in the browser; the server hands them off. */
  runsIn: "server" | "browser";
  /** Resolved per request; never logged. Absent for local runners. */
  credential?: { apiKey?: string; baseUrl?: string };
}

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[];
  toolCallId?: string;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data: string };

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

export interface RouteRequest {
  requestId: string;
  task: TaskClass;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** Output the caller wants; the router clamps it to what fits. */
  desiredOutputTokens: number;
  /** Smallest useful answer; below this a candidate is skipped, not truncated. */
  minOutputTokens: number;
  temperature?: number;
}

export type TaskClass = "reasoning" | "drafting" | "coding" | "fast" | "vision" | "long-context";

/** What an adapter yields while streaming. */
export type AdapterChunk =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; argumentsJson: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "finish"; reason: "stop" | "length" | "tool_calls" | "content_filter" };

export interface ProviderAdapter {
  stream(c: Candidate, req: RouteRequest, maxOutputTokens: number, signal: AbortSignal): AsyncIterable<AdapterChunk>;
}

export type FailureKind =
  | "rate_limit" | "quota" | "server" | "overloaded" | "timeout_first_token" | "timeout_idle"
  | "network" | "auth" | "invalid_request" | "context_overflow" | "content_filter" | "aborted"
  /** The provider no longer serves this model (retired, renamed, not on this key). */
  | "model_unavailable"
  /** The stream ended without any text (e.g. a reasoning model spent its whole output limit thinking). */
  | "empty_output";

export interface Failure {
  kind: FailureKind;
  httpStatus?: number;
  message: string;
  retryable: boolean;
  /** Worth trying another candidate (false for e.g. invalid_request or content_filter). */
  fallbackWorthy: boolean;
  retryAfterMs?: number;
}

/** The single event stream the UI renders. Every state change is one event. */
export type RouterEvent =
  | { type: "route_start"; requestId: string; chain: Array<Pick<Candidate, "id" | "label" | "lane">> }
  | { type: "candidate_skipped"; candidateId: string; label: string; reason: "circuit_open" | "context_too_small" | "no_credential" | "endpoint_blocked"; detail: string }
  | { type: "attempt_start"; candidateId: string; label: string; lane: Lane; attempt: number; maxOutputTokens: number }
  | { type: "limit_warning"; candidateId: string; promptTokens: number; contextWindow: number; usedRatio: number; outputClampedTo: number }
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; argumentsJson: string }
  | { type: "metrics"; candidateId: string; ttftMs: number; tokensPerSecond: number; outputTokens: number }
  | { type: "retry"; candidateId: string; attempt: number; maxAttempts: number; waitMs: number; reason: FailureKind; message: string }
  | { type: "fallback"; from: string; fromLabel: string; to: string; toLabel: string; reason: FailureKind; httpStatus?: number; message: string; partialOutputDiscarded: boolean }
  | { type: "handoff"; to: string; label: string; reason: string }
  | { type: "done"; candidateId: string; label: string; lane: Lane; finishReason: string; usage: Usage; trace: AttemptTrace[] }
  | { type: "error"; code: "context_overflow" | "exhausted" | "non_retryable"; message: string; trace: AttemptTrace[] }
  | { type: "cancelled"; candidateId?: string; outputTokensSoFar: number };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** "provider" when the API reported it, "estimate" otherwise. */
  source: "provider" | "estimate";
}

export interface AttemptTrace {
  candidateId: string;
  attempt: number;
  startedAt: number;
  durationMs: number;
  outcome: "success" | FailureKind | "skipped";
  httpStatus?: number;
}
