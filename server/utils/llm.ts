import dotenv from 'dotenv';
import { completeWithFailover, streamWithFailover } from "../../src/platform/gateway/gateway.js";
import { defaultPolicy } from "../../src/platform/warden/policy.js";
import type { TaskClass } from "../../src/platform/warden/types.js";
import type { CandidateProvider } from "../../src/platform/gateway/types.js";
import { getEntitlement, isEntitlementActive } from "../src/aiEngine/entitlements.js";

dotenv.config();

export function mapTaskType(taskType: string): TaskClass {
  const valid: TaskClass[] = ["drafting", "refinement", "chat", "summarisation", "verification", "rule_extraction", "discovery", "embedding", "classification"];
  return valid.includes(taskType as TaskClass) ? (taskType as TaskClass) : "chat";
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
    candidates.push({ provider: "gemini", apiKey: process.env.GEMINI_API_KEY });
  }
  
  return candidates;
}

export interface PremiumAiPolicy {
  status: "not_configured" | "active" | "suspended";
  isServerAiAuthorized: boolean;
  reason?: string;
}

export function getPremiumAiPolicy(): PremiumAiPolicy {
  // Business plan / quota rules are not defined yet.
  return {
    status: "not_configured",
    isServerAiAuthorized: false,
    reason: "Premium AI server policy is pending configuration."
  };
}

export async function isServerAiAuthorized(req: any): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) return false;
  try {
    const entitlement = await getEntitlement(userId);
    if (!isEntitlementActive(entitlement)) return false;
    const policy = getPremiumAiPolicy();
    return policy.isServerAiAuthorized;
  } catch (_) {
    return false;
  }
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
      defaultPolicy()
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
      defaultPolicy()
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
      defaultPolicy()
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
      defaultPolicy()
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
