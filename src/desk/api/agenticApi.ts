import { authedFetch, authedJsonFetch } from "./client";
import { readSse } from "../../shared/sseReader";
import type { AgenticQueryRequest, AgenticQueryResponse } from "./types";
import type {
  WordBudgetBlueprint,
  UserDatasetItem,
} from "../workspace/types";

/** Deep research failed after its sources were found; they are kept for the reader. */
export class DeepResearchPartialError extends Error {
  constructor(message: string, readonly retrieved: { citations: Array<Record<string, unknown>> }) {
    super(message);
    this.name = "DeepResearchPartialError";
  }
}

export async function executeAgenticQuery(
  req: AgenticQueryRequest
): Promise<AgenticQueryResponse> {
  const payload = {
    prompt: req.prompt,
    systemPrompt: req.systemPrompt,
    mode: req.mode,
    citationStyle: req.citationStyle,
    answerLength: req.answerLength,
    approvedSubQuestions: req.approvedSubQuestions,
    excludedSources: req.excludedSources,
    preRetrievedSources: req.preRetrievedSources,
    files: req.files,
    images: req.images,
    history: req.history,
    vaultSources: req.vaultSources,
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.mode === "deep-research" && req.onStageUpdate) {
    headers["Accept"] = "text/event-stream, application/json";
  }

  const res = await authedFetch("/api/ai/agent", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    if (res.status === 524 || res.status === 504) {
      throw new Error(`The AI provider took too long to respond (${res.status}), so nothing was produced. Try again, or choose a faster model in AI Access.`);
    }
    const errorMsg = (errorBody as { error?: string }).error || `AI Request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  const isEventStream = Boolean(res.headers.get("content-type")?.includes("text/event-stream"));
  if (isEventStream && res.body) {
    // Set from inside the reader's callback.
    const got: { payload: AgenticQueryResponse | null; error: string; sources: Array<Record<string, unknown>> } = { payload: null, error: "", sources: [] };
    await readSse(res.body, (m) => {
      if (!m.json || !m.data || typeof m.data !== "object") return;
      const parsed = m.data as { type?: string; status?: string; stage?: string; payload?: AgenticQueryResponse; message?: unknown; citations?: Array<Record<string, unknown>> };
      if (parsed.type === "stage" && req.onStageUpdate) {
        req.onStageUpdate({ status: parsed.status, stage: parsed.stage } as Parameters<NonNullable<typeof req.onStageUpdate>>[0]);
      } else if (parsed.type === "sources" && Array.isArray(parsed.citations)) {
        got.sources = parsed.citations;
      } else if (parsed.type === "complete" && parsed.payload) {
        got.payload = parsed.payload;
      } else if (parsed.type === "error") {
        got.error = typeof parsed.message === "string" && parsed.message ? parsed.message : "Deep research stopped before it finished. Try again.";
      }
    });

    const finalPayload = got.payload;
    const streamError = got.error;
    if (finalPayload) {
      if (finalPayload.text && req.onChunk) {
        req.onChunk(finalPayload.text);
      }
      return finalPayload;
    }
    // The stream ended without a result: say why (its body is already read).
    const stopped = streamError || "Deep research stopped before it finished. Try again.";
    if (got.sources.length > 0) throw new DeepResearchPartialError(stopped, { citations: got.sources });
    throw new Error(stopped);
  }

  const data = await res.json();
  if (data.ok && data.text && req.onChunk) {
    // Deliver progressive chunks so the response streams smoothly into the reading canvas
    const words = String(data.text).split(/(\s+)/);
    const step = Math.max(8, Math.ceil(words.length / 18));
    for (let i = 0; i < words.length; i += step) {
      req.onChunk(words.slice(i, i + step).join(""));
    }
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
    } catch {}
  }

  const formData = new FormData();
  formData.append("file", file);
  const res = await authedFetch("/api/vault/parse-file", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as { error?: string }).error || `Could not parse file ${file.name}`);
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

export async function allocateProjectWordBudget(
  projectId: string,
  targetTotalWords: number,
  template: string = "IMRaD"
): Promise<{ ok: boolean; blueprint: WordBudgetBlueprint }> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/allocate-budget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetTotalWords, template }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to allocate word budget");
  }
  return res.json();
}

export async function uploadProjectUserData(
  projectId: string,
  payload: FormData | { rawText: string; title?: string; author?: string; format?: string; assignedSectionId?: string; epistemicRole?: string }
): Promise<{ ok: boolean; dataset: UserDatasetItem; totalDatasets: number }> {
  const isFormData = payload instanceof FormData;
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/upload-user-data`, {
    method: "POST",
    headers: isFormData ? undefined : { "Content-Type": "application/json" },
    body: isFormData ? payload : JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to upload primary user data");
  }
  return res.json();
}

export async function updateProjectUserData(
  projectId: string,
  dataId: string,
  updates: { assignedSectionId?: string; epistemicRole?: string; extractedFindings?: string }
): Promise<{ ok: boolean; dataset: UserDatasetItem }> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/user-data/${encodeURIComponent(dataId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to update user dataset");
  }
  return res.json();
}

export async function draftProjectSubSection(
  projectId: string,
  payload: {
    sectionId: string;
    subSectionId: string;
    subSectionTitle: string;
    targetWords?: number;
    dialect?: "en-GB" | "en-US";
    /** What this kind of section has to do. */
    sectionBrief?: string;
    /** What the author typed for this draft. */
    authorGuidance?: string;
    /** Excerpts of the sections already written, so the draft agrees with them. */
    writtenSections?: string;
    /** The only sources the draft may cite (an empty list means none). */
    assignedSources?: Array<{
      id: string;
      authors: string[] | string;
      year: number | string;
      title: string;
      doi?: string;
      url?: string;
      stance?: "Supporting" | "Contrasting" | "Methodological";
      keyFindings?: string;
    }>;
  }
): Promise<{
  ok: boolean;
  subSectionId: string;
  content: string;
  actualWords: number;
  warnings?: Array<{ sentence: string; eventYear: number; pubYear: number; sourceId: string; warning: string }>;
  unverifiedClaimsCount?: number;
  resolvedCitationsCount?: number;
  citedSources?: Array<{ id: string; title: string }>;
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/draft-subsection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to draft sub-section");
  }
  return res.json();
}

