/**
 * Export pipeline types (docs 33-EXPORT-ARCHITECTURE.md §3: five-stage pipeline).
 * Stages: pre-flight, resolution, layout, render, verify.
 */

import type { CanonicalDocument } from "../../desk/types";

import type { AcademicExportOptions } from "./academicPdfCompiler";

export type ExportFormat = "docx" | "odt" | "pdf" | "latex" | "typst" | "camera_ready_pdf";

export interface ExportInput {
  document: CanonicalDocument;
  format: ExportFormat;
  title: string;
  author?: string;
  discipline?: string;
  includeTableOfContents?: boolean;
  templateName?: string; // e.g., "APA7", "Chicago", project-specific
  academicOptions?: AcademicExportOptions;
  trackChanges?: boolean;
}

export interface ExportResult {
  format: ExportFormat;
  data: Buffer;
  filename: string;
  byteSize: number;
}

export interface PreflightReport {
  isReady: boolean;
  issues: string[];
  warnings: string[];
}

export interface ExportMetadata {
  title: string;
  author?: string;
  created: Date;
  modified: Date;
  discipline?: string;
}
