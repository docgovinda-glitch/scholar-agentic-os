/**
 * Document Parser Service
 * Provides client-side file reading, size & type validation,
 * metadata extraction, and safe sanitization for brief documents.
 */

import {
  extractWordCountFromText,
  extractLevelFromText,
  extractCitationStyleFromText,
  stripCircularReferences,
} from "../utils/briefExtractor";

export interface BriefMetadataResult {
  text: string;
  detectedWordCount?: number;
  detectedLevel?: "undergraduate" | "postgraduate";
  detectedCitation?: string;
  lineCount: number;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt", ".md"];
const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
];

/**
 * Validates if the file matches supported brief document extensions and size limits.
 */
export function validateBriefFile(
  file: File,
  options?: { maxBytes?: number; isAdmin?: boolean }
): FileValidationResult {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  const name = file.name.toLowerCase();
  const hasSupportedExt = SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  const hasSupportedMime = file.type ? SUPPORTED_MIME_TYPES.includes(file.type) : true;

  if (!hasSupportedExt && !hasSupportedMime) {
    return {
      valid: false,
      error: "Unsupported file type. Please upload a PDF, DOCX, DOC, TXT or MD document.",
    };
  }

  // If not admin, check byte limits
  if (!options?.isAdmin && options?.maxBytes && file.size > options.maxBytes) {
    const maxMb = Math.round(options.maxBytes / (1024 * 1024));
    return {
      valid: false,
      error: `File size exceeds the ${maxMb}MB limit for your current account tier.`,
    };
  }

  return { valid: true };
}

/**
 * Parses client-side metadata from extracted brief text safely.
 */
export function parseBriefMetadata(text: string): BriefMetadataResult {
  const sanitizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = sanitizedText.split("\n").filter((l) => l.trim().length > 0);

  const detectedWordCount = extractWordCountFromText(sanitizedText);
  const detectedLevel = extractLevelFromText(sanitizedText);
  const detectedCitation = extractCitationStyleFromText(sanitizedText);

  const result: BriefMetadataResult = {
    text: sanitizedText,
    detectedWordCount,
    detectedLevel,
    detectedCitation,
    lineCount: lines.length,
  };

  return stripCircularReferences(result);
}

/**
 * Reads plain text directly in the browser if file is a .txt file.
 */
export async function readPlainTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(new Error("Could not read document file."));
    };
    reader.readAsText(file);
  });
}
