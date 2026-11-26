

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
