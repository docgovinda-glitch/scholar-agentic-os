import { completeWithFailover, streamWithFailover, type CandidateProvider } from "../../platform/gateway/gateway";
import { defaultPolicy, recordConsent } from "../../platform/warden/warden";
import { readProviderKey, providersWithStoredKey } from "../../services/userAiSettings";
import { resolveClientCandidates } from "../../services/clientRouter";
import { getCloudProvider } from "../../config/providerCatalog";
import { startExecutionScope, updateExecutionScope, endExecutionScope } from "../../services/executionState";
import type { FailoverEvent } from "../../services/providerFailover";
import {
  getLiveSearchGroundingEnabled,
  executeLiveSearch,
  injectLiveGroundingToSystemPrompt,
} from "../../services/liveSearchService";
import { scholarGuardrails } from "../../shared/scholarGuardrails";
import { routeDecision, type RoutingTaskType } from "../aiAccess/aiAccessApi";
import type {
  InterventionLevel,
  JournalRequirementsProposal,
  StudioRefineResult,
  VoiceProfile,
} from "../types";
import { authedFetch, authedJsonFetch, json } from "./httpClient";

let activeManualModelOverride: { providerId: string; modelId?: string } | null = null;

export function setGlobalManualModelOverride(override: { providerId: string; modelId?: string } | null): void {
  activeManualModelOverride = override;
}

/**
 * Maps the routing task type (user-facing) to the Warden's task class
 * (egress-policy dimension). Mirrors the same mapping in server/routes/ai.ts
 * (`taskTypeToTaskClass`) so client-side and server-side calls agree on what
 * class a given task belongs to.
 */
function routingTaskTypeToTaskClass(taskType: RoutingTaskType): "drafting" | "refinement" | "chat" | "summarisation" | "verification" | "rule_extraction" | "discovery" | "embedding" | "classification" {
  switch (taskType) {
    case "simple":       return "chat";
    case "reasoning":    return "verification";
    case "coding":       return "drafting";
    case "long-context": return "summarisation";
    case "multimodal":   return "drafting";
    default:             return "chat";
  }
}

