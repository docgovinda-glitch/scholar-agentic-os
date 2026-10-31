import dotenv from 'dotenv';
import crypto from 'crypto';
import type express from 'express';
import { defaultPolicy } from "../../src/platform/warden/policy.js";
import { recordConsent, type EgressPolicy } from "../../src/platform/warden/warden.js";
import type { TaskClass } from "../../src/platform/warden/types.js";
import type { CandidateProvider } from "../../src/platform/gateway/types.js";
import { resolveClientAiConfig, type ClientAiConfig } from "../src/ai/clientAiConfig.ts";
import { getEntitlement, isEntitlementActive } from "../src/aiEngine/entitlements.js";
import { parseAndRepairLLMJson } from "../../src/shared/llmJsonParser.ts";
import { InvalidLlmChallengeError } from "../src/ai/aiRouteErrors.ts";
import { chainFor, NoAiConnectedError, routedText, RouterHandoffError, toRouterTask } from "../src/ai/routerBridge.ts";
import type { RouterEvent } from "../../src/platform/router/types.ts";

if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
  dotenv.config();
}

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

const EPHEMERAL_BOOT_CHALLENGE_SECRET = crypto.randomBytes(32).toString("hex");

export function resolveLlmChallengeSecret(): string {
  if (process.env.LLM_CHALLENGE_SECRET && process.env.LLM_CHALLENGE_SECRET.trim().length >= 16) {
    return process.env.LLM_CHALLENGE_SECRET.trim();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "LLM_CHALLENGE_SECRET must be set (>= 16 chars) in production; refusing to fall back to SUPABASE_SERVICE_ROLE_KEY (F-13)."
    );
  }
  return EPHEMERAL_BOOT_CHALLENGE_SECRET;
}

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
  const signature = crypto.createHmac("sha256", resolveLlmChallengeSecret()).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function verifyLlmChallenge(token: string, expectedUserId: string, promptHash?: string): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [data, signature] = parts;
  const expectedSignature = crypto.createHmac("sha256", resolveLlmChallengeSecret()).update(data).digest("base64url");

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

export type RequestAiConfig = ClientAiConfig;

/**
 * Resolves client-owned transient AI configuration from request headers.
 * Never persists keys on the server and never falls back to server env keys.
 */
