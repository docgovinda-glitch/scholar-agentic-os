import type { LiveSearchResult } from "../../services/liveSearchService";

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
  type: "ai" | "ai-access" | "vault" | "workspaces" | "projects" | "auth";
  label: string;
}

export interface WebsiteAssistantMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  action?: AssistantAction;
  followUps?: string[];
  mode?: "chat" | "search" | "deep-research" | "deliverable";
  provider?: string;
  model?: string;
  plan?: string[];
  citationStyle?: string;
  citations?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    domain?: string;
    publisher?: string;
    authorityBadge?: string;
    authorityTier?: string;
    source?: string;
    venue?: string;
    year?: number | string;
    author?: string;
    authors?: string[];
    doi?: string;
    isPrimary?: boolean;
    sourceType?: "official" | "scholarly" | "media" | "web" | "vault";
  }>;
  liveSources?: LiveSearchResult[];
  attachments?: Array<{ name: string; isImage: boolean; previewUrl?: string }>;
  error?: boolean;
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

export type WebsiteCitationItem = NonNullable<WebsiteAssistantMessage["citations"]>[number];

export type DashboardView = "projects" | "vault" | "ai-access";
