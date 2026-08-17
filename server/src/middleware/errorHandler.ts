import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error("Unhandled Error:", err);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: (err as any).errors,
    });
    return;
  }

  // Fallback for generic errors
  const status = (err as any).status || 500;
  const message = err.message || "Internal Server Error";
  
  res.status(status).json({ error: message });
}