/**
 * Polishes a passage (`text`): the result comes back for the author to review
 * and nothing is saved. `manuscript` (or neither) polishes and saves the
 * whole manuscript.
 */
export async function polishProjectManuscript(
  projectId: string,
  payload: { text: string; dialect?: "en-GB" | "en-US" } | { manuscript?: string; dialect?: "en-GB" | "en-US" }
): Promise<{
  ok: boolean;
  scope: "passage" | "manuscript";
  saved: boolean;
  polishedText: string;
  burstinessBefore?: { burstinessScore: number; isSufficientlyBurst: boolean };
  burstinessAfter?: { burstinessScore: number; isSufficientlyBurst: boolean };
  burstinessDelta?: number;
  styleCorrections?: string[];
  telemetry?: {
    wordCountBefore: number;
    wordCountAfter: number;
    fleschKincaidGrade: number;
    readingTimeMinutes: number;
  };
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/final-editor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to polish manuscript");
  }
  return res.json();
}

export async function simulateFiveRefereeReview(
  projectId: string
): Promise<{
  ok?: boolean;
  data: Array<{
    id: string;
    referee: "Methodologist" | "Domain Specialist" | "Biostatistician" | "Synthesizer" | "Formal Editor";
    lens: string;
    section: string;
    severity: "Major" | "Moderate" | "Minor";
    feedback: string;
    revisionDirective: string;
  }>;
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/peer-review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to simulate peer review");
  }
  return res.json();
}

