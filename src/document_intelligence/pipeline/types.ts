/**
 * Document Intelligence Engine - Pipeline Contracts
 *
 * Cycle 1 defines deterministic pipeline stage interfaces and execution contracts.
 */

import type {
  DocumentIntelligencePartialModel,
  Document,
  CanonicalEntityId,
} from "../model/types";

/** Supported pipeline stage ids (extensible) */
export type PipelineStageId =
  | "validate"
  | "identify_format"
  | "parse"
  | "normalize"
  | "extract_metadata"
  | "extract_structure"
  | "extract_references"
  | "generate_model"
  | "store"
  | "index_prep";

export interface DocumentIntelligenceInput {
  /** Stable document id, if caller already has it. Otherwise engine will derive one deterministically. */
  documentId?: CanonicalEntityId;

  /** Raw bytes or an object storage key (Cycle 1 contract only; no implementation). */
  content?: Uint8Array;
  objectStorageKey?: string;

  /** Original source metadata */
  source: {
    filename?: string;
    mimeType?: string;
    path?: string;
    uploadId?: string;
  };

  /** Optional cancellation/progress hooks */
  signal?: AbortSignal;
  onProgress?: (info: { stageId: PipelineStageId; progress: number; message?: string }) => void;

  /** Optional engine options */
  options?: {
    // placeholder for future deterministic behaviors/config
    maxPages?: number;
    maxBytes?: number;
  };

  /** Diagnostics bag for deterministic replay/testing */
  diagnostics?: {
    warnings?: string[];
  };

  /** Extensible metadata bag */
  [key: string]: unknown;
}

export interface PipelineStageResult {
  stageId: PipelineStageId;
  ok: boolean;
  warnings?: string[];
  errors?: string[];
}

export interface DocumentIntelligencePipelineOutput {
  ok: true;
  document: Document;
  diagnostics?: {
    stages: PipelineStageResult[];
    warnings?: string[];
    startedAt?: string;
    finishedAt?: string;
  };
}

export interface DocumentIntelligencePipelineFailure {
  ok: false;
  error: {
    type:
      | "UNSUPPORTED_FORMAT"
      | "CORRUPTED_FILE"
      | "ENCRYPTED_PDF_ENCOUNTERED"
      | "MISSING_METADATA"
      | "ENCODING_ERROR"
      | "OVERSIZED_FILE"
      | "TIMEOUT"
      | "PARTIAL_PARSING"
      | "INTERNAL_ERROR";
    message: string;
    code?: string;
    cause?: unknown;
  };
  diagnostics?: {
    stages: PipelineStageResult[];
    warnings?: string[];
  };
}

export type DocumentIntelligencePipelineResult =
  | DocumentIntelligencePipelineOutput
  | DocumentIntelligencePipelineFailure;

export interface PipelineStageContext {
  documentId: CanonicalEntityId;
  stageId: PipelineStageId;
  signal?: AbortSignal;
  onProgress?: (info: { stageId: PipelineStageId; progress: number; message?: string }) => void;

  // Deterministic partial model being built
  partial: DocumentIntelligencePartialModel;

  // Diagnostics
  warnings: string[];
}

/**
 * Deterministic stage contract.
 * Each stage must be independently testable.
 */
export interface DocumentIntelligenceStage {
  stageId: PipelineStageId;

  execute(input: DocumentIntelligenceInput, context: PipelineStageContext): Promise<DocumentIntelligencePartialModel>;
}

/**
 * Aggregator helpers (pure)
 * - Cycle 1 primarily defines interfaces; implementations come in later cycles.
 */
export interface ModelGenerator {
  generate(input: DocumentIntelligenceInput, partial: DocumentIntelligencePartialModel): Promise<Document>;
}
