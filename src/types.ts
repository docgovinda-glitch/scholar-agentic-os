export const PROFILE_STATE_PREFIX = "phd_profile_state_";
export const PROFILES_LIST_KEY = "phd_profiles_meta";
export const DEFAULT_STATE = (username: string): PaperProject => ({
  id: `${username}-${Date.now()}`,
  title: "",
  objectives: "",
  researchQuestions: "",
  researchGap: "",
  methodology: "",
  field: "",
  keywords: "",
  preferredJournalScope: "",
  articleType: "",
  outputFormat: "",
  dissertationMaterials: "",
  styleAspiration: "",
  authorDetails: "",
  authorName: "",
  orcidId: "",
  authorAffiliation: "",
  authorEmail: "",
  coAuthorName: "",
  coAuthorOrcidId: "",
  coAuthorAffiliation: "",
  coAuthorEmail: "",
  currentPhase: "A",
  aiSettings: { provider: "gemini" },
  sections: {},
});

export interface DiscoveredDataSource {
  name: string;
  url: string;
  type: "Quantitative" | "Qualitative" | "Mixed";
  relevance: string;
  reliability: string;
  limitations: string;
  approved: boolean;
}

export interface GroundingMap {
  conceptualFramework: string;
  keyConstructs: string[];
  theoreticalAssumptions: string[];
  reusableArguments: string[];
  relevantCitations: string[];
  consistentTerminology: string[];
  philosophicalAnchors: string;
  academicVoiceAdjustment: string;
}

export interface RecommendJournal {
  name: string;
  publisher: string;
  scopeFit: string;
  ranking: string;
  feeStatus: string;
  submissionOpenness: string;
  reviewContext: string;
  whyFit: string;
}

export interface ComplianceRules {
  wordCountGoal: string;
  citationStyle: string;
  formattingRules: string[];
  sectionStructure: string[];
  abstractRequirements: string;
  referencesRequirement: string;
  ethicalDisclosure: string;
  coverLetterNecessity: string;
}

export interface QCReport {
  complianceScore: number;
  rigorScore: number;
  alignmentWithDissertationScore: number;
  plagiarismOriginalityCheck: string;
  strengths: string[];
  weaknesses: string[];
  actionableEditsPlan: string[];
  citationAudit: string;
  ethicalVerification: string;
}

export interface SubmissionPack {
  coverLetter: string;
  submissionChecklist: string[];
  complianceSummary: string;
  responseToReviewersDraft: string;
}

// --- AI Gateway Types ---

export interface HealthStatus {
  provider: string;
  status: 'online' | 'offline' | 'degraded' | 'unchecked';
  latencyMs?: number;
  lastChecked?: string;
  availableModels?: string[];
  /**
   * Some UI uses `models` (older shape) while others use `availableModels`.
   * Keep both for type compatibility.
   */
  models?: string[];
  error?: string;
}

export interface AIProviderInfo {
  id: string;
  name: string;
  type: 'cloud' | 'local' | 'proxy';
  icon: string;
  description: string;
  defaultModel: string;
  availableModels: string[];
  requiresApiKey: boolean;
  pricingTier: 'free' | 'freemium' | 'paid';
  color: string;
}

export interface AIRequest {
  systemInstruction: string;
  prompt: string;
  temperature: number;
  responseMimeType?: string;
  taskType: string;
  model?: string;
}

export interface AIResponse {
  text: string;
  provider: string;
  model: string;
  inputWords: number;
  outputWords: number;
  latencyMs: number;
  fromFallback: boolean;
}

export interface AISettings {
  provider: "auto" | "server" | "gemini" | "openai" | "ollama" | "custom" | "claude" | "deepseek" | "cohere" | "qwen";
  ollamaModel?: string;
  ollamaEndpoint?: string;
  customModel?: string;
  customEndpoint?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  claudeApiKey?: string;
  claudeModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  cohereApiKey?: string;
  cohereModel?: string;
  qwenApiKey?: string;
  qwenModel?: string;
  
  // Gateway extensions
  providerHealth?: Record<string, HealthStatus>;
  fallbackOrder?: string[];
  aiReadiness?: 'validated' | 'simulated' | 'unchecked';
}

export interface ProjectVersion {
  id: string;
  timestamp: string;
  phase: string;
  data: any; // Serialized state of PaperProject
  description: string;
}