export async function generateProjectRebuttalMatrix(
  projectId: string,
  critiques?: Array<{
    id: string;
    referee: string;
    lens: string;
    section: string;
    severity: string;
    feedback: string;
    revisionDirective: string;
  }>
): Promise<{
  ok?: boolean;
  matrix: Array<{
    id: string;
    referee: "Methodologist" | "Domain Specialist" | "Biostatistician" | "Synthesizer" | "Formal Editor";
    lens: string;
    section: string;
    critique: string;
    severity: "Major" | "Moderate" | "Minor";
    authorResponse: string;
    revisionAction: string;
    diff?: { find: string; replace: string };
    status: "addressed" | "Accepted & Revised" | "Rebutted with Evidence" | "Clarified in Text";
  }>;
  patches?: Array<{
    id: string;
    section: string;
    critiqueLens?: string;
    severity?: string;
    find: string;
    replace: string;
    explanation: string;
    accepted: boolean;
  }>;
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/rebuttal-matrix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ critiques }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to generate rebuttal matrix");
  }
  return res.json();
}

export async function downloadProjectExportBlob(
  projectId: string,
  format: string,
  options?: { template?: string; includeRebuttalAppendix?: boolean; manuscriptMarkdown?: string; layout?: "review" | "two_column"; lineNumbers?: boolean }
): Promise<Blob> {
  const url = `/api/projects/${encodeURIComponent(projectId)}/export/${encodeURIComponent(format)}`;
  const res = await authedFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept:
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/octet-stream"
          : format === "pdf"
          ? "application/pdf, application/octet-stream"
          : "*/*",
    },
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) {
    throw new Error(`Failed to download ${format} file: HTTP ${res.status}`);
  }
  return res.blob();
}

export async function downloadRefereeResponseLetterBlob(
  projectId: string
): Promise<Blob> {
  const res = await authedFetch(
    `/api/projects/${encodeURIComponent(projectId)}/export/rebuttal-letter`,
    {
      method: "POST",
      headers: {
        Accept:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/octet-stream",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to download Referee Response Letter: HTTP ${res.status}`);
  }
  return res.blob();
}

/** Reads the server's own error message so the user sees why nothing was produced. */
async function apiError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return new Error(body.error);
  } catch {
    // Non-JSON error body.
  }
  return new Error(`${fallback} (HTTP ${res.status}).`);
}

export interface VivaQuestionItem {
  id: string;
  category: string;
  examinerQuestion: string;
  assessmentFocus: string;
  suggestedRebuttalStructure: string[];
}

export interface VivaSimulationResponse {
  projectId: string;
  degreeLevel: string;
  examinerPersona: string;
  examinerRigorScore: string;
  questions: VivaQuestionItem[];
  generatedAt: string;
}

export interface VivaSimulationRequest {
  title: string;
  degreeLevel?: string;
  researchQuestions: string[];
  theoreticalFramework?: string;
  methodology?: string;
}

export async function simulateVivaDefense(
  projectId: string,
  payload: VivaSimulationRequest
): Promise<VivaSimulationResponse> {
  const res = await authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/thesis/viva-simulate`,
    "POST",
    payload
  );
  if (!res.ok) throw await apiError(res, "The viva simulation could not be run");
  const body = (await res.json()) as Pick<VivaSimulationResponse, "examinerPersona" | "examinerRigorScore" | "questions">;
  return {
    projectId,
    degreeLevel: payload.degreeLevel ?? "",
    examinerPersona: body.examinerPersona ?? "",
    examinerRigorScore: body.examinerRigorScore ?? "",
    questions: Array.isArray(body.questions) ? body.questions : [],
    generatedAt: new Date().toISOString(),
  };
}

export interface ThesisChapterDraftRequest {
  chapterNumber: number;
  chapterTitle: string;
  targetWords: number;
  /** Optional guidance from the student (what this chapter must cover). */
  prompt?: string;
}

export interface ThesisChapterDraftResponse {
  content: string;
  bibliography: string;
  wordCount: number;
  citedSourcesCount: number;
}

/** Drafts one chapter with the user's AI, grounded in retrieved and Vault sources. */
export async function draftThesisChapter(projectId: string, payload: ThesisChapterDraftRequest): Promise<ThesisChapterDraftResponse> {
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/thesis/draft-chapter`, "POST", payload);
  if (!res.ok) throw await apiError(res, "The chapter could not be drafted");
  const body = (await res.json()) as Partial<ThesisChapterDraftResponse>;
  if (typeof body.content !== "string" || !body.content.trim()) throw new Error("The AI returned an empty chapter. Nothing was changed.");
  return {
    content: body.content,
    bibliography: typeof body.bibliography === "string" ? body.bibliography : "",
    wordCount: typeof body.wordCount === "number" ? body.wordCount : 0,
    citedSourcesCount: typeof body.citedSourcesCount === "number" ? body.citedSourcesCount : 0,
  };
}