export function resolveRequestAiConfig(req?: LlmRequestLike): RequestAiConfig {
  return resolveClientAiConfig(req?.headers);
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

export function createChallengeTokenForRequest(
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

/**
 * Reads a result the browser produced for a 426 hand-off. Returns null when the
 * request carries no result; throws InvalidLlmChallengeError when the challenge
 * does not match this user and exactly this prompt. Never writes to the response.
 */
export function readVerifiedBrowserResult(
  req: LlmRequestLike,
  systemPrompt: string,
  userPrompt: string
): string | null {
  if (!req?.body || req.body.llmResult === undefined || req.body.llmResult === null) return null;
  const token = typeof req.body.challengeToken === "string" ? req.body.challengeToken : "";
  const userId = req.user?.id || (req.headers && req.headers["x-user-id"]) || "anonymous";
  if (!token || !verifyLlmChallenge(token, String(userId), computePromptHash(systemPrompt, userPrompt))) {
    throw new InvalidLlmChallengeError();
  }
  let content = req.body.llmResult as unknown;
  if (typeof content === "object" && content !== null && typeof (content as { text?: unknown }).text === "string") {
    content = (content as { text: string }).text;
  }
  return typeof content === "string" ? content : JSON.stringify(content);
}

// ── Unified router (src/platform/router) ────────────────────────────────────
// Every text call below runs through one chain per request: Premium (when
// entitled) → the user's keys → their local model. A provider failure moves to
// the next model with a visible event; the browser hand-off (426) happens only
// when no server-side model is connected or the next model is a local one.

const routerTask = toRouterTask;

async function routeOrHandOff(
  req: LlmRequestLike,
  res: LlmResponseLike,
  systemPrompt: string,
  userPrompt: string,
  taskType: string,
  opts: { stream?: boolean; onEvent?: (ev: RouterEvent) => void; signal?: AbortSignal } = {}
): Promise<string> {
  try {
    return await routedText(req as unknown as express.Request, { task: routerTask(taskType), systemPrompt, userPrompt, onEvent: opts.onEvent, signal: opts.signal });
  } catch (err) {
    if (err instanceof NoAiConnectedError || err instanceof RouterHandoffError) {
      if (!res.headersSent) {
        const challengeToken = createChallengeTokenForRequest(req, systemPrompt, userPrompt);
        res.status(426).json({ requireFrontendLLM: true, challengeToken, systemPrompt, userPrompt, taskType, ...(opts.stream ? { stream: true } : {}) });
      }
      throw new Error("RequireFrontendLLMException");
    }
    throw err;
  }
}

/** Router events for a stream: tokens as `chunk`, routing changes as `log` and `route`. */
function streamEventSink(sendEvent: (event: string, data: unknown) => void, onToken: (t: string) => void) {
  return (ev: RouterEvent) => {
    if (ev.type === "token") { onToken(ev.text); sendEvent("chunk", { token: ev.text }); return; }
    if (ev.type === "fallback") sendEvent("log", { message: `⚠ Switched from ${ev.fromLabel} to ${ev.toLabel}: ${ev.message}` });
    if (ev.type === "retry") sendEvent("log", { message: `↻ ${ev.message}. Retrying in ${Math.ceil(ev.waitMs / 1000)}s` });
    if (ev.type === "candidate_skipped") sendEvent("log", { message: `Skipped ${ev.label}: ${ev.detail}` });
    if (ev.type === "attempt_start") sendEvent("log", { message: `> ${ev.label}` });
    if (ev.type !== "metrics") sendEvent("route", ev);
  };
}

export async function callOpenRouterJSON<T = any>(
  req: LlmRequestLike,
  res: LlmResponseLike,
  systemPrompt: string,
  userPrompt: string,
  _model?: string,
  taskType: string = "reasoning"
): Promise<T> {
  const override = handleFrontendLLMOverrideJSON(req, res, systemPrompt, userPrompt);
  if (override) return override as T;
  const text = await routeOrHandOff(req, res, systemPrompt, userPrompt, taskType);
  return parseJsonFromLlm<T>(text) as T;
}

export async function callOpenRouterText(
  req: LlmRequestLike,
  res: LlmResponseLike,
  systemPrompt: string,
  userPrompt: string,
  _model?: string,
  taskType: string = "reasoning"
): Promise<string> {
  const override = handleFrontendLLMOverride(req, res, systemPrompt, userPrompt);
  if (override) return override;
  return routeOrHandOff(req, res, systemPrompt, userPrompt, taskType);
}

async function streamThroughRouter(
  req: LlmRequestLike,
  res: LlmResponseLike,
  systemPrompt: string,
  userPrompt: string,
  taskType: string
): Promise<string | undefined> {
  // Decide the chain before opening the stream, so "no AI" and "your local
  // model goes first" are still a 426 hand-off with the prompt.
  const handOff = () => {
    if (!res.headersSent) {
      res.status(426).json({ requireFrontendLLM: true, challengeToken: createChallengeTokenForRequest(req, systemPrompt, userPrompt), systemPrompt, userPrompt, taskType, stream: true });
    }
    return undefined;
  };
  try {
    const chain = await chainFor(req as never, routerTask(taskType));
    if (chain[0]?.runsIn === "browser") return handOff();
  } catch (err) {
    if (err instanceof NoAiConnectedError) return handOff();
    throw err;
  }
  if (!res.headersSent && res.writeHead) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  }
  const sendEvent = (event: string, data: unknown) => { res.write?.(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const streamAbort = new AbortController();
  const onClose = () => { if (!(res as { writableFinished?: boolean }).writableFinished) streamAbort.abort(); };
  (res as any)?.on?.("close", onClose);
  let full = "";
  try {
    full = await routedText(req as unknown as express.Request, {
      task: routerTask(taskType), systemPrompt, userPrompt, signal: streamAbort.signal,
      onEvent: streamEventSink(sendEvent, (t) => { full += t; }),
    });
    return full;
  } catch (err) {
    if (err instanceof RouterHandoffError) {
      sendEvent("error", { message: `${err.message}. Open the app on that device or choose a cloud model in AI Access.` });
      return undefined;
    }
    throw err;
  } finally {
    (res as any)?.off?.("close", onClose);
  }
}

export async function streamOpenRouterJSON(
  req: LlmRequestLike,
  res: LlmResponseLike,
  systemPrompt: string,
  userPrompt: string,
  _model?: string,
  taskType: string = "reasoning"
) {
  const override = handleFrontendLLMOverrideJSON(req, res, systemPrompt, userPrompt);
  if (override) return override;
  const text = await streamThroughRouter(req, res, systemPrompt, userPrompt, taskType);
  if (text === undefined) return undefined;
  res.write?.(`event: log\ndata: ${JSON.stringify({ message: "> Parsing final JSON..." })}\n\n`);
  return parseJsonFromLlm(text);
}

export async function streamOpenRouterText(
  req: LlmRequestLike,
  res: LlmResponseLike,
  systemPrompt: string,
  userPrompt: string,
  _model?: string,
  taskType: string = "reasoning"
) {
  const override = handleFrontendLLMOverride(req, res, systemPrompt, userPrompt);
  if (override) return override;
  return streamThroughRouter(req, res, systemPrompt, userPrompt, taskType);
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
