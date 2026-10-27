import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { completeWithFailover, streamWithFailover } from "../../src/platform/gateway/gateway.js";
import { defaultPolicy } from "../../src/platform/warden/policy.js";
import { recordConsent, type EgressPolicy } from "../../src/platform/warden/warden.js";
import type { TaskClass } from "../../src/platform/warden/types.js";
import type { CandidateProvider } from "../../src/platform/gateway/types.js";
import { getEntitlement, isEntitlementActive } from "../src/aiEngine/entitlements.js";
import { scholarBrain } from "./scholarBrain.js";
import { parseAndRepairLLMJson } from "../../src/shared/llmJsonParser.js";

dotenv.config();

export interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  user?: { id: string; email?: string | null };
  userId?: string;
  params?: Record<string, string>;
  originalUrl?: string;
  baseUrl?: string;
  path?: string;
  url?: string;
}

export interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
  headersSent?: boolean;
  writableEnded?: boolean;
  setHeader?: (name: string, value: string) => ResponseLike | void;
  writeHead?: (status: number, headers: Record<string, string>) => void;
  flushHeaders?: () => void;
  write?: (chunk: string) => boolean;
  end?: () => void;
}

export function mapTaskType(taskType: string): TaskClass {
  const valid: TaskClass[] = ["drafting", "refinement", "chat", "summarisation", "verification", "rule_extraction", "discovery", "embedding", "classification"];
  return valid.includes(taskType as TaskClass) ? (taskType as TaskClass) : "chat";
}

export function buildAuthorizedPolicy(candidates: CandidateProvider[]): EgressPolicy {
  let policy = defaultPolicy();
  for (const c of candidates) {
    if (c.apiKey) {
      policy = recordConsent(policy, c.provider);
    }
  }
  return policy;
}

export interface RequestAiConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  candidates: CandidateProvider[];
}

/**
 * Resolves client-owned transient AI configuration from request headers.
 * Never persists keys on the server and never falls back to server env keys.
 */
export function resolveRequestAiConfig(req?: RequestLike): RequestAiConfig {
  if (!req || !req.headers) {
    return { candidates: [] };
  }
  const headers = req.headers;
  const provider = (headers["x-ai-provider"] as string) || (headers["x-provider"] as string) || undefined;
  const model = (headers["x-ai-model"] as string) || (headers["x-model"] as string) || undefined;
  const apiKey = (headers["x-ai-api-key"] as string) || (headers["x-api-key"] as string) || undefined;
  const baseUrl = (headers["x-ai-base-url"] as string) || (headers["x-base-url"] as string) || undefined;

  const candidates: CandidateProvider[] = [];

  if (provider && (apiKey || baseUrl || provider === "ollama" || provider === "lmstudio" || provider === "localai" || provider === "vllm")) {
    candidates.push({
      provider: provider as CandidateProvider["provider"],
      model: model || undefined,
      apiKey: apiKey || "local-no-credential-required",
      baseUrl: baseUrl || undefined,
    });
  }

  return {
    provider,
    model,
    apiKey,
    baseUrl,
    candidates,
  };
}

/**
 * Returns active candidate AI providers strictly from the caller's transient request headers.
 * Platform-paid or server-sponsored AI keys (process.env.GEMINI_API_KEY, etc.) are strictly disallowed.
 */
export function getCandidates(req?: RequestLike): CandidateProvider[] {
  if (req) {
    const config = resolveRequestAiConfig(req);
    if (config.candidates.length > 0) {
      return config.candidates;
    }
  }
  return [];
}

export interface PremiumAiPolicy {
  status: "not_configured" | "active" | "suspended";
  isServerAiAuthorized: boolean;
  reason?: string;
}

export function getPremiumAiPolicy(req?: RequestLike): PremiumAiPolicy {
  const isExplicitlyDisabled = process.env.ENABLE_SERVER_AI === "false";
  const candidates = getCandidates(req);
  const hasCredentials = candidates.length > 0;

  if (isExplicitlyDisabled) {
    return {
      status: "suspended",
      isServerAiAuthorized: false,
      reason: "Server AI execution is disabled by configuration.",
    };
  }

  if (!hasCredentials) {
    return {
      status: "not_configured",
      isServerAiAuthorized: false,
      reason: "No client-owned BYOK API key or local AI runner header was supplied for this request.",
    };
  }

  return {
    status: "active",
    isServerAiAuthorized: true,
  };
}

export async function isServerAiAuthorized(req: RequestLike): Promise<boolean> {
  const policy = getPremiumAiPolicy(req);
  return policy.isServerAiAuthorized;
}

