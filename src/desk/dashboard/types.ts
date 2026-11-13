import type { LiveSearchResult } from "../../services/liveSearchService";
import type { ResearchStageTelemetry } from "../api/types";
import type { CSLItem, ExcludedSourceRecord } from "../../citation_compliance/cslEngine";

export interface Attachment {
  file: File;
  previewUrl?: string;
}

export interface AgentAttachmentItem {
  id: string;
  name: string;
  isImage: boolean;
  size: number;
  fileData?: { name: string; text: string; type: string };
  imageData?: { data: string; dataUrl?: string; mimeType: string; name: string };
  previewUrl?: string;
}

export interface AssistantAction {
  type: "ai" | "ai-access" | "vault" | "workspaces" | "projects" | "auth" | "retry";
  label: string;
  /** For "retry": the question to ask again, and how. */
  query?: string;
  mode?: "normal" | "search" | "deep-research";
}

export interface WebsiteAssistantMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  action?: AssistantAction;
  followUps?: string[];
  mode?: "chat" | "search" | "deep-research" | "deliverable";
  /** A built-in help/platform answer rather than a research answer: no export, citation or vault actions. */
  kind?: "help";
  provider?: string;
  model?: string;
  plan?: string[];
  stages?: ResearchStageTelemetry[];
  citationStyle?: string;
  originatingQuestion?: string;
  discipline?: string;
  searchedCount?: number;
  readCount?: number;
  citedCount?: number;
  excludedSources?: ExcludedSourceRecord[];
  cslItems?: CSLItem[];
  deepResearchState?: {
    phase:
      | "plan_proposed"
      | "plan_approved"
      | "searching"
      | "reading"
      | "synthesizing"
      | "report_ready";
    subQuestions: string[];
    searchedCount?: number;
    readCount?: number;
    citedCount?: number;
  };
  citations?: Array<{
    id?: string;
    sourceId?: string;
    title?: string;
    url?: string;
    snippet?: string;
    domain?: string;
    publisher?: string;
    authorityBadge?: string;
    authorityTier?: string;
    source?: string;
    venue?: string;
    journal?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    year?: number | string;
    publishedDate?: string;
    publicationDate?: string;
    author?: string;
    authors?: string[];
    doi?: string;
    isPrimary?: boolean;
    sourceType?: "official" | "scholarly" | "media" | "web" | "vault" | string;
    credibilityLevel?: "high" | "moderate" | "preprint - not peer-reviewed";
    openAccessUrl?: string;
    isRetracted?: boolean;
    limitationNote?: string;
    csl?: CSLItem;
    stance?: "supporting" | "contradicting" | "mentioning";
    claim?: string;
    evidenceSnippet?: string;
    mainFinding?: string;
  }>;
  liveSources?: LiveSearchResult[];
  /** When the search behind this answer ran (shown with its sources). */
  searchedAt?: string;
  attachments?: Array<{ name: string; isImage: boolean; previewUrl?: string }>;
  error?: boolean;
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
    targetFormatId: "OT-01" | "OT-10" | "OT-15" | "OT-07" | "OT-22";
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

export type WebsiteCitationItem = NonNullable<WebsiteAssistantMessage["citations"]>[number];

export type DashboardView = "projects" | "vault" | "ai-access";