export async function executeAgenticLLM(
  systemPrompt: string,
  userPrompt: string,
  taskType: RoutingTaskType = "reasoning",
  onChunk?: (chunk: string) => void,
  onFailoverEvent?: (event: FailoverEvent) => void
): Promise<string> {
  // If Live Web Search Grounding is enabled, inject fresh live snippets unless already present
  let effectiveSystemPrompt = systemPrompt;
  if (
    getLiveSearchGroundingEnabled() &&
    !systemPrompt.includes("[Live Web Grounding Context") &&
    !userPrompt.includes("[Live Web Grounding Context")
  ) {
    try {
      const searchResults = await executeLiveSearch(userPrompt, { limit: 5 });
      if (searchResults.length > 0) {
        effectiveSystemPrompt = injectLiveGroundingToSystemPrompt(systemPrompt, searchResults);
      }
    } catch {
      // Non-blocking failover to standard generation
    }
  }

  // 1. Resolve candidates client-side first using policy-driven client router
  const clientDecision = await resolveClientCandidates(taskType, {
    manualOverride: activeManualModelOverride,
  }).catch(() => null);

  let candidates: CandidateProvider[] = [];

  if (clientDecision && clientDecision.ok && clientDecision.allCandidates.length > 0) {
    candidates = clientDecision.allCandidates.map((c) => ({
      provider: c.provider,
      model: c.model,
      apiKey: c.apiKey,
    }));
  } else {
    // Fallback: check server preview if client resolution had 0 candidates
    const decision = await routeDecision(taskType).catch(() => null);
    if (decision && decision.ok) {
      const choices = [decision.choice, ...decision.fallbacks];
      for (const c of choices) {
        if (c.tier === "premium") continue;
        if (c.tier === "byok" || c.tier === "free") {
          const key = await readProviderKey(c.providerId);
          if (key) candidates.push({ provider: c.providerId, model: c.modelId, apiKey: key });
        } else if (c.tier === "local") {
          candidates.push({ provider: c.providerId, model: c.modelId, apiKey: "local-no-credential-required" });
        }
      }
    }
  }

  if (activeManualModelOverride) {
    const key = await readProviderKey(activeManualModelOverride.providerId);
    if (key && !candidates.some((c) => c.provider === activeManualModelOverride!.providerId)) {
      candidates.unshift({
        provider: activeManualModelOverride.providerId,
        model: activeManualModelOverride.modelId,
        apiKey: key,
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      clientDecision?.reasoning ||
      "No active AI credentials or local runners are configured on this device. Please connect an API key or local runner in AI Access."
    );
  }

  const taskClass = routingTaskTypeToTaskClass(taskType);
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const initialCandidate = candidates[0];
  const initialSpec = getCloudProvider(initialCandidate.provider);
  startExecutionScope(
    executionId,
    initialCandidate.provider,
    initialSpec?.name || initialCandidate.provider,
    initialCandidate.model
  );

  const handleFailoverEvent = (event: FailoverEvent) => {
    if (event.type === "switch") {
      const rawId = event.providerId || "";
      const [provId, modId] = rawId.split("::");
      const nextCandidate = candidates.find(
        (c) =>
          c.provider === rawId ||
          c.provider === provId ||
          `${c.provider}::${c.model || "default"}` === `${provId}::${modId}`
      );
      const targetProvider = nextCandidate?.provider || provId || rawId;
      const targetModel = nextCandidate?.model || (modId && modId !== "default" ? modId : undefined);
      const spec = getCloudProvider(targetProvider);
      updateExecutionScope(executionId, {
        providerId: targetProvider,
        activeProvider: targetProvider,
        providerName: spec?.name || targetProvider,
        modelId: targetModel,
        activeModel: targetModel,
        isFallback: true,
        status: "fallback",
        message: event.userMessage,
      });
    } else if (event.type === "success") {
      updateExecutionScope(executionId, {
        status: "executing",
        message: event.userMessage,
      });
    }
    onFailoverEvent?.(event);
  };

  // Use completeWithFailover from the gateway
  const req = {
    systemPrompt: effectiveSystemPrompt,
    userPrompt,
    taskClass,
    local: candidates[0].apiKey === "local-no-credential-required",
    caching: taskType === "long-context",
    segments: [],
  };

  // Consent is inherent to user-configured BYOK providers
  let policy = defaultPolicy();
  for (const c of candidates) {
    if (c.apiKey) {
      policy = recordConsent(policy, c.provider);
    }
  }

  try {
    if (onChunk) {
      let full = "";
      const result = await streamWithFailover(
        req,
        (chunk) => {
          full += chunk;
          onChunk(chunk);
        },
        {
          candidates,
          onEvent: handleFailoverEvent,
          operationId: executionId,
          stageId: taskType,
        },
        policy
      );
      if (!result.ok) {
        const errObj = "error" in result ? (result as { error?: { message?: string } }).error : undefined;
        const errMsg = errObj?.message || "AI generation is temporarily unavailable.";
        endExecutionScope(executionId, "error", errMsg);
        throw new Error(errMsg);
      }
      endExecutionScope(executionId, "success");
      const normalizedFull = scholarGuardrails.enforceScholarlyVoice(full);
      return scholarGuardrails.scrubAndFormatCitations(normalizedFull);
    } else {
      const result = await completeWithFailover(
        req,
        {
          candidates,
          onEvent: handleFailoverEvent,
          operationId: executionId,
          stageId: taskType,
        },
        policy
      );
      if (!result.ok) {
        const errObj = "error" in result ? (result as { error?: { message?: string } }).error : undefined;
        const errMsg = errObj?.message || "AI generation is temporarily unavailable.";
        endExecutionScope(executionId, "error", errMsg);
        throw new Error(errMsg);
      }
      endExecutionScope(executionId, "success");
      const rawText = typeof result.value === "string" ? result.value : result.value.text;
      const normalizedText = scholarGuardrails.enforceScholarlyVoice(rawText);
      return scholarGuardrails.scrubAndFormatCitations(normalizedText);
    }
  } catch (err) {
    endExecutionScope(executionId, "error", (err as Error).message);
    throw err;
  }
}

/** Thrown when the Warden hasn't seen consent for this (session, provider) pair yet — recoverable by calling grantStudioConsent() then retrying. */
export class StudioConsentRequiredError extends Error {
  readonly kind = "consent_required" as const;
  constructor(reason: string, public readonly provider?: string) {
    super(reason);
    this.name = "StudioConsentRequiredError";
  }
}

/** Thrown on a hard Warden deny (e.g. restricted content) — not recoverable by retrying. */
export class StudioDeniedError extends Error {
  readonly kind = "denied" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "StudioDeniedError";
  }
}

/**
 * Thrown when the Scholar AI Engine (server-side Omni Router) has no
 * eligible AI source for this request — Premium quota exhausted with
 * nothing else connected, or no source at all. `reason` is the router's own
 * human-readable explanation (server/src/aiEngine/omniRouter.ts), safe to
 * show directly — see Priority 4/6 of the AI Engine live-wiring work.
 */
export class StudioNoAiSourceError extends Error {
  readonly kind = "no_ai_source" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "StudioNoAiSourceError";
  }
}