// ─────────────────────────────────────────────────────────
// CRYPTOGRAPHIC HTTP 426 HMAC CHALLENGE GENERATION & VERIFICATION
// ─────────────────────────────────────────────────────────

export interface LLMChallengePayload {
  userId: string;
  projectId: string;
  routeId: string;
  promptSha256?: string;
  issuedAt: number;
  expiresAt: number;
}

const EPHEMERAL_BOOT_SECRET = crypto.randomBytes(32).toString("hex");

export function getLLMChallengeSecret(): string {
  return process.env.LLM_CHALLENGE_SECRET || process.env.SUPABASE_JWT_SECRET || EPHEMERAL_BOOT_SECRET;
}

/**
 * Generates an HMAC-SHA256 signed challenge token binding user, project, route, prompt, and TTL.
 */
export function createLLMChallengeToken(
  req: RequestLike,
  systemPrompt: string = "",
  userPrompt: string = "",
  ttlMs: number = 5 * 60 * 1000
): string {
  const secret = getLLMChallengeSecret();
  const userId = req?.user?.id || req?.userId || (req?.headers?.["x-user-id"] as string) || "anonymous";
  const projectId = req?.params?.id || req?.params?.projectId || ((req?.body?.projectId as string) ?? "");
  const routeId = req?.originalUrl || req?.baseUrl || req?.path || req?.url || "";
  const promptSha256 = (systemPrompt || userPrompt)
    ? crypto.createHash("sha256").update(`${systemPrompt}:::${userPrompt}`).digest("hex")
    : undefined;
  const now = Date.now();
  const payload: LLMChallengePayload = {
    userId,
    projectId,
    routeId,
    ...(promptSha256 ? { promptSha256 } : {}),
    issuedAt: now,
    expiresAt: now + ttlMs,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies that the client-returned challengeToken has not been forged, expired, or tampered.
 */
export function verifyLLMChallengeToken(
  challengeToken: unknown,
  req: RequestLike,
  systemPrompt?: string,
  userPrompt?: string
): { valid: boolean; reason?: string; payload?: LLMChallengePayload } {
  if (!challengeToken || typeof challengeToken !== "string") {
    return { valid: false, reason: "Missing or invalid challengeToken format." };
  }
  const parts = challengeToken.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "Malformed challengeToken structure." };
  }
  const [payloadB64, sig] = parts;
  const secret = getLLMChallengeSecret();
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
    return { valid: false, reason: "Invalid HMAC signature." };
  }

  let payload: LLMChallengePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as LLMChallengePayload;
  } catch {
    return { valid: false, reason: "Invalid token JSON payload." };
  }

  const now = Date.now();
  if (now > payload.expiresAt) {
    return { valid: false, reason: "Challenge token has expired." };
  }

  // Max 5 minutes bounded duration check
  if (payload.expiresAt - payload.issuedAt > 5 * 60 * 1000 + 5000) {
    return { valid: false, reason: "Challenge token lifetime exceeds maximum allowed duration." };
  }

  const currentUserId = req?.user?.id || req?.userId || (req?.headers?.["x-user-id"] as string) || "anonymous";
  if (payload.userId !== currentUserId) {
    return { valid: false, reason: `User ID mismatch: token belongs to ${payload.userId}, request is from ${currentUserId}.` };
  }

  const currentProjectId = req?.params?.id || req?.params?.projectId || ((req?.body?.projectId as string) ?? "");
  if (payload.projectId && currentProjectId && payload.projectId !== currentProjectId) {
    return { valid: false, reason: `Project ID mismatch: token belongs to ${payload.projectId}, request is for ${currentProjectId}.` };
  }

  if (payload.promptSha256 && (systemPrompt || userPrompt)) {
    const expectedPromptSha256 = crypto
      .createHash("sha256")
      .update(`${systemPrompt || ""}:::${userPrompt || ""}`)
      .digest("hex");
    if (payload.promptSha256 !== expectedPromptSha256) {
      return { valid: false, reason: "Prompt signature mismatch." };
    }
  }

  return { valid: true, payload };
}

