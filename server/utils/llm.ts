import dotenv from 'dotenv';
import { completeWithFailover, streamWithFailover } from "../../src/platform/gateway/gateway.js";
import { defaultPolicy } from "../../src/platform/warden/policy.js";
import type { TaskClass } from "../../src/platform/warden/types.js";
import type { CandidateProvider } from "../../src/platform/gateway/types.js";

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

function handleFrontendLLMOverrideJSON(req: any) {
  const content = handleFrontendLLMOverride(req);
  if (content) {
    if (typeof content === "string") {
      const cleanContent = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      try {
        return JSON.parse(cleanContent);
      } catch (err) {
        throw new Error("Invalid JSON returned by LLM");
      }
    }
    return content;
  }
  return null;
}

export async function callOpenRouterJSON(req: any, res: any, systemPrompt: string, userPrompt: string, model: string = "openrouter/auto", taskType: string = "reasoning"): Promise<any> {
  const override = handleFrontendLLMOverrideJSON(req);
  if (override) return override;

  const candidates = getCandidates();
  if (candidates.length === 0) {
    if (!res.headersSent) res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType });
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
    
    const text = (result.ok ? result.value.text : "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    return JSON.parse(text);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType });
    }
    throw new Error("RequireFrontendLLMException");
  }
}

export async function callOpenRouterText(req: any, res: any, systemPrompt: string, userPrompt: string, model: string = "openrouter/auto", taskType: string = "reasoning"): Promise<string> {
  const override = handleFrontendLLMOverride(req);
  if (override) return override;

  const candidates = getCandidates();
  if (candidates.length === 0) {
    if (!res.headersSent) res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType });
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
    return result.ok ? result.value.text : "";
  } catch (err: any) {
    if (!res.headersSent) res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType });
    throw new Error("RequireFrontendLLMException");
  }
}

export async function streamOpenRouterJSON(req: any, res: any, systemPrompt: string, userPrompt: string, model: string = "openrouter/auto", taskType: string = "reasoning") {
  const candidates = getCandidates();
  if (candidates.length === 0) {
    res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType, stream: true });
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
    await streamWithFailover(
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

    sendEvent("log", { message: "> Parsing final JSON..." });
    const cleanText = fullContent.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    return JSON.parse(cleanText);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType, stream: true });
      return;
    }
    throw err;
  }
}

export async function streamOpenRouterText(req: any, res: any, systemPrompt: string, userPrompt: string, model: string = "openrouter/auto", taskType: string = "reasoning") {
  const candidates = getCandidates();
  if (candidates.length === 0) {
    res.status(426).json({ requireFrontendLLM: true, systemPrompt, userPrompt, taskType, stream: true });
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
    await streamWithFailover(
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

    return fullContent;
  } catch (err: any) {
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