export interface ResponseLogItem {
  id: string;
  timestamp: string;
  phase: string;
  provider: string;
  model: string;
  prompt: string;
  response: string;
}

export interface WritingStyleProfile {
  id: string;
  name: string;
  description: string;
  terminology: string[];
  sentenceComplexity: string;
  citationStyle: string;
  sampleText: string;
  rawAnalysis?: any;
}

export type OnboardingStep = "login" | "ai-setup" | "knowledge-vault" | "workshop";

export interface UserProfile {
  username: string;
  passcodeHash?: string;
  projectState: PaperProject; // Primary / active project state for backward compatibility
  fullName?: string;
  email?: string;
  phone?: string;
  affiliation?: string;
  authenticId?: string;
  status?: "pending" | "approved";
  activationKeyHash?: string;
  pendingEmail?: string;
  pendingPhone?: string;
  pendingFullName?: string;
  pendingAffiliation?: string;
  pendingAuthenticId?: string;
  idDocument?: string;
  pendingIdDocument?: string;
  idDocumentName?: string;
  pendingIdDocumentName?: string;
  pendingUpdateKeyHash?: string;
  
  // Onboarding wizard state — persisted across refreshes
  onboardingStep?: OnboardingStep;
  
  // Multi-workspace & style personalization support
  projects?: PaperProject[];
  activeProjectId?: string;
  writingProfiles?: WritingStyleProfile[];
  activeStyleProfileId?: string;
}

// --- Knowledge Vault Types ---

export type SourceType =
  | "Upload File"
  | "URL Import"
  | "DOI Lookup"
  | "ISBN Book"
  | "PMID Biomedical"
  | "arXiv Preprint"
  | "OpenAlex Record"
  | "SSRN Paper"
  | "Zenodo Record"
  | "ResearchGate"
  | "Google Books"
  | "YouTube Video"
  | "Podcast Episode"
  | "Audio File"
  | "Video File"
  | "Image OCR"
  | "Manual Entry"
  | "Webpage"
  | "Journal Article"
  | "Book"
  | "Book Chapter"
  | "Conference Paper"
  | "Online Newspaper Article"
  | "Magazine Article"
  | "Research Report"
  | "Government Publication"
  | "Policy Document"
  | "Legal Document"
  | "Thesis"
  | "Dissertation"
  | "Working Paper"
  | "Dataset"
  | "Database"
  | "Video"
  | "Podcast"
  | "Interview"
  | "Image"
  | "Map"
  | "Software"
  | "AI Generated Content"
  | "PDF Upload"
  | "Personal Notes"
  | "Other";

export interface CitationAuthor {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  orcid?: string;
  affiliation?: string;
  email?: string;
  corresponding?: boolean;
  order: number;
}

export interface CitationPublicationDetails {
  journalName?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  articleNumber?: string;
  specialIssue?: string;
  publisher?: string;
  edition?: string;
  isbn?: string;
  issn?: string;
  eissn?: string;
  series?: string;
  seriesNumber?: string;
  conferenceName?: string;
  conferenceLocation?: string;
  conferenceDate?: string;
  proceedings?: string;
  reportNumber?: string;
  institution?: string;
  department?: string;
  university?: string;
  degree?: string;
  faculty?: string;
  supervisor?: string;
  coSupervisor?: string;
  websiteName?: string;
}

export interface CitationDates {
  publicationDate?: string;
  onlinePublicationDate?: string;
  lastUpdated?: string;
  accessDate?: string;
  createdDate?: string;
  archivedDate?: string;
}

export interface CitationIdentifiers {
  doi?: string;
  url?: string;
  permanentUrl?: string;
  shortUrl?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;
  ssrnId?: string;
  researchGateUrl?: string;
  zenodoDoi?: string;
  handleIdentifier?: string;
  openAlexId?: string;
  crossrefId?: string;
}

export interface CitationReliability {
  peerReviewed: "Yes" | "No" | "Unknown";
  evidenceLevel: "High" | "Medium" | "Low";
  publicationType: "Primary" | "Secondary" | "Tertiary";
  openAccess?: boolean;
  fundingSource?: string;
  conflictOfInterest?: string;
  retractionStatus?: "None" | "Retracted" | "Correction";
  factChecked?: boolean;
}