export function handleFrontendLLMOverride(
  req: RequestLike,
  res?: ResponseLike,
  options?: {
    systemPrompt?: string;
    userPrompt?: string;
    schemaValidator?: (val: unknown) => unknown;
  }
): string | null {
  if (!req?.body || req.body.llmResult === undefined || req.body.llmResult === null) {
    return null;
  }

  const challengeToken = req.body.challengeToken;
  const verification = verifyLLMChallengeToken(
    challengeToken,
    req,
    options?.systemPrompt,
    options?.userPrompt
  );

  if (!verification.valid) {
    if (res && !res.headersSent) {
      res.status(403).json({ error: `Forbidden LLM override: ${verification.reason}` });
    }
    const err = new Error(`Forbidden LLM override: ${verification.reason}`);
    (err as unknown as { status: number }).status = 403;
    throw err;
  }

  let content = req.body.llmResult;
  if (typeof content === "object" && content !== null && typeof (content as { text?: unknown }).text === "string") {
    content = (content as { text: string }).text;
  }
  const rawString = typeof content === "string" ? content : JSON.stringify(content);

  // Pass every verified llmResult through scholarBrain voice and citation sanitization
  const voiced = scholarBrain.enforceScholarlyVoice(rawString);
  const scrubbed = scholarBrain.scrubAndFormatCitations(voiced.text);
  const sanitized = scrubbed.formattedText || scrubbed.scrubbedText || voiced.text;

  if (options?.schemaValidator) {
    options.schemaValidator(sanitized);
  }

  return sanitized;
}

export interface LLMJsonResponse {
  data?: unknown;
  meta?: unknown;
  draftContent?: string;
  currentWords?: number;
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

export function parseJsonFromLlm<T = LLMJsonResponse>(content: unknown): T {
  if (!content) return null as T;
  return parseAndRepairLLMJson<T>(content);
}

export function handleFrontendLLMOverrideJSON<T = LLMJsonResponse>(
  req: RequestLike,
  res?: ResponseLike,
  options?: {
    systemPrompt?: string;
    userPrompt?: string;
    schemaValidator?: (val: unknown) => T;
  }
): T | null {
  if (!req?.body || req.body.llmResult === undefined || req.body.llmResult === null) {
    return null;
  }

  const content = handleFrontendLLMOverride(req, res, {
    systemPrompt: options?.systemPrompt,
    userPrompt: options?.userPrompt,
  });
  if (!content) return null;

  const parsed = parseJsonFromLlm<T>(content);
  const sanitized = scholarBrain.sanitizePayload(parsed);

  if (options?.schemaValidator) {
    return options.schemaValidator(sanitized);
  }

  return sanitized as T;
}

export async function callOpenRouterJSON<T = LLMJsonResponse>(
  req: RequestLike,
  res: ResponseLike,
  systemPrompt: string,
  userPrompt: string,
  model: string = "openrouter/auto",
  taskType: string = "reasoning",
  schemaValidator?: (val: unknown) => T
): Promise<T> {
  const override = handleFrontendLLMOverrideJSON<T>(req, res, { systemPrompt, userPrompt, schemaValidator });
  if (override) return override;

  const aiConfig = resolveRequestAiConfig(req);
  const serverAuthorized = await isServerAiAuthorized(req);
  const rawCandidates = serverAuthorized ? aiConfig.candidates : [];
  const candidates = rawCandidates.map((c) => ({
    ...c,
    model: c.model || (model && model !== "openrouter/auto" ? model : undefined),
  }));

  if (candidates.length === 0) {
    if (!res.headersSent) {
      const challengeToken = createLLMChallengeToken(req, systemPrompt, userPrompt);
      res.status(426).json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType });
    }
    throw new Error("RequireFrontendLLMException");
  }

  try {
    const result = await completeWithFailover(
      {
        taskClass: mapTaskType(taskType),
        systemPrompt,
        userPrompt,
        responseFormat: "json",
        segments: [{ label: "Input", text: userPrompt }]
      },
      { candidates },
      buildAuthorizedPolicy(candidates)
    );
    
    if (!result.ok) {
      throw new Error(result.error.message || "AI Agent Generation Failed");
    }

    const text = result.value.text;
    const parsed = parseJsonFromLlm<T>(text);
    const sanitized = scholarBrain.sanitizePayload(parsed);
    if (schemaValidator) {
      return schemaValidator(sanitized);
    }
    return sanitized;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 403) {
      throw err;
    }
    if ((err as Error)?.message === "RequireFrontendLLMException") {
      throw err;
    }
    if (!res.headersSent) {
      const challengeToken = createLLMChallengeToken(req, systemPrompt, userPrompt);
      res.status(426).json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType });
    }
    throw new Error("RequireFrontendLLMException");
  }
}

