import dotenv from 'dotenv';
import crypto from 'crypto';
import type express from 'express';
import { completeWithFailover, streamWithFailover } from "../../src/platform/gateway/gateway.js";
import { defaultPolicy } from "../../src/platform/warden/policy.js";
import { recordConsent, type EgressPolicy } from "../../src/platform/warden/warden.js";
import type { TaskClass } from "../../src/platform/warden/types.js";
import type { CandidateProvider } from "../../src/platform/gateway/types.js";
import { getEntitlement, isEntitlementActive } from "../src/aiEngine/entitlements.js";
import { parseAndRepairLLMJson } from "../../src/shared/llmJsonParser.ts";

dotenv.config();

export type LlmRequestLike = Partial<express.Request> & {
  headers?: Record<string, string | string[] | undefined>;
  body?: any;
  user?: { id?: string; email?: string };
  res?: Partial<express.Response>;
  originalUrl?: string;
  url?: string;
};

export type LlmResponseLike = Partial<express.Response> & {
  headersSent?: boolean;
  status: (code: number) => LlmResponseLike;
  json: (body: unknown) => unknown;
  writeHead?: (statusCode: number, headers?: Record<string, string>) => unknown;
  write?: (chunk: string) => boolean;
};

const LLM_CHALLENGE_SECRET =
  process.env.LLM_CHALLENGE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_JWT_SECRET ||
  "scholar-core-ephemeral-challenge-secret";

export interface LlmChallengePayload {
  userId: string;
  routeId: string;
  promptHash: string;
  expiresAt: number;
}

export function computePromptHash(systemPrompt: string = "", userPrompt: string = ""): string {
  return crypto.createHash("sha256").update(`${systemPrompt || ""}:::${userPrompt || ""}`).digest("hex");
}