export interface CitationExtraction {
  fullText?: string;
  executiveSummary?: string;
  aiSummary?: string;
  importantQuotes?: string[];
  keyFindings?: string[];
  methodology?: string;
  researchQuestions?: string[];
  hypotheses?: string[];
  variables?: string[];
  results?: string;
  limitations?: string;
  recommendations?: string;
  conclusion?: string;
}

export interface CitationClassification {
  researchType?: "Qualitative" | "Quantitative" | "Mixed Methods" | "Experimental" | "Theoretical" | "Review" | "Meta-analysis" | "Case Study" | "Survey" | "Historical";
  methodology?: string;
  sampling?: string;
  population?: string;
  sampleSize?: string;
  analysisMethod?: string;
  softwareUsed?: string;
  framework?: string;
  theory?: string;
  model?: string;
  sdgMapping?: string[];
  unescoClassification?: string;
  oecdClassification?: string;
}

export interface CitationAIKnowledge {
  mainConcepts?: string[];
  namedEntities?: string[];
  relationships?: string[];
  topics?: string[];
  semanticEmbeddings?: string;
  linkedSources?: string[];
  similarSources?: string[];
  contradictingSources?: string[];
  supportingSources?: string[];
}

export interface CitationVerification {
  doiLookup?: boolean;
  crossref?: boolean;
  openAlex?: boolean;
  pubmed?: boolean;
  googleBooks?: boolean;
  orcid?: boolean;
  isbnVal?: boolean;
  brokenUrl?: boolean;
  duplicate?: boolean;
  missingMetadata?: boolean;
}

export interface CitationPersonalResearch {
  importance: number; // 1-5
  confidence?: "High" | "Medium" | "Low";
  readStatus: "Unread" | "Skimmed" | "Read" | "Synthesized";
  readingProgress?: number; // percentage
  priority: "Low" | "Medium" | "High" | "Urgent";
  collection?: string;
  folder?: string;
  project?: string;
  customTags?: string[];
  favorite?: boolean;
  pinned?: boolean;
  privacy: "Private" | "Public";
}

export interface CitationRelationship {
  id: string;
  targetFileId: string;
  targetTitle: string;
  relationshipType: "Supports" | "Contradicts" | "Extends" | "Replicates" | "Cites" | "Is Cited By" | "Uses Same Dataset" | "Same Theory" | "Same Methodology";
}

export interface ExtractionAuditItem {
  field: string;
  value: string;
  source: string;
  confidence: number;
  verified: boolean;
}

export interface CitationValidationError {
  id: string;
  severity: "error" | "warning";
  message: string;
  suggestedFix: string;
}

export interface CitationMetadata {
  sourceType: SourceType;
  title: string;
  subtitle?: string;
  shortDescription?: string;
  abstract?: string;
  keywords?: string[];
  subjectArea?: string;
  discipline?: string;
  researchDomain?: string;
  language?: string;
  originalLanguage?: string;
  country?: string;
  region?: string;
  institution?: string;
  organization?: string;
  publisher?: string;
  publishingPlatform?: string;
  websiteName?: string;
  authors: CitationAuthor[];
  publicationDetails: CitationPublicationDetails;
  dates: CitationDates;
  identifiers: CitationIdentifiers;
  reliability: CitationReliability;
  extraction: CitationExtraction;
  classification: CitationClassification;
  aiKnowledge: CitationAIKnowledge;
  verification: CitationVerification;
  personal: CitationPersonalResearch;
  relationships: CitationRelationship[];
  notes?: string;
  extractionAudit?: ExtractionAuditItem[];
  validationErrors?: CitationValidationError[];
}

export interface VaultFileOverview {
  title: string;
  abstract: string;
  author: string;
  year?: string;
  institutionOrJournal?: string;
  volumeIssue?: string;
  doiOrUrl?: string;
  chapters: { name: string; summary: string }[];
  keyTerms: string[];
  keyFindings?: string[];
  keyDataPoints?: string[];
  citationTag: string;
  bibtex?: string;
  
  // Extended Metadata Fields
  genre?: string;
  pages?: string;
  publisher?: string;
  issnIsbn?: string;
  arxivId?: string;
  pmid?: string;
  pmcid?: string;
  accessDate?: string;
  alternativeCitations?: { [style: string]: string };
}