export async function callOpenRouterText(
  req: RequestLike,
  res: ResponseLike,
  systemPrompt: string,
  userPrompt: string,
  model: string = "openrouter/auto",
  taskType: string = "reasoning",
  schemaValidator?: (val: unknown) => unknown
): Promise<string> {
  const override = handleFrontendLLMOverride(req, res, { systemPrompt, userPrompt, schemaValidator });
  if (override) return override;

  const aiConfig = resolveRequestAiConfig(req);
  const serverAuthorized = await isServerAiAuthorized(req);
  const rawCandidates = serverAuthorized ? aiConfig.candidates : [];
  const candidates = rawCandidates.map((c) => ({
    ...c,
    model: c.model || (model && model !== "openrouter/auto" ? model : undefined),
  }));

  if (candidates.length === 0) {
    if (!res.headersSent) {
      const challengeToken = createLLMChallengeToken(req, systemPrompt, userPrompt);
      res.status(426).json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType });
    }
    throw new Error("RequireFrontendLLMException");
  }

  try {
    const result = await completeWithFailover(
      {
        taskClass: mapTaskType(taskType),
        systemPrompt,
        userPrompt,
        segments: [{ label: "Input", text: userPrompt }]
      },
      { candidates },
      buildAuthorizedPolicy(candidates)
    );
    if (!result.ok) {
      throw new Error(result.error.message || "AI Agent Generation Failed");
    }
    const sanitized = scholarBrain.enforceScholarlyVoice(result.value.text);
    return scholarBrain.scrubAndFormatCitations(sanitized.text).formattedText;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 403) {
      throw err;
    }
    if ((err as Error)?.message === "RequireFrontendLLMException") {
      throw err;
    }
    if (!res.headersSent) {
      const challengeToken = createLLMChallengeToken(req, systemPrompt, userPrompt);
      res.status(426).json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType });
    }
    throw new Error("RequireFrontendLLMException");
  }
}

export async function streamOpenRouterJSON<T = LLMJsonResponse>(
  req: RequestLike,
  res: ResponseLike,
  systemPrompt: string,
  userPrompt: string,
  model: string = "openrouter/auto",
  taskType: string = "reasoning",
  schemaValidator?: (val: unknown) => T
): Promise<T | void> {
  try {
    const override = handleFrontendLLMOverrideJSON<T>(req, res, { systemPrompt, userPrompt, schemaValidator });
    if (override) return override;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 403 || res.headersSent || res.writableEnded) {
      return;
    }
    throw err;
  }

  const aiConfig = resolveRequestAiConfig(req);
  const serverAuthorized = await isServerAiAuthorized(req);
  const rawCandidates = serverAuthorized ? aiConfig.candidates : [];
  const candidates = rawCandidates.map((c) => ({
    ...c,
    model: c.model || (model && model !== "openrouter/auto" ? model : undefined),
  }));

  if (candidates.length === 0) {
    if (!res.headersSent) {
      const challengeToken = createLLMChallengeToken(req, systemPrompt, userPrompt);
      res.status(426).json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType, stream: true });
    }
    return;
  }

  if (!res.headersSent && res.writeHead) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
  }

  const sendEvent = (event: string, data: unknown) => {
    if (res.write) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  sendEvent("log", { message: "> Initializing Agent Framework..." });

  let fullContent = "";

  try {
    const result = await streamWithFailover(
      {
        taskClass: mapTaskType(taskType),
        systemPrompt,
        userPrompt,
        responseFormat: "json",
        segments: [{ label: "Input", text: userPrompt }]
      },
      (chunk: string) => {
        fullContent += chunk;
        sendEvent("chunk", { token: chunk });
      },
      { candidates },
      buildAuthorizedPolicy(candidates)
    );

    if (!result.ok) {
      throw new Error(result.error.message || "AI Agent Generation Failed");
    }

    sendEvent("log", { message: "> Parsing final JSON..." });
    const parsed = parseJsonFromLlm<T>(fullContent);
    const sanitized = scholarBrain.sanitizePayload(parsed);
    if (schemaValidator) {
      return schemaValidator(sanitized);
    }
    return sanitized;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 403) {
      throw err;
    }
    if (!res.headersSent) {
      const challengeToken = createLLMChallengeToken(req, systemPrompt, userPrompt);
      res.status(426).json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType, stream: true });
      return;
    }
    throw err;
  }
}

