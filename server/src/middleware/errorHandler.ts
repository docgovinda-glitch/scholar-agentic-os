import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { getMaxUploadMb } from "./uploadGuard.ts";

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error("Unhandled Error:", err);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: (err as any).errors,
    });
    return;
  }

  const errCode = (err as { code?: string }).code;
  const errType = (err as { type?: string }).type;
  const errStatus = (err as { status?: number; statusCode?: number }).status || (err as { statusCode?: number }).statusCode;

  if (errCode === "LIMIT_FILE_SIZE" || errType === "entity.too.large" || errStatus === 413) {
    const maxMb = getMaxUploadMb();
    res.status(413).json({
      error: `File exceeds the ${maxMb} MB upload limit. Please upload a file smaller than ${maxMb} MB.`,
      code: "LIMIT_FILE_SIZE",
      maxUploadMb: maxMb,
    });
    return;
  }

  // Fallback for generic errors
  const status = errStatus || 500;
  const message = err.message || "Internal Server Error";
  
  res.status(status).json({ error: message });
}
