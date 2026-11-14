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
/** One upload limit for everyone: the server's own ceiling (HARD_MAX_UPLOAD_MB_CEILING). */
export const BRIEF_MAX_UPLOAD_MB = 10;

export function validateBriefFile(
  file: File,
  options?: { maxBytes?: number; isAdmin?: boolean }
): FileValidationResult {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }
  if (file.size === 0) {
    return { valid: false, error: "This file is empty. Choose another file or paste the brief text instead." };
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

  const maxBytes = options?.maxBytes ?? BRIEF_MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `This file is ${sizeMb} MB; the upload limit is ${maxMb} MB. Upload a smaller file or paste the brief text instead.`,
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
