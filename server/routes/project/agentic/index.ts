import express from "express";
import { rejectClientCredentials } from "../../../src/middleware/rejectClientCredentials.ts";
import { evidenceRoutes } from "./evidenceRoutes.ts";
import { draftingRoutes } from "./draftingRoutes.ts";
import { reviewRoutes } from "./reviewRoutes.ts";
import { journalProfileRoutes } from "./journalProfileRoutes.ts";
import { referenceRoutes } from "./referenceRoutes.ts";
import { citationSupportRoutes } from "./citationSupportRoutes.ts";

export const agenticRouter = express.Router({ mergeParams: true });

// Reject client-side API credentials bypass
agenticRouter.use(rejectClientCredentials);

// Mount modular sub-routers
agenticRouter.use(evidenceRoutes);
agenticRouter.use(draftingRoutes);
agenticRouter.use(reviewRoutes);
agenticRouter.use(journalProfileRoutes);
agenticRouter.use(referenceRoutes);
agenticRouter.use(citationSupportRoutes);

// Export router alias for backward compatibility
export { agenticRouter as router };

// Re-export all sub-modules, types, and helpers for 100% backward compatibility
export * from "./types.ts";
export * from "./helpers.ts";
export * from "./evidenceRoutes.ts";
export * from "./draftingRoutes.ts";
export * from "./reviewRoutes.ts";
