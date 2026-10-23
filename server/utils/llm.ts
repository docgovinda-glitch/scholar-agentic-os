import dotenv from 'dotenv';
import { completeWithFailover, streamWithFailover } from "../../src/platform/gateway/gateway.js";
import { defaultPolicy } from "../../src/platform/warden/policy.js";
import { recordConsent, type EgressPolicy } from "../../src/platform/warden/warden.js";
import type { TaskClass } from "../../src/platform/warden/types.js";
import type { CandidateProvider } from "../../src/platform/gateway/types.js";
import { getEntitlement, isEntitlementActive } from "../src/aiEngine/entitlements.js";

dotenv.config();

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
export function resolveRequestAiConfig(req?: any): RequestAiConfig {
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
      provider: provider as any,
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
export function getCandidates(req?: any): CandidateProvider[] {
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

export function getPremiumAiPolicy(req?: any): PremiumAiPolicy {
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

export async function isServerAiAuthorized(req: any): Promise<boolean> {
  const policy = getPremiumAiPolicy(req);
  return policy.isServerAiAuthorized;
}

export function handleFrontendLLMOverride(req: any): string | null {
  if (req?.body && req.body.llmResult) {
    let content = req.body.llmResult;
    if (typeof content === "object" && typeof content.text === "string") {
      content = content.text;
    }
    return typeof content === "string" ? content : JSON.stringify(content);
  }
  return null;
}

export function parseJsonFromLlm(content: any): any {
  if (!content) return null;
  if (typeof content !== "string") return content;
  const raw = content.trim();

  // 1. Try direct parse
  try {
    return JSON.parse(raw);
  } catch (_) {}

  // 2. Try stripping markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {}
  }

  // 3. Try finding outer brackets / braces: {...} or [...]
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch (_) {}
  }

  const firstBracket = raw.indexOf('[');
  const lastBracket = raw.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(raw.slice(firstBracket, lastBracket + 1));
    } catch (_) {}
  }

  throw new Error("Invalid JSON returned by LLM: " + raw.slice(0, 120));
}

function handleFrontendLLMOverrideJSON(req: any) {
  const content = handleFrontendLLMOverride(req);
  if (content) {
    return parseJsonFromLlm(content);
  }
  return null;
}

export async function callOpenRouterJSON(req: any, res: any, systemPrompt: string, userPrompt: string, model: string = "openrouter/auto", taskType: string = "reasoning"): Promise<any> {
  const override = handleFrontendLLMOverrideJSON(req);
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
      res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType });
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
    return parseJsonFromLlm(text);
  } catch (err: unknown) {
    if (!res.headersSent) {
      res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType });
    }
    throw new Error("RequireFrontendLLMException");
  }
}

export async function callOpenRouterText(req: any, res: any, systemPrompt: string, userPrompt: string, model: string = "openrouter/auto", taskType: string = "reasoning"): Promise<string> {
  const override = handleFrontendLLMOverride(req);
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
      res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType });
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
    return result.value.text;
  } catch (err: unknown) {
    if (!res.headersSent) {
      res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType });
    }
    throw new Error("RequireFrontendLLMException");
  }
}

export async function streamOpenRouterJSON(req: any, res: any, systemPrompt: string, userPrompt: string, model: string = "openrouter/auto", taskType: string = "reasoning") {
  const override = handleFrontendLLMOverrideJSON(req);
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
      res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType, stream: true });
    }
    return;
  }

  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
  }

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
    return parseJsonFromLlm(fullContent);
  } catch (err: unknown) {
    if (!res.headersSent) {
      res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType, stream: true });
      return;
    }
    throw err;
  }
}

export async function streamOpenRouterText(req: any, res: any, systemPrompt: string, userPrompt: string, model: string = "openrouter/auto", taskType: string = "reasoning") {
  const override = handleFrontendLLMOverride(req);
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
      res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType, stream: true });
    }
    return;
  }

  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
  }

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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

    return fullContent;
  } catch (err: unknown) {
    if (!res.headersSent) {
      res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType, stream: true });
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

export async function executeMultimodalAgentic(options: MultimodalAgenticOptions, req?: any): Promise<{ text: string; provider: string; model: string }> {
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

    return { text: full, provider: result.providerId, model: (result as any).value?.model || "" };
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
