import express from "express";
import type { CitationStyleRegistry } from "../../src/citation_compliance/formattingEngine.ts";

/**
 * Legacy AI routes — all /api/generate* endpoints have been removed.
 *
 * These routes were called exclusively by the legacy client (src/App.tsx),
 * which has been retired (docs/06-decisions/61-CLIENT-CONSOLIDATION.md).
 *
 * Desk uses server/routes/studio.ts for all AI functionality.
 */

export function registerAIRoutes(app: express.Express, aiAbuseLimit: any, citationStyleRegistry: CitationStyleRegistry): void {
  // All legacy routes deleted. Desk uses server/routes/studio.ts instead.
}
