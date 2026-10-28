import { authedFetch, authedJsonFetch } from "./client";
import type { AgenticQueryRequest, AgenticQueryResponse } from "./types";
import type {
  WordBudgetBlueprint,
  UserDatasetItem,
  PreFlightGateScorecard,
} from "../workspace/types";

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
    const errorMsg = (errorBody as { error?: string }).error || `AI Request failed with status ${res.status}`;
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
    contextPrompt?: string;
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

export async function polishProjectManuscript(
  projectId: string,
  payload: { text: string; dialect?: "en-GB" | "en-US" }
): Promise<{
  ok: boolean;
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

export async function runPreFlightComplianceAudit(projectId: string): Promise<{
  ok: boolean;
  data: PreFlightGateScorecard;
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agent/publication-readiness`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to execute pre-flight compliance audit");
  }
  return res.json();
}

export async function exportProjectManuscript(
  projectId: string,
  payload: {
    format: string;
    template?: string;
    citationStyle?: string;
    includeRebuttalAppendix?: boolean;
    manuscript?: string;
  }
): Promise<{
  ok: boolean;
  data: {
    success: boolean;
    filename: string;
    downloadUrl: string;
    pdfUrl?: string;
    docxUrl?: string;
    rebuttalLetterUrl?: string;
    latexUrl?: string;
    typstUrl?: string;
    byteSize: number;
    formatsAvailable: string[];
    generatedAt: string;
  };
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agent/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to compile export package");
  }
  return res.json();
}

export async function downloadProjectExportBlob(
  projectId: string,
  format: string,
  options?: { template?: string; includeRebuttalAppendix?: boolean }
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

export interface ProposalCriterionResult {
  criterion: string;
  score: number;
  verdict: string;
  critique: string;
  recommendation: string;
}

export interface StudySectionSimulationResponse {
  projectId: string;
  agency: string;
  mechanism: string;
  overallImpactScore: string;
  recommendationForFunding: string;
  criteria: ProposalCriterionResult[];
  auditedAt: string;
}

export async function simulateStudySectionReview(
  projectId: string,
  payload: Record<string, unknown>
): Promise<StudySectionSimulationResponse> {
  const res = await authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/proposal/simulate-review`,
    "POST",
    payload
  );
  if (!res.ok) {
    throw new Error(`Failed to simulate study section review: HTTP ${res.status}`);
  }
  return res.json();
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

export async function simulateVivaDefense(
  projectId: string,
  payload: Record<string, unknown>
): Promise<VivaSimulationResponse> {
  const res = await authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/thesis/simulate-viva`,
    "POST",
    payload
  );
  if (!res.ok) {
    throw new Error(`Failed to simulate Viva Voce defense: HTTP ${res.status}`);
  }
  return res.json();
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

export async function auditThesisChapters(
  projectId: string,
  payload: Record<string, unknown>
): Promise<ThesisChapterAuditResponse> {
  const res = await authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/thesis/audit-chapters`,
    "POST",
    payload
  );
  if (!res.ok) {
    throw new Error(`Failed to audit thesis chapters: HTTP ${res.status}`);
  }
  return res.json();
}