export async function streamOpenRouterText(
  req: RequestLike,
  res: ResponseLike,
  systemPrompt: string,
  userPrompt: string,
  model: string = "openrouter/auto",
  taskType: string = "reasoning"
): Promise<string | void> {
  const override = handleFrontendLLMOverride(req, res, { systemPrompt, userPrompt });
  if (override) return override;

  const aiConfig = resolveRequestAiConfig(req);
  const serverAuthorized = await isServerAiAuthorized(req);
  const rawCandidates = serverAuthorized ? aiConfig.candidates : [];
  const candidates = rawCandidates.map((c) => ({
    ...c,
    model: c.model || (model && model !== "openrouter/auto" ? model : undefined),
  }));

  if (candidates.length === 0) {
    if (!res.headersSent) {
      const challengeToken = createLLMChallengeToken(req, systemPrompt, userPrompt);
      res.status(426).json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType, stream: true });
    }
    return;
  }

  if (!res.headersSent && res.writeHead) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
  }

  const sendEvent = (event: string, data: unknown) => {
    if (res.write) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  sendEvent("log", { message: "> Initializing Agent Framework..." });

  let fullContent = "";

  try {
    const result = await streamWithFailover(
      {
        taskClass: mapTaskType(taskType),
        systemPrompt,
        userPrompt,
        segments: [{ label: "Input", text: userPrompt }]
      },
      (chunk: string) => {
        fullContent += chunk;
        sendEvent("chunk", { token: chunk });
      },
      { candidates },
      buildAuthorizedPolicy(candidates)
    );
    if (!result.ok) {
      throw new Error(result.error.message || "AI Agent Generation Failed");
    }

    const sanitized = scholarBrain.enforceScholarlyVoice(fullContent);
    return scholarBrain.scrubAndFormatCitations(sanitized.text).formattedText;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 403) {
      throw err;
    }
    if (!res.headersSent) {
      const challengeToken = createLLMChallengeToken(req, systemPrompt, userPrompt);
      res.status(426).json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType, stream: true });
      return;
    }
    throw err;
  }
}

export interface MultimodalAgenticOptions {
  systemPrompt?: string;
  userPrompt: string;
  images?: { dataUrl: string; mimeType?: string; name?: string }[];
  taskType?: string;
  candidates?: CandidateProvider[];
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
}

export async function executeMultimodalAgentic(options: MultimodalAgenticOptions, req?: RequestLike): Promise<{ text: string; provider: string; model: string }> {
  const candidates = options.candidates && options.candidates.length > 0 ? options.candidates : getCandidates(req);
  if (candidates.length === 0) {
    throw new Error("No client-owned BYOK API key or local AI runner was supplied for this request. Please configure your credentials in AI Access.");
  }

  let orderedCandidates = [...candidates];
  if (options.images && options.images.length > 0) {
    orderedCandidates.sort((a, b) => {
      if (a.provider === "gemini" && b.provider !== "gemini") return -1;
      if (b.provider === "gemini" && a.provider !== "gemini") return 1;
      return 0;
    });
  }

  const policy = buildAuthorizedPolicy(orderedCandidates);
  const taskClass = mapTaskType(options.taskType || (options.images?.length ? "chat" : "reasoning"));

  if (options.onChunk) {
    let full = "";
    const result = await streamWithFailover(
      {
        taskClass,
        systemPrompt: options.systemPrompt,
        userPrompt: options.userPrompt,
        images: options.images,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        segments: [{ label: "Input", text: options.userPrompt }],
      },
      (chunk) => {
        full += chunk;
        options.onChunk!(chunk);
      },
      { candidates: orderedCandidates },
      policy
    );

    if (!result.ok) {
      throw new Error(result.error?.message || "AI Agent Generation Failed");
    }

    const modelName = typeof result.value === "object" && result.value !== null && "model" in result.value
      ? String((result.value as { model: unknown }).model || "")
      : "";

    return { text: full, provider: result.providerId, model: modelName };
  } else {
    const result = await completeWithFailover(
      {
        taskClass,
        systemPrompt: options.systemPrompt,
        userPrompt: options.userPrompt,
        images: options.images,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        segments: [{ label: "Input", text: options.userPrompt }],
      },
      { candidates: orderedCandidates },
      policy
    );

    if (!result.ok) {
      throw new Error(result.error?.message || "AI Agent Generation Failed");
    }

    const modelName = typeof result.value === "object" && result.value !== null && "model" in result.value
      ? String((result.value as { model: unknown }).model || "")
      : "";

    return {
      text: typeof result.value === "string" ? result.value : result.value.text,
      provider: result.providerId,
      model: modelName,
    };
  }
}

export async function generateGeminiEmbedding(text: string, apiKey?: string): Promise<number[]> {
  if (!apiKey) {
    throw new Error("Client BYOK Gemini API key is required for embeddings.");
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embedding API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.embedding.values;
}
