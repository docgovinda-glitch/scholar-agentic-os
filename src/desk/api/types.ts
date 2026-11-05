import type {
  Author,
  CanonicalDocument,
  Claim,
  ClaimEvidenceBinding,
  ClaimEvidenceGraph,
  CoverLetter,
  DiscoveredSource,
  EvidenceConflict,
  EvidenceLedger,
  EvidenceLocator,
  GateSummary,
  GenerationJob,
  InterventionLevel,
  JournalRequirements,
  JournalRequirementsProposal,
  OutputTypeSpec,
  OutputTypeSummary,
  PeerReviewHistory,
  ProjectView,
  ReviewLens,
  RubricReport,
  StudioRefineResult,
  SubmissionRecord,
  SupportStrength,
  VoiceProfile,
} from "../types";

export type ClaimGraphMutationResult = ProjectView & {
  claimGraph: ClaimEvidenceGraph;
  rubric?: RubricReport;
};

export interface AiOperationalStatus {
  connected: boolean;
  statusText: string;
  provider?: string;
  model?: string;
  isFallback?: boolean;
  capabilities: {
    text: boolean;
    vision: boolean;
    document: boolean;
    webSearch: boolean;
    deepResearch: boolean;
  };
  providers: Array<{
    id: string;
    name: string;
    model: string;
    tier: string;
  }>;
}

export interface ResearchStageTelemetry {
  id: "planning" | "discovery" | "retrieval" | "analysis" | "iteration" | "synthesis" | "followup";
  label: string;
  status: "completed" | "skipped";
  summary: string;
  sourcesCount?: number;
}

export interface AgenticQueryRequest {
  prompt: string;
  systemPrompt?: string;
  mode?: "normal" | "search" | "deep-research";
  citationStyle?: string;
  answerLength?: "concise" | "standard" | "detailed";
  approvedSubQuestions?: string[];
  preRetrievedSources?: Array<{
    id?: string;
    title: string;
    url?: string;
    doi?: string;
    snippet?: string;
    authors?: string[];
    year?: number | string;
    publicationDate?: string;
    venue?: string;
    journal?: string;
    openAccessUrl?: string;
    source?: string;
    sourceType?: string;
  }>;
  files?: Array<{ name: string; text?: string; content?: string; type?: string; size?: number }>;
  images?: Array<{ data?: string; dataUrl?: string; mimeType?: string; name?: string }>;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  vaultSources?: Array<{
    id?: string;
    title: string;
    authors?: string[];
    year?: number | string;
    doi?: string;
    url?: string;
    venue?: string;
    notes?: string;
  }>;
  onChunk?: (chunk: string) => void;
  onStageUpdate?: (update: { status: string; stage?: any }) => void;
}

export interface AgenticQueryResponse {
  ok: boolean;
  text: string;
  mode?: string;
  provider?: string;
  model?: string;
  plan?: string[];
  stages?: ResearchStageTelemetry[];
  citations?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    source?: string;
    venue?: string;
    year?: number | string;
    doi?: string;
    authorityBadge?: string;
    authorityTier?: string;
    domain?: string;
    publisher?: string;
    author?: string;
    authors?: string[];
    isPrimary?: boolean;
    sourceType?: "official" | "scholarly" | "media" | "web" | "vault";
    stance?: "supporting" | "contradicting" | "mentioning";
  }>;
  citationStyle?: string;
  followUps?: string[];
  error?: string;
  wordCount?: number;
  verifiedSourcesCount?: number;
  peerReviewAudit?: {
    overallVerdict: string;
    rigorScore: number;
    critiques: Array<{
      type: "methodology" | "bias" | "counter_argument" | "sample_size" | "generalizability";
      title: string;
      explanation: string;
      severity: "low" | "medium" | "high";
    }>;
    methodologicalStrengths: string[];
    counterTheories: string[];
  };
  burstinessMetrics?: {
    averageLength: number;
    variance: number;
    burstinessScore: number;
    isSufficientlyBurst: boolean;
  };
  recommendedWorkspaceHandoff?: {
    targetFormatId: "OT-01" | "OT-10" | "OT-19" | "OT-09" | "OT-22";
    formatLabel: string;
    topic: string;
    suggestedTitle: string;
    wordCountTarget?: number;
    citationStyle: string;
    retrievedSources: Array<{
      title: string;
      authors: string[];
      year?: number | string;
      doi?: string;
      url?: string;
      venue?: string;
    }>;
  };
}
