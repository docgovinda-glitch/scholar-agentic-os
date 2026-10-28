import type { Request, Response, NextFunction, RequestHandler } from "express";
import multer from "multer";

export const DEFAULT_MAX_UPLOAD_MB = 10;
export const HARD_MAX_UPLOAD_MB_CEILING = 10;
export const HEAVY_PARSE_RETRY_AFTER_SECONDS = 5;

const HEAVY_EXTENSIONS = new Set([
  "pdf",
  "xlsx",
  "xls",
  "docx",
  "doc",
  "pptx",
  "ppt",
]);

const HEAVY_MIME_PATTERNS = [
  /^application\/pdf$/i,
  /^application\/msword$/i,
  /^application\/vnd\.ms-excel$/i,
  /^application\/vnd\.ms-powerpoint$/i,
  /^application\/vnd\.openxmlformats-officedocument\./i,
];

/**
 * Returns the configured maximum upload size in megabytes (defaults to 10 MB,
 * hard-clamped to [1, HARD_MAX_UPLOAD_MB_CEILING] in code so a misconfigured
 * environment variable cannot reopen the 512 MB OOM vector).
 */
export function getMaxUploadMb(): number {
  const raw = Number(process.env.MAX_UPLOAD_MB);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(raw, HARD_MAX_UPLOAD_MB_CEILING);
  }
  return DEFAULT_MAX_UPLOAD_MB;
}

/**
 * Returns the configured maximum upload size in bytes.
 */
export function getMaxUploadBytes(): number {
  return Math.floor(getMaxUploadMb() * 1024 * 1024);
}

/**
 * Determines whether an uploaded file triggers a memory-intensive parser
 * (PDF, XLSX/XLS, DOCX/DOC, PPTX/PPT).
 */
export function isHeavyParseFile(file?: Express.Multer.File): boolean {
  if (!file) return false;
  const filename = (file.originalname || "").toLowerCase();
  const ext = filename.includes(".") ? filename.split(".").pop() || "" : "";
  if (HEAVY_EXTENSIONS.has(ext)) {
    return true;
  }
  const mime = (file.mimetype || "").toLowerCase();
  return HEAVY_MIME_PATTERNS.some((re) => re.test(mime));
}

let activeHeavyParses = 0;
const MAX_CONCURRENT_HEAVY_PARSES = 1;

export function tryAcquireHeavyParseSlot(): (() => void) | null {
  if (activeHeavyParses >= MAX_CONCURRENT_HEAVY_PARSES) {
    return null;
  }
  activeHeavyParses += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      activeHeavyParses = Math.max(0, activeHeavyParses - 1);
    }
  };
}

export function __getActiveHeavyParsesForTests(): number {
  return activeHeavyParses;
}

export function __resetHeavyParseGuardForTests(): void {
  activeHeavyParses = 0;
}

/**
 * Express middleware that enforces at most 1 heavy document parse (PDF/XLSX/DOCX/PPTX)
 * across the entire server at a time. Extra concurrent requests receive HTTP 503 with Retry-After.
 */
export const heavyParseConcurrencyGuard: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!isHeavyParseFile(file)) {
    next();
    return;
  }

  const release = tryAcquireHeavyParseSlot();
  if (!release) {
    res.setHeader("Retry-After", String(HEAVY_PARSE_RETRY_AFTER_SECONDS));
    res.status(503).json({
      error: "Server is currently processing another document. Please retry in a few seconds.",
      retryAfterSeconds: HEAVY_PARSE_RETRY_AFTER_SECONDS,
    });
    return;
  }

  res.once("finish", release);
  res.once("close", release);
  next();
};

/**
 * Creates a single-file Multer memoryStorage middleware that reads MAX_UPLOAD_MB (default 10 MB)
 * and translates LIMIT_FILE_SIZE errors into a clear HTTP 413 response.
 * When `enforceHeavyParseLimit` is true, also applies `heavyParseConcurrencyGuard`.
 */
export function createSingleFileUploadMiddleware(
  fieldName = "file",
  options: { enforceHeavyParseLimit?: boolean } = {}
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const maxMb = getMaxUploadMb();
    const maxBytes = getMaxUploadBytes();
    const uploader = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: maxBytes,
      },
    }).single(fieldName);

    uploader(req, res, (err: unknown) => {
      if (err) {
        if (
          err instanceof multer.MulterError &&
          err.code === "LIMIT_FILE_SIZE"
        ) {
          res.status(413).json({
            error: `File exceeds the ${maxMb} MB upload limit. Please upload a file smaller than ${maxMb} MB.`,
            code: "LIMIT_FILE_SIZE",
            maxUploadMb: maxMb,
          });
          return;
        }
        if (
          typeof err === "object" &&
          err !== null &&
          (err as { code?: string }).code === "LIMIT_FILE_SIZE"
        ) {
          res.status(413).json({
            error: `File exceeds the ${maxMb} MB upload limit. Please upload a file smaller than ${maxMb} MB.`,
            code: "LIMIT_FILE_SIZE",
            maxUploadMb: maxMb,
          });
          return;
        }
        next(err);
        return;
      }

      if (options.enforceHeavyParseLimit) {
        heavyParseConcurrencyGuard(req, res, next);
        return;
      }

      next();
    });
  };
}

/**
 * Drop-in replacement for `multer({ storage: multer.memoryStorage(), limits: ... })`
 * that honors MAX_UPLOAD_MB (10 MB default), returns 413 on oversize uploads,
 * and optionally enforces the server-wide heavy-parse concurrency guard.
 */
export function createUploadInstance(options: { enforceHeavyParseLimit?: boolean } = {}): {
  single: (fieldName?: string) => RequestHandler;
} {
  return {
    single: (fieldName = "file") => createSingleFileUploadMiddleware(fieldName, options),
  };
}

