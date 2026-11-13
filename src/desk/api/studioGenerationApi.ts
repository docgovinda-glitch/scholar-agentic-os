import { runAiText } from "../ai/aiRun";
import { liveAiStatus } from "../ai/liveAiStatus";
import { authedFetch, authedJsonFetch, json, UnauthenticatedError } from "./client";
import { providersWithStoredKey } from "../../services/userAiSettings";
import type {
  CoverLetter,
  GateSummary,
  GenerationJob,
  InterventionLevel,
  JournalRequirementsProposal,
  PeerReviewHistory,
  ReviewLens,
  StudioRefineResult,
  VoiceProfile,
} from "../types";
import type { AiOperationalStatus } from "./types";

/** The server answered that no AI connection is set up (HTTP 400, code ai_provider_required). */
export class StudioNoAiSourceError extends Error {
  readonly kind = "no_ai_source" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "StudioNoAiSourceError";
  }
}

/**
 * POSTs an AI feature. When the user's next model is on their own computer the
 * server cannot reach it and answers 426 with the exact prompt; the browser
 * runs it and re-sends the request with the result. A feature with several
 * model calls (coherence passes, review lenses) takes one round trip per call.
 */
async function postAi(url: string, body: Record<string, unknown>): Promise<Response> {
  const browserResults: Array<{ challengeToken: string; llmResult: string }> = [];
  for (let round = 0; round < 40; round++) {
    const res = await authedJsonFetch(url, "POST", { ...body, browserResults }, { skipLlmFallback: true });
    if (res.status !== 426) return res;
    const data = (await res.json().catch(() => null)) as { requireFrontendLLM?: boolean; challengeToken?: string; systemPrompt?: string; userPrompt?: string; taskType?: string } | null;
    if (!data?.requireFrontendLLM || !data.challengeToken) throw new Error("The server asked for a browser AI step it could not describe.");
    const run = liveAiStatus.begin();
    let llmResult: string;
    try {
      llmResult = await runAiText(
        { task: "reasoning", messages: [...(data.systemPrompt ? [{ role: "system" as const, content: data.systemPrompt }] : []), { role: "user" as const, content: data.userPrompt ?? "" }] },
        run.signal,
        (ev) => run.publish(ev)
      );
    } catch (err) {
      run.end(err);
      throw err;
    }
    run.end();
    browserResults.push({ challengeToken: data.challengeToken, llmResult });
  }
  throw new Error("This step needed more AI calls than expected and was stopped.");
}

/** Reads a JSON answer, turning "no AI connected" into StudioNoAiSourceError so panels can point to AI Access. */
async function aiJson<T>(res: Response): Promise<T> {
  if (res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
    if (body.code === "ai_provider_required") throw new StudioNoAiSourceError(body.error || "No AI is connected.");
    throw new Error(body.error || "Request failed (400)");
  }
  return json<T>(res);
}

export async function extractJournalRequirements(params: {
  projectId: string;
  guidelinesText: string;
}): Promise<{ proposal: JournalRequirementsProposal }> {
  const { projectId, ...requestBody } = params;
  const res = await postAi(`/api/projects/${encodeURIComponent(projectId)}/journal-requirements/extract`, requestBody);
  return aiJson<{ proposal: JournalRequirementsProposal }>(res);
}

export async function getManuscriptJob(projectId: string): Promise<GenerationJob | null> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/job`);
  if (res.status === 404) return null;
  return json<GenerationJob>(res);
}

export function startManuscriptJob(projectId: string): Promise<GenerationJob> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/start`, "POST", {}).then((r) => json(r));
}

export async function generateNextSection(params: {
  projectId: string;
}): Promise<{ generationJob: GenerationJob }> {
  const { projectId, ...requestBody } = params;
  const res = await postAi(`/api/projects/${encodeURIComponent(projectId)}/manuscript/next-section`, requestBody);
  return aiJson<{ generationJob: GenerationJob }>(res);
}

export async function runCoherenceCheck(params: {
  projectId: string;
}): Promise<{ generationJob: GenerationJob }> {
  const { projectId, ...requestBody } = params;
  const res = await postAi(`/api/projects/${encodeURIComponent(projectId)}/manuscript/coherence-check`, requestBody);
  return aiJson<{ generationJob: GenerationJob }>(res);
}

export function getPeerReviewHistory(projectId: string): Promise<PeerReviewHistory> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/peer-review`).then((r) => json(r));
}

export async function runPeerReview(params: {
  projectId: string;
  lenses?: ReviewLens[];
}): Promise<{ peerReviewHistory: PeerReviewHistory; gates: GateSummary[] }> {
  const { projectId, ...requestBody } = params;
  const res = await postAi(`/api/projects/${encodeURIComponent(projectId)}/manuscript/peer-review`, requestBody);
  return aiJson<{ peerReviewHistory: PeerReviewHistory; gates: GateSummary[] }>(res);
}

export function pauseManuscriptJob(projectId: string): Promise<GenerationJob> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/pause`, "POST", {}).then((r) => json(r));
}

export function resumeManuscriptJob(projectId: string): Promise<GenerationJob> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/resume`, "POST", {}).then((r) => json(r));
}

export async function getCoverLetter(projectId: string): Promise<CoverLetter | null> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/cover-letter`);
  if (res.status === 404) return null;
  return json<CoverLetter>(res);
}

export async function generateCoverLetter(params: {
  projectId: string;
}): Promise<{ coverLetter: CoverLetter }> {
  const { projectId, ...requestBody } = params;
  const res = await postAi(`/api/projects/${encodeURIComponent(projectId)}/cover-letter`, requestBody);
  return aiJson<{ coverLetter: CoverLetter }>(res);
}

export async function exportProject(projectId: string, format: "docx" | "odt" | "pdf"): Promise<Blob> {
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/export`, "POST", { format });
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Export failed" }));
    throw new Error((err as { error?: string }).error || "Export failed");
  }
  return res.blob();
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
        statusText: connected ? "Ready" : "AI Disconnected",
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
  } catch {}

  return {
    connected: hasClientByok,
    statusText: hasClientByok ? "Ready" : "AI Disconnected",
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
