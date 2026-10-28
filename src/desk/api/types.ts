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

export interface AgenticQueryRequest {
  prompt: string;
  systemPrompt?: string;
  mode?: "normal" | "search" | "deep-research";
  citationStyle?: string;
  files?: Array<{ name: string; text?: string; content?: string; type?: string; size?: number }>;
  images?: Array<{ data?: string; dataUrl?: string; mimeType?: string; name?: string }>;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  onChunk?: (chunk: string) => void;
}

export interface AgenticQueryResponse {
  ok: boolean;
  text: string;
  mode?: string;
  provider?: string;
  model?: string;
  plan?: string[];
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
  }>;
  citationStyle?: string;
  followUps?: string[];
  error?: string;
  wordCount?: number;
  verifiedSourcesCount?: number;
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