export async function refinePassage(params: {
  sessionId: string;
  passageId: string;
  text: string;
  level: InterventionLevel;
  l1?: string;
  voiceProfile?: VoiceProfile;
  provider?: string;
  model?: string;
  /** Setting this to "premium" asks the server to route via the Scholar AI Engine using the caller's own entitlement/quota — always re-verified server-side. */
  useEngine?: "premium";
}): Promise<StudioRefineResult> {
  const res = await authedJsonFetch("/api/studio/refine", "POST", params);
  if (res.status === 428) {
    const body = await res.json().catch(() => ({}));
    throw new StudioConsentRequiredError(body.reason || "Consent required.", body.provider);
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    throw new StudioDeniedError(body.reason || "Denied by privacy policy.");
  }
  if (res.status === 402) {
    const body = await res.json().catch(() => ({}));
    throw new StudioNoAiSourceError(body.error || "No AI source is currently available.");
  }
  return json<StudioRefineResult>(res);
}

export async function grantStudioConsent(sessionId: string, provider: string): Promise<void> {
  await authedJsonFetch("/api/studio/consent", "POST", { sessionId, provider }).then((r) => json(r));
}

/**
 * Propose journal requirements from pasted author-guidelines text. Returns
 * only a proposal for the caller to review — nothing is saved here; call
 * saveJournalRequirements() with source: "ai_extracted" once the user
 * confirms it. Same BYOK-vs-Premium shape and error-status mapping as
 * refinePassage() above (428/403/402 map to the same three typed errors —
 * their names are generic to any Warden/Premium-gated call, not
 * Studio-specific, so this reuses them rather than defining duplicates).
 */
export async function extractJournalRequirements(params: {
  projectId: string;
  guidelinesText: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  useEngine?: "premium";
}): Promise<{ proposal: JournalRequirementsProposal }> {
  const { projectId, ...requestBody } = params;
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/journal-requirements/extract`, "POST", requestBody);
  if (res.status === 428) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioConsentRequiredError(errBody.reason || "Consent required.", errBody.provider);
  }
  if (res.status === 403) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioDeniedError(errBody.reason || "Denied by privacy policy.");
  }
  if (res.status === 402) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioNoAiSourceError(errBody.error || "No AI source is currently available.");
  }
  return json<{ proposal: JournalRequirementsProposal }>(res);
}

export function sendCopilotMessage(
  projectId: string,
  stage: string,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ ok: boolean; response: string }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/agent/copilot-chat`, "POST", { stage, message, history }).then((r) =>
    json<{ ok: boolean; response: string }>(r)
  );
}

export interface AiOperationalStatus {
  connected: boolean;
  statusText: string;
  provider?: string;
  model?: string;
  isFallback?: boolean;
  capabilities: {
    text: boolean;
    vision: boolean;
    document: boolean;
    webSearch: boolean;
    deepResearch: boolean;
  };
  providers: Array<{
    id: string;
    name: string;
    model: string;
    tier: string;
  }>;
}

export async function getAiOperationalStatus(): Promise<AiOperationalStatus> {
  let byokProviders: string[] = [];
  try {
    byokProviders = providersWithStoredKey();
  } catch {
    byokProviders = [];
  }
  const hasClientByok = byokProviders.length > 0;

  try {
    const res = await authedFetch("/api/ai/status");
    if (res.ok) {
      const serverStatus = await res.json();
      const connected = Boolean(serverStatus.connected || hasClientByok);
      const activeProvider = serverStatus.providers?.[0]?.name || (hasClientByok ? byokProviders[0] : undefined);
      const activeModel = serverStatus.providers?.[0]?.model;

      return {
        connected,
        statusText: connected ? "Ask Scholar is ready" : "AI Disconnected",
        provider: activeProvider,
        model: activeModel,
        capabilities: {
          text: connected,
          vision: Boolean(serverStatus.capabilities?.vision || (hasClientByok && byokProviders.includes("gemini"))),
          document: true,
          webSearch: true,
          deepResearch: connected,
        },
        providers: serverStatus.providers || [],
      };
    }
  } catch (e) {
    // Backend unreachable, fallback to client status
  }

  return {
    connected: hasClientByok,
    statusText: hasClientByok ? "Ask Scholar is ready" : "AI Disconnected",
    provider: hasClientByok ? byokProviders[0] : undefined,
    capabilities: {
      text: hasClientByok,
      vision: hasClientByok,
      document: true,
      webSearch: false,
      deepResearch: false,
    },
    providers: byokProviders.map((p: string) => ({ id: p, name: p, model: "byok", tier: "client" })),
  };
}

