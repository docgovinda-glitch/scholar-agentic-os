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

export function getCandidates(): CandidateProvider[] {
  const candidates: CandidateProvider[] = [];
  
  if (process.env.OPENROUTER_API_KEY) {
    candidates.push({ provider: "openrouter", apiKey: process.env.OPENROUTER_API_KEY });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    candidates.push({ provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY });
  }
  if (process.env.GEMINI_API_KEY) {
    candidates.push({ provider: "gemini", apiKey: process.env.GEMINI_API_KEY, model: "gemini-2.5-flash" });
    candidates.push({ provider: "gemini", apiKey: process.env.GEMINI_API_KEY, model: "gemini-3-flash-preview" });
    candidates.push({ provider: "gemini", apiKey: process.env.GEMINI_API_KEY, model: "gemini-3.5-flash" });
    candidates.push({ provider: "gemini", apiKey: process.env.GEMINI_API_KEY, model: "gemini-flash-latest" });
  }
  
  return candidates;
}

export interface PremiumAiPolicy {
  status: "not_configured" | "active" | "suspended";
  isServerAiAuthorized: boolean;
  reason?: string;
}

export function getPremiumAiPolicy(): PremiumAiPolicy {
  const isExplicitlyDisabled = process.env.ENABLE_SERVER_AI === "false";
  const candidates = getCandidates();
  const hasCredentials = candidates.length > 0;

  if (isExplicitlyDisabled) {
    return {
      status: "suspended",
      isServerAiAuthorized: false,
      reason: "Server AI is explicitly disabled by environment configuration.",
    };
  }

  if (!hasCredentials) {
    return {
      status: "not_configured",
      isServerAiAuthorized: false,
      reason: "No server-side AI provider API keys (OPENROUTER_API_KEY, GEMINI_API_KEY, etc.) are configured.",
    };
  }

  return {
    status: "active",
    isServerAiAuthorized: true,
  };
}

export async function isServerAiAuthorized(req: any): Promise<boolean> {
  const policy = getPremiumAiPolicy();
  if (!policy.isServerAiAuthorized) return false;

  const userId = req?.user?.id;
  if (!userId) return true; // session-less or direct server request

  try {
    const entitlement = await getEntitlement(userId);
    if (entitlement && isEntitlementActive(entitlement)) return true;
  } catch (_) {
    // If Supabase is unreachable, gracefully fall back to server-authorized AI
  }

  return true;
}

function handleFrontendLLMOverride(req: any) {
  if (req.body && req.body.llmResult) {
    let content = req.body.llmResult;
    if (typeof content === "object" && typeof content.text === "string") {
      content = content.text;
    }
    return content;
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

  const serverAuthorized = await isServerAiAuthorized(req);
  const candidates = serverAuthorized ? getCandidates() : [];

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

  const serverAuthorized = await isServerAiAuthorized(req);
  const candidates = serverAuthorized ? getCandidates() : [];

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

  const serverAuthorized = await isServerAiAuthorized(req);
  const candidates = serverAuthorized ? getCandidates() : [];

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

  const serverAuthorized = await isServerAiAuthorized(req);
  const candidates = serverAuthorized ? getCandidates() : [];

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

export async function executeMultimodalAgentic(options: MultimodalAgenticOptions): Promise<{ text: string; provider: string; model: string }> {
  const candidates = options.candidates && options.candidates.length > 0 ? options.candidates : getCandidates();
  if (candidates.length === 0) {
    throw new Error("No operational AI providers are configured on this server. Please set GEMINI_API_KEY or OPENROUTER_API_KEY.");
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

export async function generateGeminiEmbedding(text: string): Promise<number[]> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("GEMINI_API_KEY is required for embeddings");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`, {
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
