/**
 * Typed Project State Schema and Safe Answer Field Accessor
 * 
 * Provides robust decoding for persisted answers payloads across client and server.
 * Replaces crash-prone raw JSON parsing of answers payloads with resilient fallback parsing.
 */

import { parseAndRepairLLMJson } from "./llmJsonParser";

/**
 * Safely parses an answer field of any type into type T, falling back to a provided default.
 * Handles:
 * 1. Pre-parsed objects/arrays (returned directly)
 * 2. JSON strings (with AST repair for malformed quotes, trailing commas, and LLM reasoning blocks)
 * 3. Null/undefined/empty string values (gracefully returns fallback)
 */
export function safeParseAnswerField<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === "") {
    return fallback;
  }

  // Already parsed object/array
  if (typeof raw !== "string") {
    return raw as T;
  }

  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "undefined") {
    return fallback;
  }

  try {
    return parseAndRepairLLMJson<T>(trimmed, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Interface representing standard typed fields stored within project.answers.
 */
export interface TypedProjectState {
  identified_gaps: string[];
  approved_vault_sources: unknown[];
  vault_sources: unknown[];
  approved_external_sources: unknown[];
  pending_external_sources: unknown[];
  primary_datasets: unknown[];
  additional_data: unknown[];
  user_datasets: unknown[];
  evidence_matrix: unknown[];
  thematic_clusters: unknown[];
  discovered_journals: unknown[];
  manuscript_draft: unknown[];
  assembled_draft: unknown;
  citation_audit_report: unknown[];
  word_budget_blueprint: unknown;
  drafted_subsections: Record<string, unknown>;
  peer_review_critiques: unknown[];
  rebuttal_matrix: unknown[];
  assignment_analysis: unknown;
  assignment_thinking_map: unknown;
  assignment_submission_report: unknown;
  assignment_citation_audit: unknown;
  assignment_flow_audit: unknown;
  journal_constraints: Record<string, unknown>;
  journal_requirements_extracted: Record<string, unknown>;
  get<T>(key: string, fallback: T): T;
}

/**
 * Reads project.answers into a strongly-typed state object with safe defaults.
 */
export function readTypedProjectState(answers: Record<string, unknown> | undefined | null): TypedProjectState {
  const safeAnswers = answers || {};

  return {
    identified_gaps: safeParseAnswerField<string[]>(safeAnswers["identified_gaps"], []),
    approved_vault_sources: safeParseAnswerField<unknown[]>(safeAnswers["approved_vault_sources"], []),
    vault_sources: safeParseAnswerField<unknown[]>(safeAnswers["vault_sources"], []),
    approved_external_sources: safeParseAnswerField<unknown[]>(safeAnswers["approved_external_sources"], []),
    pending_external_sources: safeParseAnswerField<unknown[]>(safeAnswers["pending_external_sources"], []),
    primary_datasets: safeParseAnswerField<unknown[]>(safeAnswers["primary_datasets"], []),
    additional_data: safeParseAnswerField<unknown[]>(safeAnswers["additional_data"], []),
    user_datasets: safeParseAnswerField<unknown[]>(safeAnswers["user_datasets"], []),
    evidence_matrix: safeParseAnswerField<unknown[]>(safeAnswers["evidence_matrix"], []),
    thematic_clusters: safeParseAnswerField<unknown[]>(safeAnswers["thematic_clusters"], []),
    discovered_journals: safeParseAnswerField<unknown[]>(safeAnswers["discovered_journals"], []),
    manuscript_draft: safeParseAnswerField<unknown[]>(safeAnswers["manuscript_draft"], []),
    assembled_draft: safeParseAnswerField<unknown>(safeAnswers["assembled_draft"], null),
    citation_audit_report: safeParseAnswerField<unknown[]>(safeAnswers["citation_audit_report"], []),
    word_budget_blueprint: safeParseAnswerField<unknown>(safeAnswers["word_budget_blueprint"], null),
    drafted_subsections: safeParseAnswerField<Record<string, unknown>>(safeAnswers["drafted_subsections"], {}),
    peer_review_critiques: safeParseAnswerField<unknown[]>(safeAnswers["peer_review_critiques"] || safeAnswers["peer_review_critique"], []),
    rebuttal_matrix: safeParseAnswerField<unknown[]>(safeAnswers["rebuttal_matrix"], []),
    assignment_analysis: safeParseAnswerField<unknown>(safeAnswers["assignment_analysis"], null),
    assignment_thinking_map: safeParseAnswerField<unknown>(safeAnswers["assignment_thinking_map"], null),
    assignment_submission_report: safeParseAnswerField<unknown>(safeAnswers["assignment_submission_report"], null),
    assignment_citation_audit: safeParseAnswerField<unknown>(safeAnswers["assignment_citation_audit"], null),
    assignment_flow_audit: safeParseAnswerField<unknown>(safeAnswers["assignment_flow_audit"], null),
    journal_constraints: safeParseAnswerField<Record<string, unknown>>(safeAnswers["journal_constraints"], {}),
    journal_requirements_extracted: safeParseAnswerField<Record<string, unknown>>(safeAnswers["journal_requirements_extracted"], {}),
    get<T>(key: string, fallback: T): T {
      return safeParseAnswerField<T>(safeAnswers[key], fallback);
    },
  };
}