export interface AgenticQueryRequest {
  prompt: string;
  systemPrompt?: string;
  mode?: "normal" | "search" | "deep-research";
  citationStyle?: string;
  files?: Array<{ name: string; text?: string; content?: string; type?: string; size?: number }>;
  images?: Array<{ data?: string; dataUrl?: string; mimeType?: string; name?: string }>;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  onChunk?: (chunk: string) => void;
}

export interface AgenticQueryResponse {
  ok: boolean;
  text: string;
  mode?: string;
  provider?: string;
  model?: string;
  plan?: string[];
  citations?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    source?: string;
    venue?: string;
    year?: number | string;
    doi?: string;
    authorityBadge?: string;
    authorityTier?: string;
    domain?: string;
    publisher?: string;
    author?: string;
    authors?: string[];
    isPrimary?: boolean;
    sourceType?: "official" | "scholarly" | "media" | "web" | "vault";
  }>;
  citationStyle?: string;
  followUps?: string[];
  error?: string;
  wordCount?: number;
  verifiedSourcesCount?: number;
  burstinessMetrics?: {
    averageLength: number;
    variance: number;
    burstinessScore: number;
    isSufficientlyBurst: boolean;
  };
  recommendedWorkspaceHandoff?: {
    targetFormatId: "OT-01" | "OT-10" | "OT-19" | "OT-09" | "OT-22";
    formatLabel: string;
    topic: string;
    suggestedTitle: string;
    wordCountTarget?: number;
    citationStyle: string;
    retrievedSources: Array<{
      title: string;
      authors: string[];
      year?: number | string;
      doi?: string;
      url?: string;
      venue?: string;
    }>;
  };
}

export async function executeAgenticQuery(
  req: AgenticQueryRequest
): Promise<AgenticQueryResponse> {
  const payload = {
    prompt: req.prompt,
    systemPrompt: req.systemPrompt,
    mode: req.mode && req.mode !== "normal" ? req.mode : undefined,
    citationStyle: req.citationStyle,
    files: req.files,
    images: req.images,
    history: req.history,
  };

  const res = await authedJsonFetch("/api/ai/agent", "POST", payload);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    if (res.status === 524 || res.status === 504) {
      throw new Error("AI Gateway Timeout (524): The upstream AI provider took too long to respond. The system will automatically use the high-speed fallback model.");
    }
    const errorMsg = errorBody.error || `AI Request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  const data = await res.json();
  if (data.ok && data.text) {
    req.onChunk?.(data.text);
  }
  return data;
}

export async function parseFileForAgent(
  file: File
): Promise<{
  isImage: boolean;
  fileData?: { name: string; text: string; type: string };
  imageData?: { data: string; dataUrl: string; mimeType: string; name: string };
}> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif", "ico", "tiff", "tif"]);
  const isImage = file.type.startsWith("image/") || imageExtensions.has(ext);

  if (isImage) {
    let mimeType = file.type;
    if (!mimeType || mimeType === "application/octet-stream") {
      if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
      else if (ext === "png") mimeType = "image/png";
      else if (ext === "webp") mimeType = "image/webp";
      else if (ext === "gif") mimeType = "image/gif";
      else if (ext === "svg") mimeType = "image/svg+xml";
      else if (ext === "bmp") mimeType = "image/bmp";
      else if (ext === "avif") mimeType = "image/avif";
      else mimeType = "image/png";
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const commaIdx = result.indexOf(",");
        const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
        const dataUrl = result.startsWith("data:") ? result : `data:${mimeType};base64,${base64}`;
        resolve({
          isImage: true,
          imageData: {
            data: base64,
            dataUrl,
            mimeType,
            name: file.name,
          },
        });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  if (file.type.startsWith("text/") || ext === "txt" || ext === "md" || ext === "markdown" || ext === "json" || ext === "csv") {
    try {
      const text = await file.text();
      return {
        isImage: false,
        fileData: {
          name: file.name,
          text,
          type: file.type || "text/plain",
        },
      };
    } catch {
      // fallback to backend parser
    }
  }

  const formData = new FormData();
  formData.append("file", file);
  const res = await authedFetch("/api/vault/parse-file", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Could not parse file ${file.name}`);
  }

  const parsed = await res.json();
  return {
    isImage: false,
    fileData: {
      name: file.name,
      text: parsed.text || "",
      type: file.type || "application/octet-stream",
    },
  };
}