export interface ThesisChapterAuditResponse {
  projectId: string;
  alignmentScore: number;
  coherenceStatus: string;
  crossChapterChecks: Array<{
    check: string;
    status: "passed" | "warn" | "failed";
    details: string;
  }>;
  chapterSummaries?: Array<{
    chapterId: string;
    chapterTitle: string;
    g3Status: string;
    g4Status: string;
    g5Status: string;
  }>;
  auditedAt: string;
}

export interface ThesisChapterAuditRequest {
  chapters: Array<{
    chapterNumber: number;
    title: string;
    wordCount: number;
    targetWordCount: number;
    status: string;
  }>;
}

export async function auditThesisChapters(
  projectId: string,
  payload: ThesisChapterAuditRequest
): Promise<ThesisChapterAuditResponse> {
  const res = await authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/thesis/chapter-audit`,
    "POST",
    payload
  );
  if (!res.ok) throw await apiError(res, "The chapter audit could not be run");
  const body = (await res.json()) as {
    audit?: {
      alignmentScore: number;
      coherenceStatus: string;
      crossChapterChecks: Array<{ check: string; status: "passed" | "warn" | "fail"; details: string }>;
    };
    chapterSummaries?: ThesisChapterAuditResponse["chapterSummaries"];
  };
  if (!body.audit) throw new Error("The chapter audit returned no result.");
  return {
    projectId,
    alignmentScore: body.audit.alignmentScore,
    coherenceStatus: body.audit.coherenceStatus,
    crossChapterChecks: body.audit.crossChapterChecks.map((c) => ({
      ...c,
      status: c.status === "fail" ? "failed" : c.status,
    })),
    chapterSummaries: body.chapterSummaries,
    auditedAt: new Date().toISOString(),
  };
}

/** The model's own Deep Research plan for a question; `fromModel: false` when no model could write one. */
export async function fetchDeepResearchPlan(question: string): Promise<{ fromModel: boolean; subQuestions: string[] }> {
  try {
    const res = await authedJsonFetch("/api/ai/deep-research/plan", "POST", { question }, { skipLlmFallback: true });
    if (!res.ok) return { fromModel: false, subQuestions: [] };
    const data = (await res.json()) as { fromModel?: unknown; subQuestions?: unknown };
    const subQuestions = Array.isArray(data.subQuestions)
      ? data.subQuestions.filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, 6)
      : [];
    return { fromModel: data.fromModel === true && subQuestions.length > 0, subQuestions };
  } catch {
    return { fromModel: false, subQuestions: [] };
  }
}

/** The model's decision on whether a question needs a search, with a standalone query. null: use the routing rules. */
export async function fetchAskSearchPlan(question: string, previousQuestions: string[]): Promise<{ search: boolean; query: string } | null> {
  try {
    const res = await authedFetch("/api/ai/ask/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, previousQuestions: previousQuestions.slice(-3) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { plan?: { search?: boolean; query?: string } | null };
    return body.plan && typeof body.plan.search === "boolean" ? { search: body.plan.search, query: body.plan.query ?? "" } : null;
  } catch {
    return null;
  }
}
