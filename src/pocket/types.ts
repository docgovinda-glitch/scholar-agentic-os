/**
 * Pocket client-side types — mobile-specific extensions to the data model.
 * Mirrors server shapes for approval queue, notifications, and mobile state.
 */

import type { ProjectView, Block } from "../desk/types";

export type PocketTab = "home" | "projects" | "search" | "me";

export interface ApprovalCandidate {
  id: string;
  title: string;
  authors: string[];
  venue?: string;
  year?: number;
  doi?: string;
  summary?: string;
  authenticityChecks: {
    doiResolves: boolean;
    publisherVerified: boolean;
    notRetracted: boolean;
    journalRanking?: string;
  };
  citationString: string;
  pdfUrl?: string;
  reasonSuggested?: string;
  position: number;
  total: number;
}

export interface ApprovalQueueState {
  candidates: ApprovalCandidate[];
  currentIndex: number;
  approvedCount: number;
  rejectedCount: number;
}

export interface NotificationPreferences {
  runComplete: boolean;
  gateReady: boolean;
  sourcesWaiting: boolean;
  securityEvents: boolean;
}

export interface PocketUser {
  id: string;
  name: string;
  email: string;
  notificationPreferences: NotificationPreferences;
  darkMode: boolean;
}

export interface PocketProject extends ProjectView {
  /**
   * Human-readable project name. ProjectView carries only `projectId` (a
   * UUID), which the tabs were rendering as the heading — every card showed
   * a raw identifier instead of the paper's title.
   */
  title: string;
  lastModified: Date;
  unreadComments: number;
  pendingStudioChanges: number;
  sourcesAwaitingApproval: number;
}