export interface VaultChunk {
  id: string;
  fileId: string;
  content: string;
  sectionHint: string;
  index: number;
}

export interface VaultFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  isActive: boolean;
  status: "processing" | "ready" | "error";
  extractedText: string;
  parsedOverview?: VaultFileOverview;
  citationMetadata?: CitationMetadata;
  chunks: VaultChunk[];
  charCount: number;
  errorMessage?: string;
}

export interface KnowledgeVault {
  files: VaultFile[];
  lastUpdated: string;
}

// Stage 4 (target-workflow.md) — document-genre selection, asked immediately after
// workspace launch and before Stage 5's research-input fields. Distinct from
// `articleType` below, which is a methodology axis ("what kind of study"), not a
// document-genre axis ("what kind of document"). Empty string = not yet selected,
// same "unset" convention as `articleType`/other string fields on this interface.
export type OutputFormat =
  | "journal-article"
  | "research-paper"
  | "term-paper"
  | "newspaper-article"
  | "book-chapter"
  | "report"
  | "research-proposal";

export interface PaperProject {
  id: string;
  title: string;
  objectives: string;
  researchQuestions: string;
  researchGap: string;
  methodology: string;
  field: string;
  keywords: string;
  preferredJournalScope: string;
  articleType: string;
  outputFormat: OutputFormat | "";
  targetReferenceCount?: number; // Soft target (target-workflow.md Stage 5) — warn, never block
  dissertationMaterials: string;
  styleAspiration: string;
  authorDetails: string;
  authorName?: string;
  orcidId?: string;
  authorAffiliation?: string;
  authorEmail?: string;
  coAuthorName?: string;
  coAuthorOrcidId?: string;
  coAuthorAffiliation?: string;
  coAuthorEmail?: string;
  currentPhase: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "G1" | "G2" | "H" | "I";
  aiSettings: AISettings;
  
  // Project metadata
  status?: "Draft" | "Submitted" | "Accepted" | "Rejected";
  lastActivity?: string;
  lockedSections?: string[]; // Array of section names that are locked
  
  // Stored outputs of various phases
  groundingMap?: GroundingMap;
  dataSources?: DiscoveredDataSource[];
  targetJournal?: RecommendJournal;
  complianceRules?: ComplianceRules;
  sections: Record<string, string>; // Maps section keys e.g. "Abstract" to drafted text
  qcReport?: QCReport;
  submissionPack?: SubmissionPack;

  // New Analytics & Tracking fields
  usageLogs?: Array<{
    timestamp: string;
    provider: string;
    model: string;
    inputWords: number;
    outputWords: number;
    estimatedCost: number;
    taskType: string;
  }>;
  costMetrics?: {
    totalCost: number;
    totalCalls: number;
  };
  modelPreferences?: {
    grounding?: string;
    dataDiscovery?: string;
    journalDiscovery?: string;
    requirements?: string;
    drafting?: string;
    qc?: string;
    submissionPack?: string;
  };

  // Revisions & response logs
  versions?: ProjectVersion[];
  responseHistory?: ResponseLogItem[];
  
  // Personalized writing style settings
  styleLearningEnabled?: boolean;
  activeStyleProfileId?: string;

  // Manuscript editor approval
  manuscriptApproved?: boolean;

  // Knowledge Vault
  knowledgeVault?: KnowledgeVault;
}

export const WORKFLOW_PHASES = [
  { id: "A", name: "Intake", desc: "Define core research inputs" },
  { id: "B", name: "Grounding", desc: "Anchor paper draft in doctoral thesis" },
  { id: "C", name: "Data Discovery", desc: "Qualitative/Quantitative sources" },
  { id: "D", name: "Journal Match", desc: "Discover Scopus/WoS indexed journals" },
  { id: "E", name: "Requirements", desc: "Author guideline checklist parsing" },
  { id: "F", name: "Drafting", desc: "Guided section co-writer" },
  { id: "G", name: "Quality Control", desc: "Peer review compliance audit" },
  { id: "G1", name: "Redrafting", desc: "Re-draft based on peer review & pre-flight control" },
  { id: "G2", name: "Manuscript Editor", desc: "Edit, approve & download final manuscript" },
  { id: "H", name: "Submission Pack", desc: "Compile cover letter & checklists" },
  { id: "I", name: "Submission Support", desc: "Portal trackers & portal letters" }
] as const;