export function signLlmChallenge(payload: { userId: string; routeId: string; promptHash: string; expiresAt: number }): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", LLM_CHALLENGE_SECRET).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function verifyLlmChallenge(token: string, expectedUserId: string, promptHash?: string): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [data, signature] = parts;
  const expectedSignature = crypto.createHmac("sha256", LLM_CHALLENGE_SECRET).update(data).digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  try {
    const payloadStr = Buffer.from(data, "base64url").toString("utf8");
    const payload: LlmChallengePayload = JSON.parse(payloadStr);

    if (!payload.expiresAt || typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) {
      return false;
    }

    if (promptHash && payload.promptHash && payload.promptHash !== "*" && payload.promptHash !== promptHash) {
      return false;
    }

    if (expectedUserId && payload.userId && payload.userId !== "*" && payload.userId !== expectedUserId) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function mapTaskType(taskType: string): TaskClass {
  const valid: TaskClass[] = [
    "drafting",
    "refinement",
    "chat",
    "summarisation",
    "verification",
    "rule_extraction",
    "discovery",
    "embedding",
    "classification",
  ];
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
export function resolveRequestAiConfig(req?: LlmRequestLike): RequestAiConfig {
  if (!req || !req.headers) {
    return { candidates: [] };
  }
  const headers = req.headers;
  const provider =
    (headers["x-ai-provider"] as string) || (headers["x-provider"] as string) || undefined;
  const model =
    (headers["x-ai-model"] as string) || (headers["x-model"] as string) || undefined;
  const apiKey =
    (headers["x-ai-api-key"] as string) || (headers["x-api-key"] as string) || undefined;
  const baseUrl =
    (headers["x-ai-base-url"] as string) || (headers["x-base-url"] as string) || undefined;

  const candidates: CandidateProvider[] = [];

  if (
    provider &&
    (apiKey ||
      baseUrl ||
      provider === "ollama" ||
      provider === "lmstudio" ||
      provider === "localai" ||
      provider === "vllm")
  ) {
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
export function getCandidates(req?: LlmRequestLike): CandidateProvider[] {
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

export function getPremiumAiPolicy(req?: LlmRequestLike): PremiumAiPolicy {
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

export async function isServerAiAuthorized(req: LlmRequestLike): Promise<boolean> {
  const policy = getPremiumAiPolicy(req);
  return policy.isServerAiAuthorized;
}

export function handleFrontendLLMOverride(
  req: LlmRequestLike,
  res?: LlmResponseLike,
  systemPrompt?: string,
  userPrompt?: string
): string | null {
  if (!req?.body || !req.body.llmResult) {
    return null;
  }

  const token = req.body.challengeToken as string | undefined;
  const userId = req.user?.id || (req.headers && req.headers["x-user-id"]) || "anonymous";
  const promptHash =
    systemPrompt !== undefined || userPrompt !== undefined
      ? computePromptHash(systemPrompt, userPrompt)
      : "";

  const isValid = token && verifyLlmChallenge(token, String(userId), promptHash);
  if (!isValid) {
    const targetRes = res || (req.res as LlmResponseLike | undefined);
    if (targetRes && !targetRes.headersSent) {
      targetRes.status(403).json({ error: "Invalid or unsigned LLM challenge token" });
    }
    const err = new Error("Invalid or unsigned LLM challenge token") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  let content = req.body.llmResult as unknown;
  if (
    typeof content === "object" &&
    content !== null &&
    typeof (content as { text?: unknown }).text === "string"
  ) {
    content = (content as { text: string }).text;
  }
  return typeof content === "string" ? content : JSON.stringify(content);
}

export function parseJsonFromLlm<T = Record<string, unknown>>(content: unknown): T | null {
  if (!content) return null;
  if (typeof content !== "string") return content as T;
  return parseAndRepairLLMJson(content) as T | null;
}

function handleFrontendLLMOverrideJSON(
  req: LlmRequestLike,
  res?: LlmResponseLike,
  systemPrompt?: string,
  userPrompt?: string
) {
  const content = handleFrontendLLMOverride(req, res, systemPrompt, userPrompt);
  if (content) {
    return parseJsonFromLlm(content);
  }
  return null;
}

function createChallengeTokenForRequest(
  req: LlmRequestLike,
  systemPrompt: string,
  userPrompt: string
): string {
  const promptHash = computePromptHash(systemPrompt, userPrompt);
  const userId = req?.user?.id || (req?.headers && req.headers["x-user-id"]) || "anonymous";
  const routeId = req?.originalUrl || req?.url || "llm-route";
  return signLlmChallenge({
    userId: String(userId),
    routeId: String(routeId),
    promptHash,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });
}

export async function callOpenRouterJSON<T = any>(
  req: LlmRequestLike,
  res: LlmResponseLike,
  systemPrompt: string,
  userPrompt: string,
  model?: string,
  taskType: string = "reasoning"
): Promise<T> {
  const override = handleFrontendLLMOverrideJSON(req, res, systemPrompt, userPrompt);
  if (override) return override as T;

  const aiConfig = resolveRequestAiConfig(req);
  const targetModel = model || aiConfig.model;
  const serverAuthorized = await isServerAiAuthorized(req);
  const rawCandidates = serverAuthorized ? aiConfig.candidates : [];
  const candidates = rawCandidates.map((c) => ({
    ...c,
    model: c.model || targetModel || undefined,
  }));

  const challengeToken = createChallengeTokenForRequest(req, systemPrompt, userPrompt);

  if (candidates.length === 0) {
    if (!res.headersSent) {
      res
        .status(426)
        .json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType });
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
        segments: [{ label: "Input", text: userPrompt }],
      },
      { candidates },
      buildAuthorizedPolicy(candidates)
    );

    if (!result.ok) {
      throw new Error(result.error.message || "AI Agent Generation Failed");
    }

    const text = result.value.text;
    return parseJsonFromLlm<T>(text) as T;
  } catch (err: unknown) {
    const typedErr = err as { status?: number; message?: string };
    if (typedErr?.status === 403 || typedErr?.message?.includes("challenge token")) {
      throw err;
    }
    if (!res.headersSent) {
      res
        .status(426)
        .json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType });
    }
    throw new Error("RequireFrontendLLMException");
  }
}

export async function callOpenRouterText(
  req: LlmRequestLike,
  res: LlmResponseLike,
  systemPrompt: string,
  userPrompt: string,
  model?: string,
  taskType: string = "reasoning"
): Promise<string> {
  const override = handleFrontendLLMOverride(req, res, systemPrompt, userPrompt);
  if (override) return override;

  const aiConfig = resolveRequestAiConfig(req);
  const targetModel = model || aiConfig.model;
  const serverAuthorized = await isServerAiAuthorized(req);
  const rawCandidates = serverAuthorized ? aiConfig.candidates : [];
  const candidates = rawCandidates.map((c) => ({
    ...c,
    model: c.model || targetModel || undefined,
  }));

  const challengeToken = createChallengeTokenForRequest(req, systemPrompt, userPrompt);

  if (candidates.length === 0) {
    if (!res.headersSent) {
      res
        .status(426)
        .json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType });
    }
    throw new Error("RequireFrontendLLMException");
  }

  try {
    const result = await completeWithFailover(
      {
        taskClass: mapTaskType(taskType),
        systemPrompt,
        userPrompt,
        segments: [{ label: "Input", text: userPrompt }],
      },
      { candidates },
      buildAuthorizedPolicy(candidates)
    );
    if (!result.ok) {
      throw new Error(result.error.message || "AI Agent Generation Failed");
    }
    return result.value.text;
  } catch (err: unknown) {
    const typedErr = err as { status?: number; message?: string };
    if (typedErr?.status === 403 || typedErr?.message?.includes("challenge token")) {
      throw err;
    }
    if (!res.headersSent) {
      res
        .status(426)
        .json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType });
    }
    throw new Error("RequireFrontendLLMException");
  }
}

