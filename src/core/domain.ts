export type EntityId = string;
export type ISODateString = string;

export interface AuditStamp {
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface UserIdentity extends AuditStamp {
  id: EntityId;
  username: string;
  displayName?: string;
  email?: string;
}

export interface ResearchWorkspace extends AuditStamp {
  id: EntityId;
  ownerId: EntityId;
  title: string;
  currentPhase?: string;
}

export interface KnowledgeSource extends AuditStamp {
  id: EntityId;
  title: string;
  sourceType: string;
  verified: boolean;
}

export interface CitationRecord extends AuditStamp {
  id: EntityId;
  title: string;
  doi?: string;
  url?: string;
  verificationStatus: "verified" | "partially_verified" | "unverified" | "needs_review";
}