export async function streamOpenRouterJSON(
  req: LlmRequestLike,
  res: LlmResponseLike,
  systemPrompt: string,
  userPrompt: string,
  model?: string,
  taskType: string = "reasoning"
) {
  const override = handleFrontendLLMOverrideJSON(req, res, systemPrompt, userPrompt);
  if (override) return override;

  const aiConfig = resolveRequestAiConfig(req);
  const targetModel = model || aiConfig.model;
  const serverAuthorized = await isServerAiAuthorized(req);
  const rawCandidates = serverAuthorized ? aiConfig.candidates : [];
  const candidates = rawCandidates.map((c) => ({
    ...c,
    model: c.model || targetModel || undefined,
  }));

  const challengeToken = createChallengeTokenForRequest(req, systemPrompt, userPrompt);

  if (candidates.length === 0) {
    if (!res.headersSent) {
      res.status(426).json({
        requireFrontendLLM: true,
        challengeToken,
        systemPrompt,
        userPrompt,
        taskType,
        stream: true,
      });
    }
    return;
  }

  if (!res.headersSent && res.writeHead) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
  }

  const sendEvent = (event: string, data: unknown) => {
    res.write?.(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
        segments: [{ label: "Input", text: userPrompt }],
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
    return parseJsonFromLlm(fullContent);
  } catch (err: unknown) {
    const typedErr = err as { status?: number; message?: string };
    if (typedErr?.status === 403 || typedErr?.message?.includes("challenge token")) {
      throw err;
    }
    if (!res.headersSent) {
      res.status(426).json({
        requireFrontendLLM: true,
        challengeToken,
        systemPrompt,
        userPrompt,
        taskType,
        stream: true,
      });
      return;
    }
    throw err;
  }
}

export async function streamOpenRouterText(
  req: LlmRequestLike,
  res: LlmResponseLike,
  systemPrompt: string,
  userPrompt: string,
  model?: string,
  taskType: string = "reasoning"
) {
  const override = handleFrontendLLMOverride(req, res, systemPrompt, userPrompt);
  if (override) return override;

  const aiConfig = resolveRequestAiConfig(req);
  const targetModel = model || aiConfig.model;
  const serverAuthorized = await isServerAiAuthorized(req);
  const rawCandidates = serverAuthorized ? aiConfig.candidates : [];
  const candidates = rawCandidates.map((c) => ({
    ...c,
    model: c.model || targetModel || undefined,
  }));

  const challengeToken = createChallengeTokenForRequest(req, systemPrompt, userPrompt);

  if (candidates.length === 0) {
    if (!res.headersSent) {
      res.status(426).json({
        requireFrontendLLM: true,
        challengeToken,
        systemPrompt,
        userPrompt,
        taskType,
        stream: true,
      });
    }
    return;
  }

  if (!res.headersSent && res.writeHead) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
  }

  const sendEvent = (event: string, data: unknown) => {
    res.write?.(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("log", { message: "> Initializing Agent Framework..." });

  let fullContent = "";

  try {
    const result = await streamWithFailover(
      {
        taskClass: mapTaskType(taskType),
        systemPrompt,
        userPrompt,
        segments: [{ label: "Input", text: userPrompt }],
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

    return fullContent;
  } catch (err: unknown) {
    const typedErr = err as { status?: number; message?: string };
    if (typedErr?.status === 403 || typedErr?.message?.includes("challenge token")) {
      throw err;
    }
    if (!res.headersSent) {
      res.status(426).json({
        requireFrontendLLM: true,
        challengeToken,
        systemPrompt,
        userPrompt,
        taskType,
        stream: true,
      });
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

export async function executeMultimodalAgentic(
  options: MultimodalAgenticOptions,
  req?: LlmRequestLike
): Promise<{ text: string; provider: string; model: string }> {
  const candidates =
    options.candidates && options.candidates.length > 0 ? options.candidates : getCandidates(req);
  if (candidates.length === 0) {
    throw new Error(
      "No client-owned BYOK API key or local AI runner was supplied for this request. Please configure your credentials in AI Access."
    );
  }

  const orderedCandidates = [...candidates];
  if (options.images && options.images.length > 0) {
    orderedCandidates.sort((a, b) => {
      if (a.provider === "gemini" && b.provider !== "gemini") return -1;
      if (b.provider === "gemini" && a.provider !== "gemini") return 1;
      return 0;
    });
  }

  const policy = buildAuthorizedPolicy(orderedCandidates);
  const taskClass = mapTaskType(
    options.taskType || (options.images?.length ? "chat" : "reasoning")
  );

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

    const modelVal =
      typeof result.value === "object" && result.value !== null && "model" in result.value
        ? String((result.value as { model?: string }).model || "")
        : "";
    return { text: full, provider: result.providerId, model: modelVal };
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

    return {
      text: typeof result.value === "string" ? result.value : result.value.text,
      provider: result.providerId,
      model: typeof result.value === "object" ? result.value.model : "",
    };
  }
}

export async function generateGeminiEmbedding(text: string, apiKey?: string): Promise<number[]> {
  if (!apiKey) {
    throw new Error("Client BYOK Gemini API key is required for embeddings.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${encodeURIComponent(
      apiKey
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embedding API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.embedding.values;
}
